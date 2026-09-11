import { describe, expect, test } from "vitest";
import { tokenize } from "@/lib/prqlite/lexer";
import { PrqlError } from "@/lib/prqlite/errors";

const types = (sql: string) => tokenize(sql).map((t) => t.type);
const lexError = (sql: string) => {
  try {
    tokenize(sql);
  } catch (e) {
    expect(e).toBeInstanceOf(PrqlError);
    expect((e as PrqlError).stage).toBe("lexer");
    return (e as PrqlError).message;
  }
  throw new Error(`expected a lexer error for: ${sql}`);
};

describe("lexer (mirrors src/frontend/lexer.cpp)", () => {
  test("scans a full SELECT into typed tokens", () => {
    expect(tokenize("SELECT * FROM users WHERE id = 1;")).toEqual([
      { lexeme: "SELECT", type: "SELECT", pos: 0 },
      { lexeme: "*", type: "STAR", pos: 7 },
      { lexeme: "FROM", type: "FROM", pos: 9 },
      { lexeme: "users", type: "IDENTIFIER", pos: 14 },
      { lexeme: "WHERE", type: "WHERE", pos: 20 },
      { lexeme: "id", type: "IDENTIFIER", pos: 26 },
      { lexeme: "=", type: "EQUAL", pos: 29 },
      { lexeme: "1", type: "NUMBER", pos: 31 },
      { lexeme: ";", type: "SEMICOLON", pos: 32 },
    ]);
  });

  test("keywords match only all-UPPER or all-lower, so mixed case is an IDENTIFIER", () => {
    expect(types("select SELECT Select")).toEqual([
      "SELECT",
      "SELECT",
      "IDENTIFIER",
    ]);
    expect(types("begin COMMIT rollback")).toEqual([
      "BEGIN",
      "COMMIT",
      "ROLLBACK",
    ]);
    expect(types("int TEXT bool true FALSE")).toEqual([
      "INT",
      "TEXT",
      "BOOL",
      "TRUE",
      "FALSE",
    ]);
  });

  test("identifiers are scanned whole before the keyword lookup", () => {
    expect(tokenize("orders _col1 fromage")).toEqual([
      { lexeme: "orders", type: "IDENTIFIER", pos: 0 },
      { lexeme: "_col1", type: "IDENTIFIER", pos: 7 },
      { lexeme: "fromage", type: "IDENTIFIER", pos: 13 },
    ]);
  });

  test("two-char operators use maximal munch", () => {
    expect(
      tokenize("< <= <> > >= != =").map((t) => [t.type, t.lexeme]),
    ).toEqual([
      ["LESS", "<"],
      ["LESS_EQUAL", "<="],
      ["NOT_EQUAL", "<>"],
      ["GREATER", ">"],
      ["GREATER_EQUAL", ">="],
      ["NOT_EQUAL", "!="],
      ["EQUAL", "="],
    ]);
  });

  test("punctuation", () => {
    expect(types("( , ) ; *")).toEqual([
      "LPAREN",
      "COMMA",
      "RPAREN",
      "SEMICOLON",
      "STAR",
    ]);
  });

  test("string literals in both quote styles, with backslash escapes, lexeme excludes quotes", () => {
    expect(
      tokenize(`'it\\'s' "a\\\\b" ''`).map((t) => [t.type, t.lexeme]),
    ).toEqual([
      ["STRING", "it's"],
      ["STRING", "a\\b"],
      ["STRING", ""],
    ]);
  });

  test("numbers with an optional fractional part", () => {
    expect(tokenize("42 3.14").map((t) => [t.type, t.lexeme])).toEqual([
      ["NUMBER", "42"],
      ["NUMBER", "3.14"],
    ]);
  });

  test("exact LEXER_ERROR messages", () => {
    expect(lexError("")).toBe("LEXER_ERROR: input stream is empty");
    expect(lexError("a ! b")).toBe(
      "LEXER_ERROR: unexpected '!' without '=' at position 2",
    );
    expect(lexError("'abc")).toBe("LEXER_ERROR: unterminated string literal");
    expect(lexError('"abc')).toBe("LEXER_ERROR: unterminated string literal");
    expect(lexError("3.")).toBe("LEXER_ERROR: malformed number literal");
    expect(lexError("3.x")).toBe("LEXER_ERROR: malformed number literal");
    expect(lexError("id @ 1")).toBe(
      "LEXER_ERROR: unexpected character '@' at position 3",
    );
  });

  test("whitespace-only input is not an error, it just yields no tokens", () => {
    expect(tokenize("  \n\t ")).toEqual([]);
  });
});
