import { beforeEach, describe, expect, test } from "vitest";
import { tokenize } from "@/lib/prqlite/lexer";
import { parse } from "@/lib/prqlite/parser";
import { analyze } from "@/lib/prqlite/analyzer";
import { Catalog } from "@/lib/prqlite/catalog";
import { PrqlError } from "@/lib/prqlite/errors";

let catalog: Catalog;
beforeEach(() => {
  catalog = new Catalog();
  catalog.createTable("users", [
    { name: "id", type: "INT" },
    { name: "name", type: "TEXT" },
    { name: "active", type: "BOOL" },
  ]);
});

const run = (sql: string) => analyze(parse(tokenize(sql)), catalog);
const semanticError = (sql: string) => {
  try {
    run(sql);
  } catch (e) {
    expect(e).toBeInstanceOf(PrqlError);
    expect((e as PrqlError).stage).toBe("analyzer");
    return (e as PrqlError).message;
  }
  throw new Error(`expected a semantic error for: ${sql}`);
};

describe("semantic analyzer (mirrors src/frontend/semantic_analyzer.cpp)", () => {
  test("SELECT * binds every column in table order", () => {
    const a = run("SELECT * FROM users");
    expect(a.table?.name).toBe("users");
    expect(a.resolvedColumns.map((c) => c.name)).toEqual([
      "id",
      "name",
      "active",
    ]);
  });

  test("a column list binds in select order, once per query", () => {
    const a = run("SELECT name, id FROM users WHERE id > 1 AND active = true");
    expect(a.resolvedColumns).toEqual([
      { name: "name", type: "TEXT" },
      { name: "id", type: "INT" },
    ]);
  });

  test("records the checks it ran, for the stage view", () => {
    const a = run("SELECT id FROM users WHERE name = 'bob'");
    expect(a.checks).toContain("table 'users' exists");
    expect(a.checks).toContain("column 'name' → TEXT");
    expect(a.checks).toContain("'=' operands are both TEXT");
  });

  test("like the C++ SELECT path, a non-boolean WHERE is not rejected (it just matches nothing)", () => {
    expect(() => run("SELECT * FROM users WHERE id")).not.toThrow();
  });

  test("DELETE does require a boolean WHERE", () => {
    expect(semanticError("DELETE FROM users WHERE id")).toBe(
      "SEMANTIC ERROR: WHERE clause must evaluate to a boolean condition",
    );
    expect(() =>
      run("DELETE FROM users WHERE id = 1 AND active = false"),
    ).not.toThrow();
  });

  test("CREATE TABLE only checks for duplicate columns; an existing name is caught by the executor", () => {
    expect(() => run("CREATE TABLE users (x INT)")).not.toThrow();
    expect(semanticError("CREATE TABLE t (a INT, a TEXT)")).toBe(
      "SEMANTIC ERROR: duplicate column name 'a' in table 't'",
    );
  });

  test("transactions have nothing to check", () => {
    expect(run("BEGIN").checks).toEqual([]);
  });

  test("exact error messages", () => {
    expect(semanticError("SELECT * FROM ghosts")).toBe(
      "SEMANTIC ERROR: This Table Doesn't Exist.",
    );
    expect(semanticError("DELETE FROM ghosts")).toBe(
      "SEMANTIC ERROR: This Table Doesn't Exist.",
    );
    expect(semanticError("INSERT INTO ghosts VALUES (1)")).toBe(
      "SEMANTIC ERROR: This Table Doesn't Exist.",
    );

    expect(semanticError("SELECT email FROM users")).toBe(
      "SEMANTIC ERROR: column 'email' does not exist in table 'users'",
    );
    expect(semanticError("SELECT * FROM users WHERE email = 1")).toBe(
      "SEMANTIC ERROR: column 'email' does not exist in table 'users'",
    );
    expect(semanticError("SELECT * FROM users ORDER BY email")).toBe(
      "SEMANTIC ERROR: ORDER BY column 'email' does not exist in table 'users'",
    );

    expect(semanticError("SELECT * FROM users WHERE id = 'x'")).toBe(
      "SEMANTIC ERROR: type mismatch in expression — left and right of '=' must be same type",
    );
    expect(semanticError("SELECT * FROM users WHERE id <> true")).toBe(
      "SEMANTIC ERROR: type mismatch in expression — left and right of '!=' must be same type",
    );
    expect(semanticError("SELECT * FROM users WHERE id AND active")).toBe(
      "SEMANTIC ERROR: AND/OR requires boolean operands",
    );

    expect(semanticError("INSERT INTO users VALUES (1, 'a')")).toBe(
      "SEMANTIC ERROR: shape of table doesn't match query",
    );
    expect(semanticError("INSERT INTO users VALUES ('x', 'a', true)")).toBe(
      "SEMANTIC ERROR:0th item's type doesn't match",
    );
    expect(semanticError("INSERT INTO users VALUES (1, 'a', 5)")).toBe(
      "SEMANTIC ERROR:2th item's type doesn't match",
    );

    expect(semanticError("CREATE INDEX i ON users (zz)")).toBe(
      "SEMANTIC ERROR: column zz doesn't exist in table users",
    );
  });
});
