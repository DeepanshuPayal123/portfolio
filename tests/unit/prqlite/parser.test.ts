import { describe, expect, test } from "vitest";
import { tokenize } from "@/lib/prqlite/lexer";
import { parse } from "@/lib/prqlite/parser";
import type { Expr } from "@/lib/prqlite/ast";
import { PrqlError } from "@/lib/prqlite/errors";

const p = (sql: string) => parse(tokenize(sql));
const where = (sql: string) => {
  const stmt = p(sql);
  if (stmt.kind !== "select" && stmt.kind !== "delete")
    throw new Error("expected select/delete");
  return stmt.where;
};
// Compact rendering of an expression tree: (a = 1 AND b > 2)
const show = (e: Expr | null): string => {
  if (!e) return "∅";
  if (e.kind === "binary") return `(${show(e.left)} ${e.op} ${show(e.right)})`;
  if (e.kind === "identifier") return e.name;
  return e.token.type === "STRING" ? `'${e.token.lexeme}'` : e.token.lexeme;
};
const parseError = (sql: string) => {
  try {
    p(sql);
  } catch (e) {
    expect(e).toBeInstanceOf(PrqlError);
    expect((e as PrqlError).stage).toBe("parser");
    return (e as PrqlError).message;
  }
  throw new Error(`expected a parser error for: ${sql}`);
};

describe("parser (mirrors src/frontend/parser/*.cpp, with the fix/where-clause fixes)", () => {
  test("SELECT *", () => {
    expect(p("SELECT * FROM users")).toEqual({
      kind: "select",
      selectStar: true,
      columns: [],
      table: "users",
      where: null,
      orderBy: null,
      orderDir: "ASC",
      limit: null,
    });
  });

  test("SELECT column list keeps select order", () => {
    const stmt = p("SELECT name, id FROM users");
    expect(stmt).toMatchObject({
      kind: "select",
      selectStar: false,
      columns: ["name", "id"],
      table: "users",
    });
  });

  test("AND and OR build left-associative trees", () => {
    expect(show(where("SELECT * FROM t WHERE a = 1 AND b = 2"))).toBe(
      "((a = 1) AND (b = 2))",
    );
    expect(show(where("SELECT * FROM t WHERE a = 1 AND b = 2 AND c = 3"))).toBe(
      "(((a = 1) AND (b = 2)) AND (c = 3))",
    );
    expect(show(where("SELECT * FROM t WHERE a = 1 OR b = 2 OR c = 3"))).toBe(
      "(((a = 1) OR (b = 2)) OR (c = 3))",
    );
  });

  test("precedence lives in the call chain: AND binds tighter than OR, comparison tighter than equality", () => {
    expect(show(where("SELECT * FROM t WHERE a = 1 AND b > 2 OR c = 3"))).toBe(
      "(((a = 1) AND (b > 2)) OR (c = 3))",
    );
    expect(
      show(where("SELECT * FROM t WHERE (a = 1 OR b = 2) AND c = 3")),
    ).toBe("(((a = 1) OR (b = 2)) AND (c = 3))");
  });

  test("both not-equal spellings normalize to !=", () => {
    expect(show(where("SELECT * FROM t WHERE a <> 1"))).toBe("(a != 1)");
    expect(show(where("SELECT * FROM t WHERE a != 1"))).toBe("(a != 1)");
  });

  test("range operators and literals", () => {
    expect(
      show(where("SELECT * FROM t WHERE a >= 1 OR b <= 'x' OR c = true")),
    ).toBe("(((a >= 1) OR (b <= 'x')) OR (c = true))");
  });

  test("ORDER BY and LIMIT are parsed", () => {
    expect(
      p("SELECT * FROM products ORDER BY price DESC LIMIT 10"),
    ).toMatchObject({
      orderBy: "price",
      orderDir: "DESC",
      limit: 10,
    });
    expect(p("SELECT * FROM products ORDER BY price")).toMatchObject({
      orderBy: "price",
      orderDir: "ASC",
    });
  });

  test("like the C++ parser, trailing tokens after a complete statement are ignored", () => {
    expect(p("SELECT * FROM users garbage")).toMatchObject({
      kind: "select",
      table: "users",
    });
  });

  test("INSERT keeps the literal tokens", () => {
    const stmt = p("INSERT INTO users VALUES (1, 'alice', true)");
    expect(stmt.kind).toBe("insert");
    if (stmt.kind !== "insert") return;
    expect(stmt.table).toBe("users");
    expect(stmt.values.map((t) => [t.type, t.lexeme])).toEqual([
      ["NUMBER", "1"],
      ["STRING", "alice"],
      ["TRUE", "true"],
    ]);
  });

  test("DELETE with and without WHERE", () => {
    expect(p("DELETE FROM users")).toEqual({
      kind: "delete",
      table: "users",
      where: null,
    });
    expect(
      show(where("DELETE FROM users WHERE id = 2 AND active = false")),
    ).toBe("((id = 2) AND (active = false))");
  });

  test("CREATE TABLE and CREATE INDEX", () => {
    expect(p("CREATE TABLE users (id INT, name TEXT, active BOOL)")).toEqual({
      kind: "create",
      table: "users",
      columns: [
        { name: "id", type: "INT" },
        { name: "name", type: "TEXT" },
        { name: "active", type: "BOOL" },
      ],
    });
    expect(p("CREATE INDEX idx ON users (id, name)")).toEqual({
      kind: "createIndex",
      index: "idx",
      table: "users",
      columns: ["id", "name"],
    });
  });

  test("transaction statements", () => {
    expect(p("BEGIN")).toEqual({ kind: "transaction", action: "BEGIN" });
    expect(p("commit")).toEqual({ kind: "transaction", action: "COMMIT" });
    expect(p("ROLLBACK")).toEqual({ kind: "transaction", action: "ROLLBACK" });
  });

  test("exact error messages", () => {
    expect(parseError("   ")).toBe("Token Stream is Empty");
    expect(parseError("UPDATE users")).toBe(
      "SYNTAX ERROR: Statement must be CRE/SEL/INS/DEL/BEGIN/COMMIT/ROLLBACK",
    );
    expect(parseError("Select * from users")).toBe(
      "SYNTAX ERROR: Statement must be CRE/SEL/INS/DEL/BEGIN/COMMIT/ROLLBACK",
    );

    expect(parseError("SELECT * users")).toBe("SYNTAX ERROR: expected FROM");
    expect(parseError("SELECT * FROM")).toBe("At End of token stream");
    expect(parseError("SELECT 1 FROM users")).toBe(
      "SYNTAX ERROR: expected identifier, got '1'",
    );
    expect(parseError("SELECT * FROM users WHERE")).toBe(
      "At End of token stream",
    );
    expect(parseError("SELECT * FROM users WHERE = 1")).toBe(
      "SYNTAX ERROR: unexpected token '='",
    );
    expect(parseError("SELECT * FROM users WHERE (a = 1")).toBe(
      "SYNTAX ERROR: expected ')'",
    );
    expect(parseError("SELECT * FROM users ORDER id")).toBe(
      "SYNTAX ERROR: expected BY after ORDER",
    );
    expect(parseError("SELECT * FROM users LIMIT x")).toBe(
      "SYNTAX ERROR: expected number after LIMIT",
    );

    expect(parseError("CREATE users")).toBe(
      "SYNTAX ERROR: Invalid CREATE Syntax.",
    );
    expect(parseError("CREATE TABLE t id INT")).toBe(
      "SYNTAX ERROR: expected '(' after table name",
    );
    expect(parseError("CREATE TABLE t (id")).toBe(
      "SYNTAX ERROR: expected type after column name 'id'",
    );
    expect(parseError("CREATE TABLE t (id)")).toBe(
      "SYNTAX ERROR: expected INT, TEXT, or BOOL for column 'id'",
    );
    expect(parseError("CREATE TABLE t (id INT")).toBe(
      "SYNTAX ERROR: expected ')' after column definitions",
    );
    expect(parseError("CREATE INDEX i users (id)")).toBe(
      "SYNTAX ERROR: expected ON after index name.",
    );

    expect(parseError("INSERT users VALUES (1)")).toBe(
      "SYNTAX ERROR: expected INTO after INSERT.",
    );
    expect(parseError("INSERT INTO users (1)")).toBe(
      "SYNTAX ERROR: expected VALUES after tableName.",
    );
    expect(parseError("INSERT INTO users VALUES 1")).toBe(
      "SYNTAX ERROR: expected '(' after VALUES",
    );
    expect(parseError("INSERT INTO users VALUES (")).toBe(
      "SYNTAX ERROR: expected value, got end of input",
    );
    expect(parseError("INSERT INTO users VALUES (id)")).toBe(
      "SYNTAX ERROR: expected literal got: id",
    );
    expect(parseError("INSERT INTO users VALUES (1, id)")).toBe(
      "SYNTAX Error: expected literal after ,",
    );
    expect(parseError("INSERT INTO users VALUES (1")).toBe(
      "SYNTAX ERROR: expected ')' after value list",
    );

    expect(parseError("DELETE users")).toBe(
      "SYNTAX ERROR: expected FROM after DELETE.",
    );

    expect(parseError("BEGIN TRANSACTION")).toBe(
      "SYNTAX ERROR: INCORRECT BEGIN SYNTAX.",
    );
    expect(parseError("COMMIT now")).toBe(
      "SYNTAX ERROR: INCORRECT COMMIT SYNTAX.",
    );
    expect(parseError("ROLLBACK now")).toBe(
      "SYNTAX ERROR: INCORRECT ROLLBACK SYNTAX.",
    );
  });
});
