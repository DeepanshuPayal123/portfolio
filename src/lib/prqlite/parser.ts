import type {
  BinaryOp,
  ColumnDef,
  ColumnType,
  CreateIndexStatement,
  CreateStatement,
  DeleteStatement,
  Expr,
  InsertStatement,
  SelectStatement,
  Statement,
  TransactionStatement,
} from "@/lib/prqlite/ast";
import { PrqlError } from "@/lib/prqlite/errors";
import type { Token, TokenType } from "@/lib/prqlite/lexer";

// Port of PRQLite src/frontend/parser/{parser,parser_utils}.cpp — recursive descent,
// one method per grammar rule, precedence encoded in the call chain
// (or → and → equality → comparison → primary). Includes the fix/where-clause fixes.

const syntax = (message: string) => new PrqlError("parser", message);

const LITERALS: ReadonlySet<TokenType> = new Set([
  "NUMBER",
  "STRING",
  "TRUE",
  "FALSE",
]);
const COLUMN_TYPES: ReadonlySet<TokenType> = new Set(["INT", "TEXT", "BOOL"]);
const COMPARISON_OPS: Partial<Record<TokenType, BinaryOp>> = {
  GREATER: ">",
  GREATER_EQUAL: ">=",
  LESS: "<",
  LESS_EQUAL: "<=",
};

class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseStatement(): Statement {
    const t = this.peek();
    switch (t.type) {
      case "SELECT":
        return this.parseSelect();
      case "INSERT":
        return this.parseInsert();
      case "DELETE":
        return this.parseDelete();
      case "CREATE": {
        this.advance();
        const next = this.peek();
        if (next.type === "INDEX") return this.parseIndex();
        if (next.type === "TABLE") return this.parseCreate();
        throw syntax("SYNTAX ERROR: Invalid CREATE Syntax.");
      }
      case "BEGIN":
      case "COMMIT":
      case "ROLLBACK":
        return this.parseTransaction(t.type);
      default:
        throw syntax(
          "SYNTAX ERROR: Statement must be CRE/SEL/INS/DEL/BEGIN/COMMIT/ROLLBACK",
        );
    }
  }

  private isAtEnd() {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token {
    if (this.tokens.length < 1) throw syntax("Token Stream is Empty");
    const t = this.tokens[this.pos];
    if (!t) throw syntax("At End of token stream");
    return t;
  }

  private advance() {
    this.pos++;
  }

  private match(type: TokenType) {
    if (this.isAtEnd() || this.peek().type !== type) return false;
    this.advance();
    return true;
  }

  /** The C++ guard `isAtEnd() || peak().type != X` is `!this.check(X)`. */
  private check(type: TokenType) {
    return !this.isAtEnd() && this.peek().type === type;
  }

  private parseIdentifier(): string {
    // The C++ error message calls peak(), which itself throws at end of input.
    const t = this.peek();
    if (t.type !== "IDENTIFIER")
      throw syntax(`SYNTAX ERROR: expected identifier, got '${t.lexeme}'`);
    this.advance();
    return t.lexeme;
  }

  private parseSelect(): SelectStatement {
    this.advance();
    const stmt: SelectStatement = {
      kind: "select",
      selectStar: false,
      columns: [],
      table: "",
      where: null,
      orderBy: null,
      orderDir: "ASC",
      limit: null,
    };

    if (this.match("STAR")) {
      stmt.selectStar = true;
    } else {
      stmt.columns.push(this.parseIdentifier());
      while (this.match("COMMA")) stmt.columns.push(this.parseIdentifier());
    }

    if (!this.check("FROM")) throw syntax("SYNTAX ERROR: expected FROM");
    this.advance();
    stmt.table = this.parseIdentifier();

    if (this.match("WHERE")) stmt.where = this.parseExpression();

    if (this.match("ORDER")) {
      if (!this.check("BY"))
        throw syntax("SYNTAX ERROR: expected BY after ORDER");
      this.advance();
      stmt.orderBy = this.parseIdentifier();
      if (this.match("ASC")) stmt.orderDir = "ASC";
      else if (this.match("DESC")) stmt.orderDir = "DESC";
    }

    if (this.match("LIMIT")) {
      if (!this.check("NUMBER"))
        throw syntax("SYNTAX ERROR: expected number after LIMIT");
      stmt.limit = Number.parseInt(this.peek().lexeme, 10);
      this.advance();
    }

    return stmt;
  }

  private parseExpression(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.match("OR"))
      left = { kind: "binary", op: "OR", left, right: this.parseAnd() };
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseEquality();
    while (this.match("AND"))
      left = { kind: "binary", op: "AND", left, right: this.parseEquality() };
    return left;
  }

  private parseEquality(): Expr {
    let left = this.parseComparison();
    while (
      !this.isAtEnd() &&
      (this.peek().type === "EQUAL" || this.peek().type === "NOT_EQUAL")
    ) {
      const op: BinaryOp = this.peek().type === "EQUAL" ? "=" : "!=";
      this.advance();
      left = { kind: "binary", op, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): Expr {
    let left = this.parsePrimary();
    for (;;) {
      const op = this.isAtEnd() ? undefined : COMPARISON_OPS[this.peek().type];
      if (!op) return left;
      this.advance();
      left = { kind: "binary", op, left, right: this.parsePrimary() };
    }
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.type === "LPAREN") {
      this.advance();
      const inner = this.parseExpression();
      if (!this.check("RPAREN")) throw syntax("SYNTAX ERROR: expected ')'");
      this.advance();
      return inner;
    }
    if (LITERALS.has(t.type)) {
      this.advance();
      return { kind: "literal", token: t };
    }
    if (t.type === "IDENTIFIER") {
      this.advance();
      return { kind: "identifier", name: t.lexeme };
    }
    throw syntax(`SYNTAX ERROR: unexpected token '${t.lexeme}'`);
  }

  private parseInsert(): InsertStatement {
    this.advance();
    if (!this.check("INTO"))
      throw syntax("SYNTAX ERROR: expected INTO after INSERT.");
    this.advance();
    const table = this.parseIdentifier();

    if (!this.check("VALUES"))
      throw syntax("SYNTAX ERROR: expected VALUES after tableName.");
    this.advance();
    if (!this.check("LPAREN"))
      throw syntax("SYNTAX ERROR: expected '(' after VALUES");
    this.advance();

    const values = this.parseValues();

    if (!this.check("RPAREN"))
      throw syntax("SYNTAX ERROR: expected ')' after value list");
    this.advance();
    return { kind: "insert", table, values };
  }

  private parseValues(): Token[] {
    if (this.isAtEnd())
      throw syntax("SYNTAX ERROR: expected value, got end of input");
    const first = this.peek();
    if (!LITERALS.has(first.type))
      throw syntax(`SYNTAX ERROR: expected literal got: ${first.lexeme}`);
    const values = [first];
    this.advance();

    while (this.match("COMMA")) {
      const t = this.peek();
      if (!LITERALS.has(t.type))
        throw syntax("SYNTAX Error: expected literal after ,");
      values.push(t);
      this.advance();
    }
    return values;
  }

  private parseDelete(): DeleteStatement {
    this.advance();
    if (!this.check("FROM"))
      throw syntax("SYNTAX ERROR: expected FROM after DELETE.");
    this.advance();
    const table = this.parseIdentifier();
    const where = this.match("WHERE") ? this.parseExpression() : null;
    return { kind: "delete", table, where };
  }

  private parseCreate(): CreateStatement {
    if (!this.check("TABLE"))
      throw syntax("SYNTAX ERROR: expected table/index after create.");
    this.advance();
    const table = this.parseIdentifier();

    if (!this.check("LPAREN"))
      throw syntax("SYNTAX ERROR: expected '(' after table name");
    this.advance();

    const columns = [this.parseColumnDef()];
    while (this.match("COMMA")) columns.push(this.parseColumnDef());

    if (!this.check("RPAREN"))
      throw syntax("SYNTAX ERROR: expected ')' after column definitions");
    this.advance();
    return { kind: "create", table, columns };
  }

  private parseColumnDef(): ColumnDef {
    const name = this.parseIdentifier();
    if (this.isAtEnd())
      throw syntax(`SYNTAX ERROR: expected type after column name '${name}'`);
    const type = this.peek().type;
    if (!COLUMN_TYPES.has(type))
      throw syntax(
        `SYNTAX ERROR: expected INT, TEXT, or BOOL for column '${name}'`,
      );
    this.advance();
    return { name, type: type as ColumnType };
  }

  private parseIndex(): CreateIndexStatement {
    if (!this.check("INDEX"))
      throw syntax("SYNTAX ERROR: expected index/table after create.");
    this.advance();
    const index = this.parseIdentifier();

    if (!this.check("ON"))
      throw syntax("SYNTAX ERROR: expected ON after index name.");
    this.advance();
    const table = this.parseIdentifier();

    if (!this.check("LPAREN"))
      throw syntax("SYNTAX ERROR: expected '(' after table name");
    this.advance();

    const columns = [this.parseIdentifier()];
    while (this.match("COMMA")) columns.push(this.parseIdentifier());

    if (!this.check("RPAREN"))
      throw syntax("SYNTAX ERROR: expected ')' after column definitions");
    this.advance();
    return { kind: "createIndex", index, table, columns };
  }

  private parseTransaction(
    action: TransactionStatement["action"],
  ): TransactionStatement {
    this.advance();
    if (!this.isAtEnd())
      throw syntax(`SYNTAX ERROR: INCORRECT ${action} SYNTAX.`);
    return { kind: "transaction", action };
  }
}

export function parse(tokens: Token[]): Statement {
  return new Parser(tokens).parseStatement();
}
