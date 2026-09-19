import { useEffect, useReducer, useRef, useState } from "react";
import {
  RaftCluster,
  type EventKind,
  type Message,
  type RaftNode,
  type Role,
} from "@/lib/raft/sim";

// A live Raft cluster: the simulation in @/lib/raft/sim, drawn every frame. Servers are
// real buttons (click to crash or restart); the SVG behind them is decoration.

const SEED = 7;
const VIEW = 560;
const CENTRE = VIEW / 2;
const RING = 196;
const NODE_R = 36;
const TIMER_R = NODE_R + 8;
const TIMER_LENGTH = 2 * Math.PI * TIMER_R;
const RIPPLE_MS = 700;
const AMBIENT_WRITE_MS = 4500;
const LOG_SHOWN = 8;
const FEED_SHOWN = 6;

const ROLE_LABEL: Record<Role, string> = {
  leader: "leader",
  follower: "follower",
  candidate: "candidate",
  down: "offline",
};

const EVENT_DOT: Record<EventKind, string> = {
  election: "bg-amber",
  leader: "bg-accent",
  commit: "bg-ok",
  crash: "bg-err",
  restart: "bg-dim",
  write: "bg-highlight",
  "step-down": "bg-dim",
};

function place(index: number, count: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return {
    x: CENTRE + RING * Math.cos(angle),
    y: CENTRE + RING * Math.sin(angle),
  };
}

function messageLook(message: Message) {
  switch (message.kind) {
    case "append":
      return message.entries!.length > 0
        ? { r: 5.5, fill: "var(--highlight)", opacity: 1 }
        : { r: 3.2, fill: "var(--accent)", opacity: 0.95 };
    case "append-ack":
      return { r: 2.6, fill: "var(--accent)", opacity: 0.45 };
    case "vote-req":
      return { r: 4.2, fill: "var(--amber)", opacity: 1 };
    case "vote":
      return message.granted
        ? { r: 3.6, fill: "var(--ok)", opacity: 1 }
        : { r: 3, fill: "var(--err)", opacity: 0.8 };
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export default function RaftDemo() {
  const cluster = useRef<RaftCluster | null>(null);
  if (!cluster.current) cluster.current = new RaftCluster({ seed: SEED });
  const sim = cluster.current;

  const root = useRef<HTMLDivElement>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [userStarted, setUserStarted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const resets = useRef(0);
  const writes = useRef(0);
  const lastWriteAt = useRef(0);

  const started = reduced === false || userStarted;
  const running = started && visible && !pageHidden;

  const write = (target: RaftCluster) => {
    writes.current += 1;
    lastWriteAt.current = target.now;
    return target.write(`x = ${writes.current}`);
  };

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry!.isIntersecting),
      { threshold: 0.15 },
    );
    observer.observe(element);
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const current = cluster.current!;
      current.step(Math.min(50, now - last));
      last = now;
      // Ambient traffic, so the cluster looks alive even before anyone touches it.
      if (
        current.leader &&
        current.now - lastWriteAt.current > AMBIENT_WRITE_MS
      )
        write(current);
      redraw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const sendWrite = () => {
    setNotice(
      write(sim)
        ? null
        : "No leader right now — a write needs a majority to agree first.",
    );
    redraw();
  };

  const crashLeader = () => {
    const leader = sim.leader;
    if (!leader) {
      setNotice("No leader to crash — an election is in progress.");
      return;
    }
    sim.crash(leader.id);
    setNotice(null);
    redraw();
  };

  const toggle = (node: RaftNode) => {
    if (node.role === "down") sim.restart(node.id);
    else sim.crash(node.id);
    redraw();
  };

  const reset = () => {
    resets.current += 1;
    cluster.current = new RaftCluster({ seed: SEED + resets.current });
    writes.current = 0;
    lastWriteAt.current = 0;
    setNotice(null);
    redraw();
  };

  const positions = sim.nodes.map((_, i) => place(i, sim.nodes.length));
  const leader = sim.leader;
  const alive = sim.nodes.filter((n) => n.role !== "down");
  const term = Math.max(0, ...sim.nodes.map((n) => n.term));
  const committed =
    leader?.commitIndex ?? Math.max(0, ...alive.map((n) => n.commitIndex));
  const feed = sim.events.slice(-FEED_SHOWN).reverse();
  const announcement =
    [...sim.events]
      .reverse()
      .find((e) => e.kind === "leader" || e.kind === "crash")?.text ?? "";

  return (
    <div
      ref={root}
      data-raft
      data-running={String(running)}
      data-term={term}
      data-leader={leader?.id ?? ""}
      data-committed={committed}
      className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center"
    >
      <div>
        <div className="raft-stage">
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <circle cx={CENTRE} cy={CENTRE} r={RING * 0.62} className="raft-core" />
            <circle cx={CENTRE} cy={CENTRE} r={RING} className="raft-ring" />
            <text x={CENTRE} y={CENTRE - 4} textAnchor="middle" className="raft-caption">
              {sim.nodes.length} servers
            </text>
            <text x={CENTRE} y={CENTRE + 16} textAnchor="middle" className="raft-caption is-dim">
              majority {sim.majority}
            </text>
            {positions.flatMap((a, i) =>
              positions
                .slice(i + 1)
                .map((b, j) => (
                  <line
                    key={`${i}-${j}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className="raft-mesh"
                  />
                )),
            )}

            {sim.nodes.map((node, i) => {
              const p = positions[i]!;
              if (node.role === "leader") {
                const phase = clamp01(
                  (sim.now - (node.heartbeatDue - sim.timing.heartbeat)) /
                    RIPPLE_MS,
                );
                return phase < 1 ? (
                  <circle
                    key={`fx-${node.id}`}
                    cx={p.x}
                    cy={p.y}
                    r={NODE_R + 4 + phase * 34}
                    className="raft-ripple"
                    opacity={(1 - phase) * 0.7}
                  />
                ) : null;
              }
              if (node.role === "down") return null;
              const remaining = clamp01(
                (node.electionDeadline - sim.now) /
                  (node.electionDeadline - node.electionStarted),
              );
              return (
                <circle
                  key={`fx-${node.id}`}
                  cx={p.x}
                  cy={p.y}
                  r={TIMER_R}
                  className={`raft-timer${remaining < 0.3 ? " is-low" : ""}`}
                  strokeDasharray={TIMER_LENGTH}
                  strokeDashoffset={TIMER_LENGTH * (1 - remaining)}
                  transform={`rotate(-90 ${p.x} ${p.y})`}
                />
              );
            })}

            {sim.messages.map((message) => {
              const a = positions[message.from - 1]!;
              const b = positions[message.to - 1]!;
              const length = Math.hypot(b.x - a.x, b.y - a.y);
              const ux = (b.x - a.x) / length;
              const uy = (b.y - a.y) / length;
              const sx = a.x + ux * NODE_R;
              const sy = a.y + uy * NODE_R;
              const span = length - 2 * NODE_R;
              const t = sim.progress(message);
              const tail = Math.max(0, t - 0.14);
              const look = messageLook(message);
              return (
                <g key={message.id} opacity={look.opacity}>
                  <line
                    x1={sx + ux * span * tail}
                    y1={sy + uy * span * tail}
                    x2={sx + ux * span * t}
                    y2={sy + uy * span * t}
                    stroke={look.fill}
                    strokeWidth={look.r * 0.9}
                    strokeLinecap="round"
                    opacity={0.35}
                  />
                  <circle
                    cx={sx + ux * span * t}
                    cy={sy + uy * span * t}
                    r={look.r * 2.6}
                    fill={look.fill}
                    opacity={0.18}
                  />
                  <circle
                    cx={sx + ux * span * t}
                    cy={sy + uy * span * t}
                    r={look.r}
                    fill={look.fill}
                  />
                </g>
              );
            })}

            {sim.nodes.map((node, i) => {
              const p = positions[i]!;
              const shown = node.log.slice(-LOG_SHOWN);
              const offset = node.log.length - shown.length;
              const width = shown.length * 12 - 3;
              return (
                <g
                  key={`log-${node.id}`}
                  opacity={node.role === "down" ? 0.4 : 1}
                >
                  {shown.map((entry, k) => (
                    <rect
                      key={offset + k}
                      x={p.x - width / 2 + k * 12}
                      y={p.y + NODE_R + 14}
                      width={9}
                      height={9}
                      rx={2}
                      className={
                        offset + k < node.commitIndex
                          ? "raft-entry is-committed"
                          : "raft-entry"
                      }
                    >
                      <title>{`#${offset + k + 1} ${entry.value} (term ${entry.term})`}</title>
                    </rect>
                  ))}
                </g>
              );
            })}
          </svg>

          {sim.nodes.map((node, i) => {
            const p = positions[i]!;
            return (
              <button
                key={node.id}
                type="button"
                data-node-id={node.id}
                data-role={node.role}
                aria-label={`S${node.id}, ${ROLE_LABEL[node.role]}, term ${node.term}. ${node.role === "down" ? "Restart" : "Crash"} this server`}
                onClick={() => toggle(node)}
                className="raft-node"
                style={{
                  left: `${(p.x / VIEW) * 100}%`,
                  top: `${(p.y / VIEW) * 100}%`,
                  width: `${((NODE_R * 2) / VIEW) * 100}%`,
                }}
              >
                {node.role === "leader" && (
                  <span className="raft-crown" aria-hidden="true">
                    ★
                  </span>
                )}
                <span className="raft-node-id">S{node.id}</span>
                <span className="raft-node-role">{ROLE_LABEL[node.role]}</span>
              </button>
            );
          })}

          {reduced && !userStarted && (
            <div className="absolute inset-0 grid place-items-center">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setUserStarted(true)}
              >
                Start simulation
              </button>
            </div>
          )}
        </div>

        <ul
          className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-dim"
          aria-hidden="true"
        >
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-accent" /> heartbeat
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-highlight" /> log entry
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-amber" /> vote request
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-ok" /> vote
          </li>
          <li className="flex items-center gap-2">
            <span className="size-3 rounded-full border-2 border-dim" />{" "}
            election timer
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-line bg-panel/40 p-3 sm:p-4">
            <dt className="mono-label">Term</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
              {term}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-panel/40 p-3 sm:p-4">
            <dt className="mono-label">Leader</dt>
            <dd
              className={`mt-1 font-mono text-2xl font-semibold sm:text-3xl ${leader ? "text-accent" : "text-amber"}`}
            >
              {leader ? `S${leader.id}` : "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-panel/40 p-3 sm:p-4">
            <dt className="mono-label">Committed</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
              {committed}
            </dd>
          </div>
        </dl>

        <div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={sendWrite}
            >
              Send write
            </button>
            <button type="button" className="btn" onClick={crashLeader}>
              Crash leader
            </button>
            <button type="button" className="btn" onClick={reset}>
              Reset
            </button>
          </div>
          <p className="mt-3 text-sm text-dim">
            Tip: click any server to crash it — click again to bring it back.
          </p>
          {notice && (
            <p role="status" className="mt-2 text-sm text-amber">
              {notice}
            </p>
          )}
        </div>

        <div>
          <p className="mono-label">Event log</p>
          <ol className="mt-3 space-y-2">
            {feed.length === 0 && (
              <li className="text-sm text-dim">
                Waiting for the first election timeout…
              </li>
            )}
            {feed.map((event, i) => (
              <li
                key={`${event.at}-${event.text}`}
                className={`raft-event flex items-start gap-3 text-sm ${i === 0 ? "text-ink" : "text-dim"}`}
              >
                <span className="mt-1.5 w-14 shrink-0 font-mono text-xs text-dim tabular-nums">
                  {(event.at / 1000).toFixed(1)}s
                </span>
                <span
                  className={`mt-2 size-1.5 shrink-0 rounded-full ${EVENT_DOT[event.kind]}`}
                />
                <span>{event.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
