import { PrqlError } from "@/lib/prqlite/errors";

// Port of PRQLite src/frontend/lexer.cpp.

export type TokenType =
  | "CREATE"
  | "TABLE"
  | "INDEX"
  | "SELECT"
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "FROM"
  | "WHERE"
  | "GROUP"
  | "BY"
  | "ORDER"
  | "HAVING"
  | "LIMIT"
  | "ON"
  | "AND"
  | "OR"
  | "NOT"
  | "TRUE"
  | "FALSE"
  | "IDENTIFIER"
  | "NUMBER"
  | "STRING"
  | "COMMA"
  | "SEMICOLON"
  | "STAR"
  | "LPAREN"
  | "RPAREN"
  | "EQUAL"
  | "LESS"
  | "GREATER"
  | "LESS_EQUAL"
  | "GREATER_EQUAL"
  | "NOT_EQUAL"
  | "INT"
  | "TEXT"
  | "BOOL"
  | "ASC"
  | "DESC"
  | "INTO"
  | "VALUES"
  | "BEGIN"
  | "COMMIT"
  | "ROLLBACK";

export interface Token {
  lexeme: string;
  type: TokenType;
  /** Offset of the token's first character in the input (not in the C++ token; used for highlighting). */
  pos: number;
}

const KEYWORDS: readonly TokenType[] = [
  "CREATE",
  "TABLE",
  "INDEX",
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "FROM",
  "WHERE",
  "GROUP",
  "BY",
  "ORDER",
  "HAVING",
  "LIMIT",
  "ON",
  "AND",
  "OR",
  "NOT",
  "ASC",
  "DESC",
  "TRUE",
  "FALSE",
  "INTO",
  "VALUES",
  "INT",
  "TEXT",
  "BOOL",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
];

// The C++ table registers "SELECT" and "select" rather than normalizing case,
// so "Select" falls through to IDENTIFIER.
const KEYWORD_TABLE = new Map<string, TokenType>(
  KEYWORDS.flatMap((k): [string, TokenType][] => [
    [k, k],
    [k.toLowerCase(), k],
  ]),
);

const SINGLE_CHAR: Readonly<Record<string, TokenType>> = {
  ",": "COMMA",
  ";": "SEMICOLON",
  "*": "STAR",
  "(": "LPAREN",
  ")": "RPAREN",
  "=": "EQUAL",
};

const isSpace = (c: string) => c !== "" && " \t\n\v\f\r".includes(c);
const isAlpha = (c: string) => /^[A-Za-z]$/.test(c);
const isDigit = (c: string) => /^[0-9]$/.test(c);

export function tokenize(input: string): Token[] {
  if (input.length === 0)
    throw new PrqlError("lexer", "LEXER_ERROR: input stream is empty");

  const tokens: Token[] = [];
  let pos = 0;
  const at = (i: number) => input.charAt(i);

  for (;;) {
    while (isSpace(at(pos))) pos++;
    if (pos >= input.length) return tokens;

    const start = pos;
    const c = at(pos);
    const push = (lexeme: string, type: TokenType) =>
      tokens.push({ lexeme, type, pos: start });

    const single = SINGLE_CHAR[c];
    if (single) {
      pos++;
      push(c, single);
      continue;
    }

    if (c === "<") {
      if (at(pos + 1) === "=") {
        pos += 2;
        push("<=", "LESS_EQUAL");
        continue;
      }
      if (at(pos + 1) === ">") {
        pos += 2;
        push("<>", "NOT_EQUAL");
        continue;
      }
      pos++;
      push("<", "LESS");
      continue;
    }
    if (c === ">") {
      if (at(pos + 1) === "=") {
        pos += 2;
        push(">=", "GREATER_EQUAL");
        continue;
      }
      pos++;
      push(">", "GREATER");
      continue;
    }
    if (c === "!") {
      if (at(pos + 1) === "=") {
        pos += 2;
        push("!=", "NOT_EQUAL");
        continue;
      }
      throw new PrqlError(
        "lexer",
        `LEXER_ERROR: unexpected '!' without '=' at position ${pos}`,
      );
    }

    if (c === "'" || c === '"') {
      pos++;
      let val = "";
      while (pos < input.length && at(pos) !== c) {
        if (at(pos) === "\\" && pos + 1 < input.length) {
          val += at(pos + 1);
          pos += 2;
          continue;
        }
        val += at(pos);
        pos++;
      }
      if (pos >= input.length)
        throw new PrqlError(
          "lexer",
          "LEXER_ERROR: unterminated string literal",
        );
      pos++;
      push(val, "STRING");
      continue;
    }

    if (isAlpha(c) || c === "_") {
      let ident = "";
      while (isAlpha(at(pos)) || isDigit(at(pos)) || at(pos) === "_")
        ident += at(pos++);
      push(ident, KEYWORD_TABLE.get(ident) ?? "IDENTIFIER");
      continue;
    }

    if (isDigit(c)) {
      let num = "";
      while (isDigit(at(pos))) num += at(pos++);
      if (at(pos) === ".") {
        num += at(pos++);
        if (!isDigit(at(pos)))
          throw new PrqlError("lexer", "LEXER_ERROR: malformed number literal");
        while (isDigit(at(pos))) num += at(pos++);
      }
      push(num, "NUMBER");
      continue;
    }

    throw new PrqlError(
      "lexer",
      `LEXER_ERROR: unexpected character '${c}' at position ${pos}`,
    );
  }
}
