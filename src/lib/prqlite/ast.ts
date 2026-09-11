import type { Token } from "@/lib/prqlite/lexer";

// Port of PRQLite include/frontend/parser/AST.hpp. Semantic bindings live in the
// analyzer's result instead of being written back into the tree.

export type ColumnType = "INT" | "TEXT" | "BOOL";

export interface ColumnDef {
  name: string;
  type: ColumnType;
}

export type BinaryOp = "AND" | "OR" | "=" | "!=" | ">" | ">=" | "<" | "<=";

export type Expr =
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "literal"; token: Token }
  | { kind: "identifier"; name: string };

export interface SelectStatement {
  kind: "select";
  selectStar: boolean;
  columns: string[];
  table: string;
  where: Expr | null;
  orderBy: string | null;
  orderDir: "ASC" | "DESC";
  limit: number | null;
}

export interface InsertStatement {
  kind: "insert";
  table: string;
  values: Token[];
}

export interface DeleteStatement {
  kind: "delete";
  table: string;
  where: Expr | null;
}

export interface CreateStatement {
  kind: "create";
  table: string;
  columns: ColumnDef[];
}

export interface CreateIndexStatement {
  kind: "createIndex";
  index: string;
  table: string;
  columns: string[];
}

export interface TransactionStatement {
  kind: "transaction";
  action: "BEGIN" | "COMMIT" | "ROLLBACK";
}

export function formatLiteral(token: Token): string {
  return token.type === "STRING"
    ? `'${token.lexeme.replaceAll("'", "\\'")}'`
    : token.lexeme;
}

const PRECEDENCE: Record<BinaryOp, number> = {
  OR: 1,
  AND: 2,
  "=": 3,
  "!=": 3,
  ">": 4,
  ">=": 4,
  "<": 4,
  "<=": 4,
};

/** Renders an expression with only the parentheses its tree actually needs. */
export function formatExpr(expr: Expr): string {
  if (expr.kind === "identifier") return expr.name;
  if (expr.kind === "literal") return formatLiteral(expr.token);
  const own = PRECEDENCE[expr.op];
  const side = (child: Expr, strict: boolean) => {
    const text = formatExpr(child);
    if (child.kind !== "binary") return text;
    const theirs = PRECEDENCE[child.op];
    return theirs < own || (strict && theirs === own) ? `(${text})` : text;
  };
  return `${side(expr.left, false)} ${expr.op} ${side(expr.right, true)}`;
}

export type Statement =
  | SelectStatement
  | InsertStatement
  | DeleteStatement
  | CreateStatement
  | CreateIndexStatement
  | TransactionStatement;
