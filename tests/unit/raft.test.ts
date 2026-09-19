import { describe, expect, test } from "vitest";
import { RaftCluster } from "@/lib/raft/sim";

const run = (cluster: RaftCluster, ms: number, dt = 16) => {
  for (let t = 0; t < ms; t += dt) cluster.step(dt);
};

/** Runs until `done` holds, failing if it takes longer than `limitMs`. */
const runUntil = (
  cluster: RaftCluster,
  done: () => boolean,
  limitMs: number,
  dt = 16,
) => {
  for (let t = 0; t < limitMs; t += dt) {
    if (done()) return;
    cluster.step(dt);
  }
  if (!done()) throw new Error(`condition not reached within ${limitMs} ms`);
};

describe("leader election", () => {
  test("a cold cluster elects exactly one leader, and followers adopt its term", () => {
    const cluster = new RaftCluster({ seed: 1 });
    runUntil(cluster, () => cluster.leader !== null, 10_000);
    run(cluster, 2_000);

    const leaders = cluster.nodes.filter((n) => n.role === "leader");
    expect(leaders).toHaveLength(1);
    for (const node of cluster.nodes) expect(node.term).toBe(leaders[0]!.term);
  });

  test("crashing the leader produces a new leader in a higher term", () => {
    const cluster = new RaftCluster({ seed: 2 });
    runUntil(cluster, () => cluster.leader !== null, 10_000);
    const old = cluster.leader!;
    const oldTerm = old.term;

    cluster.crash(old.id);
    runUntil(
      cluster,
      () => cluster.leader !== null && cluster.leader.id !== old.id,
      10_000,
    );
    expect(cluster.leader!.term).toBeGreaterThan(oldTerm);
  });

  test("with only a minority alive, nobody can win an election", () => {
    const cluster = new RaftCluster({ seed: 3 });
    runUntil(cluster, () => cluster.leader !== null, 10_000);
    const leaderId = cluster.leader!.id;
    const others = cluster.nodes
      .filter((n) => n.id !== leaderId)
      .map((n) => n.id);
    cluster.crash(leaderId);
    cluster.crash(others[0]!);
    cluster.crash(others[1]!);

    run(cluster, 15_000);
    expect(cluster.leader).toBeNull();
    expect(cluster.write("x")).toBe(false);
  });
});

describe("log replication", () => {
  test("a write commits once a majority has it, and followers learn the commit", () => {
    const cluster = new RaftCluster({ seed: 4 });
    runUntil(cluster, () => cluster.leader !== null, 10_000);
    expect(cluster.write("set x=1")).toBe(true);

    runUntil(
      cluster,
      () => cluster.nodes.every((n) => n.commitIndex === 1),
      6_000,
    );
    for (const node of cluster.nodes) {
      expect(node.log.map((e) => e.value)).toEqual(["set x=1"]);
    }
  });

  test("writes are refused while there is no leader", () => {
    const cluster = new RaftCluster({ seed: 5 });
    expect(cluster.leader).toBeNull();
    expect(cluster.write("too early")).toBe(false);
  });

  test("a restarted server catches up on everything it missed", () => {
    const cluster = new RaftCluster({ seed: 6 });
    runUntil(cluster, () => cluster.leader !== null, 10_000);
    const lagger = cluster.nodes.find((n) => n.role !== "leader")!;
    cluster.crash(lagger.id);

    for (const value of ["a", "b", "c"]) {
      runUntil(cluster, () => cluster.leader !== null, 10_000);
      cluster.write(value);
      run(cluster, 1_500);
    }
    cluster.restart(lagger.id);

    const leader = () => cluster.leader!;
    runUntil(
      cluster,
      () =>
        cluster.leader !== null &&
        cluster.node(lagger.id).log.length === leader().log.length &&
        cluster.node(lagger.id).commitIndex === leader().commitIndex,
      12_000,
    );
    expect(cluster.node(lagger.id).log.map((e) => e.value)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("safety under chaos", () => {
  test.each(Array.from({ length: 20 }, (_, i) => i + 10))(
    "seed %i: at most one leader per term, and committed entries never change",
    (seed) => {
      const cluster = new RaftCluster({ seed });
      const leadersByTerm = new Map<number, Set<number>>();
      const committed: string[] = [];
      let chaos = seed * 7919;
      const rand = () => {
        chaos = (chaos * 16807) % 2147483647;
        return chaos / 2147483647;
      };

      for (let t = 0; t < 60_000; t += 16) {
        cluster.step(16);

        for (const node of cluster.nodes) {
          if (node.role !== "leader") continue;
          const set = leadersByTerm.get(node.term) ?? new Set<number>();
          set.add(node.id);
          leadersByTerm.set(node.term, set);
        }

        // Every alive node's committed prefix must extend what anyone has ever committed.
        for (const node of cluster.nodes) {
          const prefix = node.log
            .slice(0, node.commitIndex)
            .map((e) => `${e.term}:${e.value}`);
          const shared = Math.min(prefix.length, committed.length);
          expect(prefix.slice(0, shared)).toEqual(committed.slice(0, shared));
          if (prefix.length > committed.length)
            committed.splice(0, committed.length, ...prefix);
        }

        if (t % 1_500 === 0) {
          const r = rand();
          const target =
            cluster.nodes[Math.floor(rand() * cluster.nodes.length)]!;
          if (r < 0.3) cluster.crash(target.id);
          else if (r < 0.6) cluster.restart(target.id);
          else cluster.write(`w${t}`);
        }
      }

      for (const [, ids] of leadersByTerm) expect(ids.size).toBe(1);
      expect(leadersByTerm.size).toBeGreaterThan(0);
    },
  );
});

describe("determinism", () => {
  test("the same seed and the same inputs give the same history", () => {
    const script = (cluster: RaftCluster) => {
      run(cluster, 6_000);
      cluster.write("a");
      run(cluster, 2_000);
      if (cluster.leader) cluster.crash(cluster.leader.id);
      run(cluster, 8_000);
      return cluster.events.map((e) => `${e.at}|${e.text}`);
    };
    expect(script(new RaftCluster({ seed: 42 }))).toEqual(
      script(new RaftCluster({ seed: 42 })),
    );
  });

  test("the event feed narrates elections in plain words", () => {
    const cluster = new RaftCluster({ seed: 7 });
    runUntil(cluster, () => cluster.leader !== null, 10_000);
    const texts = cluster.events.map((e) => e.text);
    expect(texts.some((t) => /timed out/.test(t))).toBe(true);
    expect(texts.some((t) => /is leader for term \d+/.test(t))).toBe(true);
  });
});

describe("in-flight messages, for drawing", () => {
  test("messages report progress between 0 and 1 and disappear on delivery", () => {
    const cluster = new RaftCluster({ seed: 8 });
    runUntil(cluster, () => cluster.messages.length > 0, 10_000);
    for (const m of cluster.messages) {
      const p = cluster.progress(m);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    const ids = new Set(cluster.messages.map((m) => m.id));
    run(cluster, 2_000);
    for (const m of cluster.messages) expect(ids.has(m.id)).toBe(false);
  });

  test("crashed servers neither send nor receive", () => {
    const cluster = new RaftCluster({ seed: 9 });
    runUntil(cluster, () => cluster.leader !== null, 10_000);
    const victim = cluster.nodes.find((n) => n.role !== "leader")!;
    cluster.crash(victim.id);
    run(cluster, 5_000);
    expect(cluster.messages.some((m) => m.from === victim.id)).toBe(false);
    expect(cluster.node(victim.id).role).toBe("down");
  });
});
