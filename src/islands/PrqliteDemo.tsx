import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  PRESETS,
  STAGES,
  astLines,
  finalStageIndex,
  pageViews,
  seededDatabase,
  stageStatuses,
  traceLine,
  type StageStatus,
  type Tone,
} from "@/lib/prqlite/demo";
import {
  formatValue,
  splitStatements,
  type Database,
  type RunResult,
} from "@/lib/prqlite/engine";
import { tupleWidth } from "@/lib/prqlite/storage";
import type { Token } from "@/lib/prqlite/lexer";

interface LogEntry {
  id: number;
  sql: string;
  output: string;
}

const STEP_MS = 380;
const MAX_LOG = 200;
const MAX_STATEMENTS = 25;
const MAX_TRACE = 150;

const TONE: Record<Tone, string> = {
  ok: "text-ok",
  err: "text-err",
  dim: "text-dim",
  accent: "text-accent",
  amber: "text-amber",
};

const STATUS_ICON: Record<StageStatus | "idle", string> = {
  ok: "✓",
  error: "✗",
  skipped: "–",
  idle: "·",
};

const LITERALS = new Set(["NUMBER", "STRING", "TRUE", "FALSE"]);
const PUNCTUATION = new Set([
  "COMMA",
  "SEMICOLON",
  "STAR",
  "LPAREN",
  "RPAREN",
  "EQUAL",
  "LESS",
  "GREATER",
  "LESS_EQUAL",
  "GREATER_EQUAL",
  "NOT_EQUAL",
]);

function tokenTone(token: Token) {
  if (token.type === "IDENTIFIER") return "text-ink";
  if (LITERALS.has(token.type)) return "text-amber";
  if (PUNCTUATION.has(token.type)) return "text-dim";
  return "text-accent";
}

export default function PrqliteDemo() {
  const db = useRef<Database | null>(null);
  if (!db.current) db.current = seededDatabase();

  const [sql, setSql] = useState(PRESETS[0]!.sql);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [last, setLast] = useState<RunResult | null>(null);
  const [stage, setStage] = useState(0);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const timers = useRef<number[]>([]);
  const nextId = useRef(1);
  const consoleRef = useRef<HTMLPreElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const stopStepping = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => stopStepping, []);
  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [log]);

  const run = () => {
    stopStepping();
    const { statements, pending } = splitStatements(sql);
    const toRun = [...statements, ...(pending ? [pending] : [])].slice(
      0,
      MAX_STATEMENTS,
    );
    if (toRun.length === 0) return;

    const entries: LogEntry[] = [];
    let result: RunResult | null = null;
    for (const statement of toRun) {
      result = db.current!.execute(statement);
      entries.push({
        id: nextId.current++,
        sql: statement.trim(),
        output: result.output,
      });
    }
    setLog((prev) => [...prev, ...entries].slice(-MAX_LOG));
    setLast(result);
    refresh();
    if (!result) return;

    // Step through the stages the query reached; reduced motion jumps straight there.
    const target = finalStageIndex(result);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage(target);
      return;
    }
    setStage(0);
    for (let i = 1; i <= target; i++)
      timers.current.push(window.setTimeout(() => setStage(i), i * STEP_MS));
  };

  const reset = () => {
    stopStepping();
    db.current = seededDatabase();
    setLog([]);
    setLast(null);
    setStage(0);
    refresh();
  };

  const onEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    stopStepping();
    const next =
      (stage + (e.key === "ArrowRight" ? 1 : -1) + STAGES.length) %
      STAGES.length;
    setStage(next);
    tabRefs.current[next]?.focus();
  };

  const statuses = last ? stageStatuses(last) : null;
  const tables = db.current.tables();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="mono-label text-accent!">● Live demo</p>
          <p className="mt-1 text-sm text-dim">
            A TypeScript browser port of the C++ engine, checked byte-for-byte
            against the real REPL. Run a query and watch it move through every
            stage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {db.current.inTransaction && (
            <span className="chip text-amber!">● in transaction</span>
          )}
          <button type="button" onClick={reset} className="btn">
            Reset DB
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* Editor and REPL console */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setSql(preset.sql)}
                className="chip transition-colors hover:border-accent hover:text-accent"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="sr-only">SQL</span>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={onEditorKeyDown}
              rows={5}
              spellCheck={false}
              autoCapitalize="off"
              className="w-full resize-y border border-line bg-paper/60 p-3 font-mono text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="flex items-center gap-3">
            <button type="button" onClick={run} className="btn btn-primary">
              Run <kbd className="font-mono text-xs opacity-70">⌘↵</kbd>
            </button>
            <p className="mono-label">users(id INT, name TEXT, active BOOL)</p>
          </div>

          <pre
            ref={consoleRef}
            data-testid="repl-output"
            aria-live="polite"
            className="h-56 overflow-auto border border-line bg-paper/60 p-3 font-mono text-xs leading-relaxed text-ink"
          >
            {log.length === 0
              ? "-- users is seeded with alice, bob, carol, dave and eve.\n-- Pick a preset or write SQL, then Run."
              : log
                  .map((entry) => `db> ${entry.sql};\n${entry.output}`)
                  .join("")}
          </pre>
        </div>

        {/* Stage viewer */}
        <div className="min-w-0 border border-line">
          <div
            role="tablist"
            aria-label="Pipeline stages"
            className="flex overflow-x-auto border-b border-line"
          >
            {STAGES.map((name, i) => {
              const status = statuses?.[i] ?? "idle";
              const selected = stage === i;
              return (
                <button
                  key={name}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`stage-tab-${i}`}
                  aria-selected={selected}
                  aria-controls="stage-panel"
                  tabIndex={selected ? 0 : -1}
                  data-status={status}
                  onClick={() => {
                    stopStepping();
                    setStage(i);
                  }}
                  onKeyDown={onTabKeyDown}
                  className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 font-mono text-xs transition-colors ${
                    selected
                      ? "border-accent text-accent"
                      : "border-transparent text-dim hover:text-ink"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={
                      status === "ok"
                        ? "text-ok"
                        : status === "error"
                          ? "text-err"
                          : "text-dim"
                    }
                  >
                    {STATUS_ICON[status]}
                  </span>
                  {name}
                  {status !== "idle" && (
                    <span className="sr-only">, {status}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id="stage-panel"
            aria-labelledby={`stage-tab-${stage}`}
            className="min-h-72 p-4 text-sm"
          >
            {last ? (
              <StagePanel
                result={last}
                stage={stage}
                status={statuses![stage]!}
              />
            ) : (
              <EmptyPanel />
            )}
          </div>
        </div>
      </div>

      {/* Storage */}
      <div data-testid="storage" className="space-y-4">
        <p className="mono-label">Storage · 4 KB slotted pages</p>
        {tables.map(({ schema, heap }) => (
          <div key={schema.id} className="space-y-2">
            <p className="font-mono text-xs text-dim">
              <span className="text-ink">{schema.name}</span> ·{" "}
              {tupleWidth(schema.columns)} B per row · {heap.totalTuples} live
              tuples · metadata page {heap.metadataPageId}
            </p>
            <div className="flex flex-wrap gap-4">
              {pageViews(heap, schema.columns).map((page) => (
                <div key={page.id} className="border border-line p-2">
                  <p className="mono-label mb-2">
                    page {page.id} · {page.freeBytes} B free
                  </p>
                  <div
                    className="flex flex-wrap gap-1"
                    aria-label={`page ${page.id} slots`}
                  >
                    {page.slots.map((state, i) => (
                      <span
                        key={i}
                        data-slot={state}
                        title={`slot ${i}: ${state === "live" ? "live tuple" : "deleted — zeroed, space not reclaimed"}`}
                        className={`size-3.5 border ${
                          state === "live"
                            ? "border-accent bg-accent/70"
                            : "border-err bg-[repeating-linear-gradient(45deg,var(--err)_0_2px,transparent_2px_4px)]"
                        }`}
                      />
                    ))}
                    {Array.from({ length: page.room }, (_, i) => (
                      <span
                        key={`free-${i}`}
                        data-slot="free"
                        className="size-3.5 border border-line"
                      />
                    ))}
                  </div>
                </div>
              ))}
              {heap.pages.length === 0 && (
                <p className="font-mono text-xs text-dim">no data pages yet</p>
              )}
            </div>
          </div>
        ))}
        <p className="font-mono text-xs text-dim">
          <span className="text-accent">■</span> live{" "}
          <span className="text-err">■</span> deleted (slot zeroed, space never
          reclaimed) <span>□</span> room for another row
        </p>
      </div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <p className="text-dim">
      Run a query. Each tab lights up as the statement passes through that stage
      — tokens from the lexer, the tree from the recursive-descent parser, the
      analyzer's checks, the Volcano operator plan, and every tuple the executor
      pulls.
    </p>
  );
}

function ErrorBox({ result }: { result: RunResult }) {
  return (
    <p className="border-l-2 border-err pl-3 font-mono text-xs text-err">
      Error: {result.error?.message}
    </p>
  );
}

function StagePanel({
  result,
  stage,
  status,
}: {
  result: RunResult;
  stage: number;
  status: StageStatus;
}) {
  if (status === "skipped") {
    return (
      <p className="text-dim">
        Not reached — the statement failed at an earlier stage.
      </p>
    );
  }
  const { tokens, ast, analysis, plan } = result.stages;
  const name = STAGES[stage];

  if (name === "Tokens") {
    if (!tokens) return <ErrorBox result={result} />;
    return (
      <ul className="flex flex-wrap gap-2" aria-label="Tokens">
        {tokens.map((t, i) => (
          <li key={i} className="border border-line px-2 py-1 font-mono">
            <span className={tokenTone(t)}>
              {t.type === "STRING" ? `'${t.lexeme}'` : t.lexeme}
            </span>
            <span className="block text-[0.6rem] tracking-wider text-dim">
              {t.type}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (name === "AST") {
    if (!ast) return <ErrorBox result={result} />;
    return (
      <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-ink">
        {astLines(ast).join("\n")}
      </pre>
    );
  }

  if (name === "Analyzer") {
    if (!analysis) return <ErrorBox result={result} />;
    return analysis.checks.length === 0 ? (
      <p className="text-dim">Nothing to check for a transaction statement.</p>
    ) : (
      <ul className="space-y-1 font-mono text-xs">
        {analysis.checks.map((check, i) => (
          <li key={i}>
            <span className="text-ok">✓</span> {check}
          </li>
        ))}
      </ul>
    );
  }

  if (name === "Plan") {
    const chain = [];
    for (let node = plan ?? null; node; node = node.child) chain.push(node);
    return (
      <ol className="space-y-2">
        {chain.map((node, i) => (
          <li key={i}>
            <div className="border border-line px-3 py-2">
              <p className="font-mono text-xs text-accent">{node.operator}</p>
              <p className="mt-0.5 font-mono text-xs text-dim">{node.detail}</p>
            </div>
            {i < chain.length - 1 && (
              <p className="pl-3 font-mono text-xs text-dim">
                ▲ next() pulls one tuple at a time
              </p>
            )}
          </li>
        ))}
      </ol>
    );
  }

  if (name === "Execution") {
    const lines = result.trace.slice(0, MAX_TRACE).map(traceLine);
    return (
      <div className="space-y-3">
        {result.error && <ErrorBox result={result} />}
        {lines.length === 0 ? (
          <p className="text-dim">
            No tuples moved — this statement only touches the catalog or
            transaction state.
          </p>
        ) : (
          <ol className="max-h-64 space-y-0.5 overflow-y-auto font-mono text-xs">
            {lines.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-20 shrink-0 text-dim">{line.operator}</span>
                <span className={TONE[line.tone]}>{line.text}</span>
              </li>
            ))}
            {result.trace.length > MAX_TRACE && (
              <li className="text-dim">
                … {result.trace.length - MAX_TRACE} more
              </li>
            )}
          </ol>
        )}
        {result.notes.map((note) => (
          <p
            key={note}
            className="border-l-2 border-amber pl-3 text-xs text-amber"
          >
            {note}
          </p>
        ))}
      </div>
    );
  }

  // Result
  if (result.error) return <ErrorBox result={result} />;
  return (
    <div className="space-y-3">
      {result.columns ? (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr>
                {result.columns.map((c) => (
                  <th
                    key={c.name}
                    className="border-b border-line px-2 py-1.5 text-left font-medium text-dim"
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((value, c) => (
                    <td
                      key={c}
                      className="border-b border-line/50 px-2 py-1.5 text-ink"
                    >
                      {formatValue(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 font-mono text-xs text-dim">
            ({result.rows.length} rows)
          </p>
        </div>
      ) : result.affected !== null ? (
        <p className="font-mono text-ink">{result.affected} rows affected</p>
      ) : result.message ? (
        <p className="font-mono text-ink">{result.message}</p>
      ) : (
        <p className="text-dim">
          The REPL prints nothing for this statement — the storage view below
          shows what changed.
        </p>
      )}
      {result.notes.map((note) => (
        <p
          key={note}
          className="border-l-2 border-amber pl-3 text-xs text-amber"
        >
          {note}
        </p>
      ))}
    </div>
  );
}
