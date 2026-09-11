import {
  formatExpr,
  formatLiteral,
  type ColumnDef,
  type CreateIndexStatement,
  type CreateStatement,
  type DeleteStatement,
  type Expr,
  type InsertStatement,
  type SelectStatement,
  type Statement,
  type TransactionStatement,
} from "@/lib/prqlite/ast";
import { analyze, type Analysis } from "@/lib/prqlite/analyzer";
import { Catalog, type TableSchema } from "@/lib/prqlite/catalog";
import { PrqlError } from "@/lib/prqlite/errors";
import { tokenize, type Token } from "@/lib/prqlite/lexer";
import { parse } from "@/lib/prqlite/parser";
import {
  PAGE_SIZE,
  PageAllocator,
  TableHeap,
  decodeTuple,
  encodeTuple,
  tupleWidth,
  type RecordID,
  type SQLValue,
  type Tuple,
} from "@/lib/prqlite/storage";

// Port of PRQLite src/virtual_machine/*_operator.cpp, executor_engine.cpp,
// src/transaction/transaction_manager.cpp and the REPL in src/main.cpp.

export type OperatorName =
  | "SeqScan"
  | "Filter"
  | "Projection"
  | "Insert"
  | "Delete"
  | "CreateTable"
  | "CreateIndex"
  | "Transaction";

export interface PlanNode {
  operator: OperatorName;
  detail: string;
  child: PlanNode | null;
}

export interface TraceEvent {
  operator: OperatorName | "Txn";
  action:
    | "emit"
    | "pass"
    | "reject"
    | "insert"
    | "delete"
    | "undo-insert"
    | "undo-delete";
  rid?: RecordID;
  values?: SQLValue[];
}

export interface Stages {
  tokens?: Token[];
  ast?: Statement;
  analysis?: Analysis;
  plan?: PlanNode;
}

export interface RunResult {
  sql: string;
  stages: Stages;
  /** Result header for SELECT. */
  columns: ColumnDef[] | null;
  rows: SQLValue[][];
  /** Row count for DELETE. */
  affected: number | null;
  /** BEGIN / COMMIT / ROLLBACK acknowledgement. */
  message: string | null;
  /** Honest notes about parsed-but-unimplemented features. */
  notes: string[];
  trace: TraceEvent[];
  error: PrqlError | null;
  /** Exactly what the C++ REPL prints for this statement (stdout and stderr, in order). */
  output: string;
}

const executorError = (message: string) => new PrqlError("executor", message);

/** REPL input handling: a statement ends at ';', the rest of that line is dropped, lines join with ' '. */
export function splitStatements(text: string): {
  statements: string[];
  pending: string | null;
} {
  const statements: string[] = [];
  let accumulated = "";
  for (const raw of text.split("\n")) {
    const cut = raw.indexOf(";");
    const line = cut === -1 ? raw : raw.slice(0, cut);
    accumulated += (accumulated === "" ? "" : " ") + line;
    if (cut !== -1) {
      statements.push(accumulated);
      accumulated = "";
    }
  }
  return {
    statements,
    pending: accumulated.trim() === "" ? null : accumulated,
  };
}

// std::left << std::setw(15)
const cell = (text: string) => text.padEnd(15);
export const formatValue = (value: SQLValue) =>
  typeof value === "boolean" ? (value ? "true" : "false") : String(value);
const headerLine = (columns: ColumnDef[]) =>
  `${columns.map((c) => cell(c.name)).join("")}\n${"-".repeat(49)}\n`;
const rowLine = (row: SQLValue[]) =>
  `${row.map((v) => cell(formatValue(v))).join("")}\n`;

/** std::stoi: leading digits, and a std::out_of_range beyond 32 bits. */
function stoi(lexeme: string): number {
  const n = Number.parseInt(lexeme, 10);
  if (n > 2147483647 || n < -2147483648)
    throw executorError("stoi: out of range");
  return n;
}

function literalValue(token: Token): SQLValue {
  if (token.type === "NUMBER") return stoi(token.lexeme);
  if (token.type === "STRING") return token.lexeme;
  return token.type === "TRUE";
}

/**
 * FilterOperator: column positions are resolved once (init), then the WHERE tree is
 * evaluated per tuple. Both operands are always evaluated, as in evaluateExpr().
 */
function compileWhere(
  where: Expr | null,
  table: TableSchema,
): (values: SQLValue[]) => boolean {
  if (!where) return () => true;
  const index = new Map(table.columns.map((c, i) => [c.name, i]));

  const evaluate = (expr: Expr, values: SQLValue[]): SQLValue => {
    if (expr.kind === "identifier") {
      const i = index.get(expr.name);
      if (i === undefined)
        throw executorError(`Column not found in WHERE clause: ${expr.name}`);
      return values[i]!;
    }
    if (expr.kind === "literal") return literalValue(expr.token);

    const l = evaluate(expr.left, values);
    const r = evaluate(expr.right, values);
    switch (expr.op) {
      case "=":
        return l === r;
      case "!=":
        return l !== r;
      case ">":
        return l > r;
      case "<":
        return l < r;
      case ">=":
        return l >= r;
      case "<=":
        return l <= r;
      case "AND":
        return (l as boolean) && (r as boolean);
      case "OR":
        return (l as boolean) || (r as boolean);
    }
  };

  // consider(): only a boolean true keeps the tuple.
  return (values) => evaluate(where, values) === true;
}

interface UndoAction {
  kind: "undo-insert" | "undo-delete";
  heap: TableHeap;
  tuple: Tuple;
  values: SQLValue[];
}

class TransactionManager {
  private active = false;
  private nextId = 1;
  private undo: UndoAction[] = [];
  txnId = 0;

  get isActive() {
    return this.active;
  }

  begin() {
    if (this.active)
      throw executorError(
        "TRANSACTION ERROR: BEGIN called while a transaction is already active.",
      );
    this.txnId = this.nextId++;
    this.active = true;
  }

  commit() {
    this.ensureActive("COMMIT");
    this.undo = [];
    this.active = false;
  }

  /** Runs the undo closures in reverse — the only order that rebuilds the prior state. */
  rollback(trace: TraceEvent[]) {
    this.ensureActive("ROLLBACK");
    for (const action of [...this.undo].reverse()) {
      if (action.kind === "undo-insert")
        action.heap.deleteTuple(action.tuple.rid);
      else action.heap.restoreTuple(action.tuple);
      trace.push({
        operator: "Txn",
        action: action.kind,
        rid: action.tuple.rid,
        values: action.values,
      });
    }
    this.undo = [];
    this.active = false;
  }

  recordInsert(heap: TableHeap, tuple: Tuple, values: SQLValue[]) {
    this.ensureActive("INSERT");
    this.undo.push({ kind: "undo-insert", heap, tuple, values });
  }

  recordDelete(heap: TableHeap, tuple: Tuple, values: SQLValue[]) {
    this.ensureActive("DELETE");
    this.undo.push({ kind: "undo-delete", heap, tuple, values });
  }

  private ensureActive(action: string) {
    if (!this.active)
      throw executorError(
        `TRANSACTION ERROR: ${action} called without an active transaction.`,
      );
  }
}

export class Database {
  private readonly catalog = new Catalog();
  private readonly allocator = new PageAllocator();
  private readonly heaps = new Map<number, TableHeap>();
  private readonly txn = new TransactionManager();

  get inTransaction(): boolean {
    return this.txn.isActive;
  }

  tables(): { schema: TableSchema; heap: TableHeap }[] {
    return this.catalog
      .list()
      .map((schema) => ({ schema, heap: this.heapFor(schema) }));
  }

  /** Runs one statement (text up to, not including, its ';') through every stage. */
  execute(sql: string): RunResult {
    const r: RunResult = {
      sql,
      stages: {},
      columns: null,
      rows: [],
      affected: null,
      message: null,
      notes: [],
      trace: [],
      error: null,
      output: "",
    };
    try {
      try {
        r.stages.tokens = tokenize(sql);
      } catch (e) {
        // Parser::insert logs lexer failures to stderr before rethrowing.
        if (e instanceof PrqlError)
          r.output += `Runtime error in creating LEXER: ${e.message}\n`;
        throw e;
      }
      r.stages.ast = parse(r.stages.tokens);
      r.stages.analysis = analyze(r.stages.ast, this.catalog);
      this.run(r.stages.ast, r.stages.analysis, r);
    } catch (e) {
      r.error = e instanceof PrqlError ? e : executorError(String(e));
      r.output += `Error: ${r.error.message}\n`;
    }
    return r;
  }

  private run(stmt: Statement, analysis: Analysis, r: RunResult) {
    switch (stmt.kind) {
      case "select":
        return this.select(stmt, analysis, r);
      case "insert":
        return this.insert(stmt, analysis, r);
      case "delete":
        return this.delete(stmt, analysis, r);
      case "create":
        return this.create(stmt, r);
      case "createIndex":
        return this.createIndex(stmt, r);
      case "transaction":
        return this.transaction(stmt, r);
    }
  }

  private heapFor(table: TableSchema): TableHeap {
    const heap = this.heaps.get(table.id);
    if (!heap)
      throw executorError(
        `BACKEND ERROR: CAN'T FIND TABLE MANAGER FOR TABLE_ID${table.id}`,
      );
    return heap;
  }

  private scanPlan(table: TableSchema, where: Expr | null): PlanNode {
    const heap = this.heapFor(table);
    const scan: PlanNode = {
      operator: "SeqScan",
      detail: `${table.name} · ${heap.pages.length} page${heap.pages.length === 1 ? "" : "s"} · ${heap.totalTuples} tuples`,
      child: null,
    };
    return {
      operator: "Filter",
      detail: where
        ? `WHERE ${formatExpr(where)}`
        : "no WHERE — every tuple passes",
      child: scan,
    };
  }

  /** runWriteStatement(): writes outside BEGIN get their own transaction; failures roll it back. */
  private runWrite(r: RunResult, action: () => void) {
    const auto = !this.txn.isActive;
    if (auto) this.txn.begin();
    try {
      action();
      if (auto) this.txn.commit();
    } catch (e) {
      if (auto && this.txn.isActive) this.txn.rollback(r.trace);
      throw e;
    }
  }

  private select(stmt: SelectStatement, analysis: Analysis, r: RunResult) {
    const table = analysis.table!;
    const heap = this.heapFor(table);
    const filter = this.scanPlan(table, stmt.where);
    r.stages.plan = stmt.selectStar
      ? filter
      : {
          operator: "Projection",
          detail: analysis.resolvedColumns.map((c) => c.name).join(", "),
          child: filter,
        };

    if (stmt.orderBy !== null) {
      r.notes.push(
        `ORDER BY ${stmt.orderBy} is parsed and bound, but PRQLite has no sort operator yet — rows come back in scan order.`,
      );
    }
    if (stmt.limit !== null) {
      r.notes.push(
        `LIMIT ${stmt.limit} is parsed, but PRQLite has no limit operator yet — every matching row is returned.`,
      );
    }

    r.columns = analysis.resolvedColumns;
    r.output += headerLine(r.columns);

    const keep = compileWhere(stmt.where, table);
    const projection = analysis.resolvedColumns.map((c) =>
      table.columns.findIndex((t) => t.name === c.name),
    );

    for (const tuple of heap.scan()) {
      const values = decodeTuple(tuple.data, table.columns);
      r.trace.push({
        operator: "SeqScan",
        action: "emit",
        rid: tuple.rid,
        values,
      });
      if (!keep(values)) {
        r.trace.push({ operator: "Filter", action: "reject", rid: tuple.rid });
        continue;
      }
      r.trace.push({ operator: "Filter", action: "pass", rid: tuple.rid });

      let row = values;
      if (!stmt.selectStar) {
        row = projection.map((i) => values[i]!);
        r.trace.push({
          operator: "Projection",
          action: "emit",
          rid: tuple.rid,
          values: row,
        });
      }
      r.rows.push(row);
      r.output += rowLine(row);
    }
    r.output += `(${r.rows.length} rows)\n`;
  }

  private insert(stmt: InsertStatement, analysis: Analysis, r: RunResult) {
    const table = analysis.table!;
    const heap = this.heapFor(table);
    r.stages.plan = {
      operator: "Insert",
      detail: `${table.name} ← (${stmt.values.map(formatLiteral).join(", ")})`,
      child: null,
    };

    this.runWrite(r, () => {
      const values = stmt.values.map(literalValue);
      const data = encodeTuple(values, table.columns);
      try {
        const rid = heap.createTuple(data);
        this.txn.recordInsert(
          heap,
          { rid, data, slotOffset: 0, slotSize: data.length },
          values,
        );
        r.trace.push({ operator: "Insert", action: "insert", rid, values });
      } catch (e) {
        r.output += "EXECUTOR ERROR: CANT ADD TUPLE\n";
        throw e;
      }
    });
  }

  private delete(stmt: DeleteStatement, analysis: Analysis, r: RunResult) {
    const table = analysis.table!;
    const heap = this.heapFor(table);
    r.stages.plan = {
      operator: "Delete",
      detail: table.name,
      child: this.scanPlan(table, stmt.where),
    };

    this.runWrite(r, () => {
      const keep = compileWhere(stmt.where, table);
      let affected = 0;
      for (const tuple of heap.scan()) {
        const values = decodeTuple(tuple.data, table.columns);
        r.trace.push({
          operator: "SeqScan",
          action: "emit",
          rid: tuple.rid,
          values,
        });
        if (!keep(values)) {
          r.trace.push({
            operator: "Filter",
            action: "reject",
            rid: tuple.rid,
          });
          continue;
        }
        r.trace.push({ operator: "Filter", action: "pass", rid: tuple.rid });
        try {
          heap.deleteTuple(tuple.rid);
          this.txn.recordDelete(heap, tuple, values);
        } catch {
          throw executorError("EXECUTOR ERROR: Delete Operation Failed.");
        }
        r.trace.push({
          operator: "Delete",
          action: "delete",
          rid: tuple.rid,
          values,
        });
        affected++;
      }
      r.affected = affected;
      r.output += `(${affected} rows) Affected\n`;
    });
  }

  private create(stmt: CreateStatement, r: RunResult) {
    const width = tupleWidth(stmt.columns);
    const perPage = Math.max(0, Math.floor((PAGE_SIZE - 4) / (width + 4)));
    r.stages.plan = {
      operator: "CreateTable",
      detail: `${stmt.table} · ${width} B per row · ${perPage} rows per 4 KB page`,
      child: null,
    };
    const schema = this.catalog.createTable(stmt.table, stmt.columns);
    this.heaps.set(schema.id, new TableHeap(this.allocator));
  }

  private createIndex(stmt: CreateIndexStatement, r: RunResult) {
    r.stages.plan = {
      operator: "CreateIndex",
      detail: `${stmt.index} ON ${stmt.table} (${stmt.columns.join(", ")})`,
      child: null,
    };
    r.notes.push(
      "CREATE INDEX parses and passes semantic checks, but PRQLite doesn't build B+ tree indexes yet — the executor treats it as a no-op.",
    );
  }

  private transaction(stmt: TransactionStatement, r: RunResult) {
    r.stages.plan = {
      operator: "Transaction",
      detail: stmt.action,
      child: null,
    };
    if (stmt.action === "BEGIN") this.txn.begin();
    else if (stmt.action === "COMMIT") this.txn.commit();
    else this.txn.rollback(r.trace);
    r.message = stmt.action;
    r.output += `${stmt.action}\n`;
  }
}
