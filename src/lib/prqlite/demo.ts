import {
  formatLiteral,
  type ColumnDef,
  type Expr,
  type Statement,
} from "@/lib/prqlite/ast";
import {
  Database,
  formatValue,
  type RunResult,
  type TraceEvent,
} from "@/lib/prqlite/engine";
import {
  tupleWidth,
  type SQLValue,
  type TableHeap,
} from "@/lib/prqlite/storage";

// Presentation helpers for the PRQLite demo island; no DOM, no React.

export const SEED = [
  "CREATE TABLE users (id INT, name TEXT, active BOOL)",
  "INSERT INTO users VALUES (1, 'alice', true)",
  "INSERT INTO users VALUES (2, 'bob', false)",
  "INSERT INTO users VALUES (3, 'carol', true)",
  "INSERT INTO users VALUES (4, 'dave', false)",
  "INSERT INTO users VALUES (5, 'eve', true)",
];

export function seededDatabase(): Database {
  const db = new Database();
  for (const sql of SEED) {
    const result = db.execute(sql);
    if (result.error) throw result.error;
  }
  return db;
}

export const PRESETS: { label: string; sql: string }[] = [
  {
    label: "Filter + project",
    sql: "SELECT name, id FROM users WHERE id > 1 AND active = true;",
  },
  { label: "Insert", sql: "INSERT INTO users VALUES (6, 'frank', true);" },
  { label: "Delete", sql: "DELETE FROM users WHERE active = false;" },
  {
    label: "Transaction",
    sql: "BEGIN;\nDELETE FROM users WHERE id = 1;\nSELECT * FROM users;\nROLLBACK;",
  },
  {
    label: "Honest limits",
    sql: "SELECT * FROM users ORDER BY id DESC LIMIT 1;",
  },
  { label: "Syntax error", sql: "SELECT * users;" },
];

export const STAGES = [
  "Tokens",
  "AST",
  "Analyzer",
  "Plan",
  "Execution",
  "Result",
] as const;
export type StageStatus = "ok" | "error" | "skipped";

const FAILED_AT = { lexer: 0, parser: 1, analyzer: 2, executor: 4 } as const;

/** Stages before the failing one passed; an executor failure also fails the result. */
export function stageStatuses(result: RunResult): StageStatus[] {
  if (!result.error) return STAGES.map(() => "ok");
  const failed = FAILED_AT[result.error.stage];
  return STAGES.map((_, i) => {
    if (i < failed) return "ok";
    if (i === failed || (failed === FAILED_AT.executor && i > failed))
      return "error";
    return "skipped";
  });
}

/** The stage to land on after a run: the one that failed, or the result. */
export function finalStageIndex(result: RunResult): number {
  const failed = stageStatuses(result).indexOf("error");
  return failed === -1 ? STAGES.length - 1 : failed;
}

interface TreeNode {
  label: string;
  children?: TreeNode[];
}

function exprTree(expr: Expr): TreeNode {
  if (expr.kind === "binary")
    return {
      label: expr.op,
      children: [exprTree(expr.left), exprTree(expr.right)],
    };
  if (expr.kind === "identifier") return { label: expr.name };
  return { label: formatLiteral(expr.token) };
}

function statementTree(stmt: Statement): TreeNode {
  const where = (expr: Expr | null): TreeNode[] =>
    expr ? [{ label: "where", children: [exprTree(expr)] }] : [];
  switch (stmt.kind) {
    case "select":
      return {
        label: "SELECT",
        children: [
          {
            label: `columns: ${stmt.selectStar ? "*" : stmt.columns.join(", ")}`,
          },
          { label: `from: ${stmt.table}` },
          ...where(stmt.where),
          ...(stmt.orderBy !== null
            ? [{ label: `order by: ${stmt.orderBy} ${stmt.orderDir}` }]
            : []),
          ...(stmt.limit !== null ? [{ label: `limit: ${stmt.limit}` }] : []),
        ],
      };
    case "insert":
      return {
        label: "INSERT",
        children: [
          { label: `into: ${stmt.table}` },
          { label: `values: (${stmt.values.map(formatLiteral).join(", ")})` },
        ],
      };
    case "delete":
      return {
        label: "DELETE",
        children: [{ label: `from: ${stmt.table}` }, ...where(stmt.where)],
      };
    case "create":
      return {
        label: "CREATE TABLE",
        children: [
          { label: `name: ${stmt.table}` },
          {
            label: "columns",
            children: stmt.columns.map((c) => ({
              label: `${c.name} ${c.type}`,
            })),
          },
        ],
      };
    case "createIndex":
      return {
        label: "CREATE INDEX",
        children: [
          { label: `name: ${stmt.index}` },
          { label: `on: ${stmt.table} (${stmt.columns.join(", ")})` },
        ],
      };
    case "transaction":
      return { label: stmt.action };
  }
}

/** The AST as box-drawing lines: SELECT / ├─ from: users / └─ where … */
export function astLines(stmt: Statement): string[] {
  const lines: string[] = [];
  const walk = (
    node: TreeNode,
    prefix: string,
    last: boolean,
    root: boolean,
  ) => {
    lines.push(
      root ? node.label : `${prefix}${last ? "└─ " : "├─ "}${node.label}`,
    );
    const childPrefix = root ? "" : prefix + (last ? "   " : "│  ");
    const children = node.children ?? [];
    children.forEach((child, i) =>
      walk(child, childPrefix, i === children.length - 1, false),
    );
  };
  walk(statementTree(stmt), "", true, true);
  return lines;
}

export type Tone = "ok" | "err" | "dim" | "accent" | "amber";

const tuple = (values: SQLValue[] = []) =>
  `(${values.map((v) => (typeof v === "string" ? `'${v}'` : formatValue(v))).join(", ")})`;
const where = (event: TraceEvent) =>
  event.rid ? `page ${event.rid.pageId} · slot ${event.rid.slotId}` : "";

export function traceLine(event: TraceEvent): {
  operator: string;
  text: string;
  tone: Tone;
} {
  switch (event.action) {
    case "emit":
      return {
        operator: event.operator,
        text: `→ ${tuple(event.values)}  ${event.operator === "SeqScan" ? where(event) : ""}`.trimEnd(),
        tone: event.operator === "SeqScan" ? "dim" : "accent",
      };
    case "pass":
      return { operator: event.operator, text: "✓ pass", tone: "ok" };
    case "reject":
      return { operator: event.operator, text: "✗ reject", tone: "err" };
    case "insert":
      return {
        operator: event.operator,
        text: `← ${tuple(event.values)}  ${where(event)}`,
        tone: "accent",
      };
    case "delete":
      return {
        operator: event.operator,
        text: `✗ ${tuple(event.values)}  slot zeroed · ${where(event)}`,
        tone: "err",
      };
    case "undo-insert":
      return {
        operator: "Undo",
        text: `delete ${tuple(event.values)}  ${where(event)}`,
        tone: "amber",
      };
    case "undo-delete":
      return {
        operator: "Undo",
        text: `restore ${tuple(event.values)}  ${where(event)}`,
        tone: "amber",
      };
  }
}

export interface PageView {
  id: number;
  slots: ("live" | "deleted")[];
  /** How many more rows of this width fit in the remaining free space. */
  room: number;
  freeBytes: number;
}

export function pageViews(heap: TableHeap, columns: ColumnDef[]): PageView[] {
  const slotCost = tupleWidth(columns) + 4;
  return heap.pages.map((page) => {
    const freeBytes = page.freeSpacePointer - page.headerEnd;
    return {
      id: page.id,
      slots: page.slots().map((s) => (s.size > 0 ? "live" : "deleted")),
      room: Math.max(0, Math.floor(freeBytes / slotCost)),
      freeBytes,
    };
  });
}
