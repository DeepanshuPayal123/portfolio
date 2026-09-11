import type { ColumnDef, ColumnType, Expr, Statement } from "@/lib/prqlite/ast";
import type { Catalog, TableSchema } from "@/lib/prqlite/catalog";
import { PrqlError } from "@/lib/prqlite/errors";
import type { Token } from "@/lib/prqlite/lexer";

// Port of PRQLite src/frontend/semantic_analyzer.cpp: type checking plus binding.
// Names resolve once per query here, so the executor never looks up the schema per row.

export interface Analysis {
  table: TableSchema | null;
  /** Output columns: select-list order for SELECT, table order otherwise. */
  resolvedColumns: ColumnDef[];
  /** Human-readable record of every check that passed, for the stage view. */
  checks: string[];
}

const semantic = (message: string) => new PrqlError("analyzer", message);

export function literalType(token: Token): ColumnType {
  if (token.type === "NUMBER") return "INT";
  if (token.type === "STRING") return "TEXT";
  return "BOOL";
}

const findColumn = (table: TableSchema, name: string) =>
  table.columns.find((c) => c.name === name);

const missingColumn = (name: string, table: string) =>
  semantic(
    `SEMANTIC ERROR: column '${name}' does not exist in table '${table}'`,
  );

function typeOf(expr: Expr, table: TableSchema, checks: string[]): ColumnType {
  if (expr.kind === "literal") return literalType(expr.token);

  if (expr.kind === "identifier") {
    const col = findColumn(table, expr.name);
    if (!col) throw missingColumn(expr.name, table.name);
    checks.push(`column '${col.name}' → ${col.type}`);
    return col.type;
  }

  const left = typeOf(expr.left, table, checks);
  const right = typeOf(expr.right, table, checks);

  if (expr.op === "AND" || expr.op === "OR") {
    if (left !== "BOOL" || right !== "BOOL")
      throw semantic("SEMANTIC ERROR: AND/OR requires boolean operands");
    checks.push(`'${expr.op}' operands are both BOOL`);
    return "BOOL";
  }

  if (left !== right) {
    throw semantic(
      `SEMANTIC ERROR: type mismatch in expression — left and right of '${expr.op}' must be same type`,
    );
  }
  checks.push(`'${expr.op}' operands are both ${left}`);
  return "BOOL";
}

export function analyze(stmt: Statement, catalog: Catalog): Analysis {
  const checks: string[] = [];
  const lookup = (name: string) => {
    const table = catalog.getTable(name, "analyzer");
    checks.push(`table '${name}' exists`);
    return table;
  };

  switch (stmt.kind) {
    case "insert": {
      const table = lookup(stmt.table);
      if (table.columns.length !== stmt.values.length) {
        throw semantic("SEMANTIC ERROR: shape of table doesn't match query");
      }
      checks.push(
        `${stmt.values.length} values for ${table.columns.length} columns`,
      );
      table.columns.forEach((col, i) => {
        if (col.type !== literalType(stmt.values[i]!))
          throw semantic(`SEMANTIC ERROR:${i}th item's type doesn't match`);
        checks.push(`value ${i} fits ${col.name} ${col.type}`);
      });
      return { table, resolvedColumns: table.columns, checks };
    }

    case "select": {
      const table = lookup(stmt.table);
      const resolvedColumns = stmt.selectStar
        ? table.columns
        : stmt.columns.map((name) => {
            const col = findColumn(table, name);
            if (!col) throw missingColumn(name, table.name);
            checks.push(`column '${col.name}' → ${col.type}`);
            return col;
          });

      if (stmt.orderBy !== null) {
        if (!findColumn(table, stmt.orderBy)) {
          throw semantic(
            `SEMANTIC ERROR: ORDER BY column '${stmt.orderBy}' does not exist in table '${table.name}'`,
          );
        }
        checks.push(`ORDER BY column '${stmt.orderBy}' exists`);
      }

      if (stmt.where) typeOf(stmt.where, table, checks);
      return { table, resolvedColumns, checks };
    }

    case "delete": {
      const table = lookup(stmt.table);
      if (stmt.where) {
        if (typeOf(stmt.where, table, checks) !== "BOOL") {
          throw semantic(
            "SEMANTIC ERROR: WHERE clause must evaluate to a boolean condition",
          );
        }
        checks.push("WHERE evaluates to BOOL");
      }
      return { table, resolvedColumns: table.columns, checks };
    }

    case "create": {
      const seen = new Set<string>();
      for (const col of stmt.columns) {
        if (seen.has(col.name)) {
          throw semantic(
            `SEMANTIC ERROR: duplicate column name '${col.name}' in table '${stmt.table}'`,
          );
        }
        seen.add(col.name);
      }
      checks.push(`${stmt.columns.length} distinct column names`);
      return { table: null, resolvedColumns: stmt.columns, checks };
    }

    case "createIndex": {
      const table = lookup(stmt.table);
      for (const name of stmt.columns) {
        if (!findColumn(table, name))
          throw semantic(
            `SEMANTIC ERROR: column ${name} doesn't exist in table ${stmt.table}`,
          );
        checks.push(`column '${name}' exists`);
      }
      return { table, resolvedColumns: [], checks };
    }

    case "transaction":
      return { table: null, resolvedColumns: [], checks };
  }
}
