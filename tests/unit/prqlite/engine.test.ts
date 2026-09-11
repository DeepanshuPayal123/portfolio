import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Database, splitStatements, type PlanNode } from "@/lib/prqlite/engine";

interface GoldenCase {
  sql: string;
  output: string;
}
const golden: { source: string; cases: GoldenCase[] } = JSON.parse(
  readFileSync("tests/golden/prqlite.golden.json", "utf8"),
);

const seeded = () => {
  const db = new Database();
  for (const sql of [
    "CREATE TABLE users (id INT, name TEXT, active BOOL)",
    "INSERT INTO users VALUES (1, 'alice', true)",
    "INSERT INTO users VALUES (2, 'bob', false)",
    "INSERT INTO users VALUES (3, 'carol', true)",
    "INSERT INTO users VALUES (4, 'dave', false)",
  ]) {
    const result = db.execute(sql);
    if (result.error) throw result.error;
  }
  return db;
};

const operators = (plan: PlanNode | undefined) => {
  const chain: string[] = [];
  for (let node = plan; node; node = node.child ?? undefined)
    chain.push(node.operator);
  return chain;
};

describe("differential test against the real C++ engine", () => {
  test(`every corpus statement prints exactly what ${golden.source} printed`, () => {
    const db = new Database();
    for (const { sql, output } of golden.cases) {
      const { statements } = splitStatements(sql);
      expect(statements, sql).toHaveLength(1);
      expect(db.execute(statements[0]!).output, sql).toBe(output);
    }
  });
});

describe("REPL statement splitting (src/main.cpp)", () => {
  test('statements end at ";" and may span lines', () => {
    expect(splitStatements("SELECT * FROM users;\nBEGIN;")).toEqual({
      statements: ["SELECT * FROM users", "BEGIN"],
      pending: null,
    });
    expect(splitStatements("SELECT *\nFROM users\nWHERE id = 1;")).toEqual({
      statements: ["SELECT * FROM users WHERE id = 1"],
      pending: null,
    });
    expect(splitStatements("BEGIN;\n\n  ")).toEqual({
      statements: ["BEGIN"],
      pending: null,
    });
  });

  test('like the REPL, the rest of a line after ";" is dropped, and unterminated input waits', () => {
    expect(splitStatements("BEGIN; COMMIT;")).toEqual({
      statements: ["BEGIN"],
      pending: null,
    });
    expect(splitStatements("SELECT * FROM users")).toEqual({
      statements: [],
      pending: "SELECT * FROM users",
    });
  });
});

describe("stages, plan and trace for the visualizer", () => {
  test("a SELECT exposes every stage", () => {
    const r = seeded().execute("SELECT name FROM users WHERE id > 2");
    expect(r.error).toBeNull();
    expect(r.stages.tokens?.map((t) => t.type)).toEqual([
      "SELECT",
      "IDENTIFIER",
      "FROM",
      "IDENTIFIER",
      "WHERE",
      "IDENTIFIER",
      "GREATER",
      "NUMBER",
    ]);
    expect(r.stages.ast?.kind).toBe("select");
    expect(r.stages.analysis?.checks).toContain("table 'users' exists");
    expect(operators(r.stages.plan)).toEqual([
      "Projection",
      "Filter",
      "SeqScan",
    ]);
    expect(r.columns?.map((c) => c.name)).toEqual(["name"]);
    expect(r.rows).toEqual([["carol"], ["dave"]]);
  });

  test("operator trees match executor_engine.cpp", () => {
    const db = seeded();
    expect(operators(db.execute("SELECT * FROM users").stages.plan)).toEqual([
      "Filter",
      "SeqScan",
    ]);
    expect(
      operators(db.execute("DELETE FROM users WHERE id = 4").stages.plan),
    ).toEqual(["Delete", "Filter", "SeqScan"]);
    expect(
      operators(
        db.execute("INSERT INTO users VALUES (5, 'eve', true)").stages.plan,
      ),
    ).toEqual(["Insert"]);
    expect(operators(db.execute("BEGIN").stages.plan)).toEqual(["Transaction"]);
  });

  test("the executor pulls one tuple at a time up the operator chain", () => {
    const r = seeded().execute("SELECT name FROM users WHERE id > 2");
    expect(r.trace.map((e) => `${e.operator}:${e.action}`)).toEqual([
      "SeqScan:emit",
      "Filter:reject",
      "SeqScan:emit",
      "Filter:reject",
      "SeqScan:emit",
      "Filter:pass",
      "Projection:emit",
      "SeqScan:emit",
      "Filter:pass",
      "Projection:emit",
    ]);
    expect(r.trace[0]).toMatchObject({
      rid: { pageId: 1, slotId: 0 },
      values: [1, "alice", true],
    });
    expect(r.trace.at(-1)).toMatchObject({ values: ["dave"] });
  });

  test("errors stop the pipeline at the stage that raised them", () => {
    const db = seeded();
    const lex = db.execute("SELECT * FROM users WHERE name = 'bob");
    expect(lex.error?.stage).toBe("lexer");
    expect(lex.stages.tokens).toBeUndefined();

    const syntax = db.execute("SELECT * users");
    expect(syntax.error?.stage).toBe("parser");
    expect(syntax.stages.tokens).toBeDefined();
    expect(syntax.stages.ast).toBeUndefined();

    const semantic = db.execute("SELECT email FROM users");
    expect(semantic.error?.stage).toBe("analyzer");
    expect(semantic.stages.ast).toBeDefined();
    expect(semantic.stages.analysis).toBeUndefined();

    const txn = db.execute("COMMIT");
    expect(txn.error?.stage).toBe("executor");
    expect(txn.stages.plan).toBeDefined();
  });

  test("parsed-but-unimplemented features are reported, never faked", () => {
    const db = seeded();
    const ordered = db.execute("SELECT * FROM users ORDER BY id DESC LIMIT 1");
    expect(ordered.rows).toHaveLength(4);
    expect(ordered.notes.join(" ")).toMatch(/ORDER BY/);
    expect(ordered.notes.join(" ")).toMatch(/LIMIT/);
    expect(
      db.execute("CREATE INDEX idx ON users (id)").notes.join(" "),
    ).toMatch(/index/i);
  });

  test("ROLLBACK runs the undo closures newest-first", () => {
    const db = seeded();
    db.execute("BEGIN");
    expect(db.inTransaction).toBe(true);
    db.execute("DELETE FROM users WHERE id = 2 OR id = 4");
    db.execute("INSERT INTO users VALUES (9, 'zed', true)");

    const rollback = db.execute("ROLLBACK");
    expect(rollback.trace.map((e) => `${e.operator}:${e.action}`)).toEqual([
      "Txn:undo-insert",
      "Txn:undo-delete",
      "Txn:undo-delete",
    ]);
    expect(rollback.trace.map((e) => e.values?.[0])).toEqual([9, 4, 2]);
    expect(db.inTransaction).toBe(false);
    expect(db.execute("SELECT id FROM users").rows).toEqual([
      [1],
      [2],
      [3],
      [4],
    ]);
  });

  test("exposes the storage layout for the page view", () => {
    const db = seeded();
    db.execute("DELETE FROM users WHERE id = 2");
    const [users] = db.tables();
    expect(users!.schema.name).toBe("users");
    expect(users!.heap.pages).toHaveLength(1);
    expect(users!.heap.pages[0]!.slots()[1]).toEqual({ offset: 0, size: 0 });
  });
});
