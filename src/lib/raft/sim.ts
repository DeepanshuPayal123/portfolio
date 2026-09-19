// A small, deterministic Raft simulation: leader election and log replication over a
// simulated network with latency. Time only moves when step() is called, so the same seed
// and the same inputs always replay the same history. Timings are slowed down so a
// visitor can watch every message.

export type Role = "follower" | "candidate" | "leader" | "down";

export interface Entry {
  term: number;
  value: string;
}

export interface RaftNode {
  id: number;
  role: Role;
  term: number;
  votedFor: number | null;
  log: Entry[];
  /** Number of log entries known to be committed. */
  commitIndex: number;
  electionDeadline: number;
  /** When the current election timer was armed, so the UI can draw it draining. */
  electionStarted: number;
  votes: Set<number>;
  /** Leader only: next log position to send each peer, and how much each peer holds. */
  nextIndex: Map<number, number>;
  matchIndex: Map<number, number>;
  heartbeatDue: number;
}

export type MessageKind = "vote-req" | "vote" | "append" | "append-ack";

export interface Message {
  id: number;
  from: number;
  to: number;
  kind: MessageKind;
  term: number;
  sentAt: number;
  arriveAt: number;
  lastLogIndex?: number;
  lastLogTerm?: number;
  granted?: boolean;
  prevIndex?: number;
  prevTerm?: number;
  entries?: Entry[];
  leaderCommit?: number;
  success?: boolean;
  matchIndex?: number;
}

export type EventKind =
  | "election"
  | "leader"
  | "commit"
  | "crash"
  | "restart"
  | "write"
  | "step-down";

export interface RaftEvent {
  at: number;
  kind: EventKind;
  text: string;
}

/** All in milliseconds. Raft needs a round trip to be well under the election window. */
export interface Timing {
  heartbeat: number;
  electionMin: number;
  electionMax: number;
  /** A fresh cluster's first timeout, shorter so someone is elected quickly. */
  firstElectionMin: number;
  firstElectionMax: number;
  latencyMin: number;
  latencyMax: number;
}

// Tuned over 500 seeds: first leader median 1.8 s (p90 2.6 s); after a leader crash,
// a new one in median 3.2 s (p90 4.5 s) — while packets stay slow enough to watch.
export const DEFAULT_TIMING: Timing = {
  heartbeat: 1000,
  electionMin: 2600,
  electionMax: 6200,
  firstElectionMin: 700,
  firstElectionMax: 3600,
  latencyMin: 280,
  latencyMax: 400,
};

const MAX_EVENTS = 200;

const name = (id: number) => `S${id}`;

/** mulberry32: tiny, fast, and good enough to make runs reproducible. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ClusterOptions {
  seed?: number;
  size?: number;
  timing?: Partial<Timing>;
}

export class RaftCluster {
  readonly nodes: RaftNode[];
  readonly timing: Timing;
  messages: Message[] = [];
  events: RaftEvent[] = [];
  now = 0;
  private readonly random: () => number;
  private nextMessageId = 1;

  constructor({ seed = 1, size = 5, timing }: ClusterOptions = {}) {
    this.random = seeded(seed);
    this.timing = { ...DEFAULT_TIMING, ...timing };
    this.nodes = Array.from({ length: size }, (_, i) => {
      const node: RaftNode = {
        id: i + 1,
        role: "follower",
        term: 0,
        votedFor: null,
        log: [],
        commitIndex: 0,
        electionDeadline: 0,
        electionStarted: 0,
        votes: new Set(),
        nextIndex: new Map(),
        matchIndex: new Map(),
        heartbeatDue: 0,
      };
      this.armElectionTimer(
        node,
        this.timing.firstElectionMin,
        this.timing.firstElectionMax,
      );
      return node;
    });
  }

  get majority(): number {
    return Math.floor(this.nodes.length / 2) + 1;
  }

  /** The current leader; if a stale one hasn't heard the news yet, the newest term wins. */
  get leader(): RaftNode | null {
    let best: RaftNode | null = null;
    for (const node of this.nodes) {
      if (node.role === "leader" && (!best || node.term > best.term))
        best = node;
    }
    return best;
  }

  node(id: number): RaftNode {
    const node = this.nodes.find((n) => n.id === id);
    if (!node) throw new Error(`no server ${id}`);
    return node;
  }

  progress(message: Message): number {
    const span = message.arriveAt - message.sentAt;
    return Math.min(1, Math.max(0, (this.now - message.sentAt) / span));
  }

  step(dtMs: number): void {
    this.now += dtMs;

    const due = this.messages
      .filter((m) => m.arriveAt <= this.now)
      .sort((a, b) => a.arriveAt - b.arriveAt || a.id - b.id);
    if (due.length > 0) {
      const delivered = new Set(due);
      this.messages = this.messages.filter((m) => !delivered.has(m));
      for (const message of due) this.receive(message);
    }

    for (const node of this.nodes) {
      if (node.role === "down") continue;
      if (node.role === "leader") {
        if (this.now >= node.heartbeatDue) this.broadcastAppend(node);
      } else if (this.now >= node.electionDeadline) {
        this.startElection(node);
      }
    }
  }

  /** A client write. Only a leader can accept it; returns false when there is none. */
  write(value: string): boolean {
    const leader = this.leader;
    if (!leader) return false;
    leader.log.push({ term: leader.term, value });
    this.log(
      "write",
      `Client write "${value}" → ${name(leader.id)} (entry #${leader.log.length})`,
    );
    this.broadcastAppend(leader);
    return true;
  }

  crash(id: number): void {
    const node = this.node(id);
    if (node.role === "down") return;
    const wasLeader = node.role === "leader";
    node.role = "down";
    node.votes.clear();
    this.log(
      "crash",
      `${name(id)} crashed${wasLeader ? " — the leader is gone" : ""}`,
    );
  }

  /** Brings a server back. Term, vote and log are persistent; the commit index is relearned. */
  restart(id: number): void {
    const node = this.node(id);
    if (node.role !== "down") return;
    node.role = "follower";
    node.commitIndex = 0;
    node.votes.clear();
    this.armElectionTimer(node);
    this.log("restart", `${name(id)} restarted as a follower`);
  }

  // --- internals -----------------------------------------------------------

  private log(kind: EventKind, text: string) {
    this.events.push({ at: this.now, kind, text });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  private between(min: number, max: number) {
    return min + this.random() * (max - min);
  }

  private armElectionTimer(
    node: RaftNode,
    min = this.timing.electionMin,
    max = this.timing.electionMax,
  ) {
    node.electionStarted = this.now;
    node.electionDeadline = this.now + this.between(min, max);
  }

  private send(message: Omit<Message, "id" | "sentAt" | "arriveAt">) {
    this.messages.push({
      ...message,
      id: this.nextMessageId++,
      sentAt: this.now,
      arriveAt:
        this.now + this.between(this.timing.latencyMin, this.timing.latencyMax),
    });
  }

  private peers(node: RaftNode) {
    return this.nodes.filter((n) => n.id !== node.id);
  }

  private lastTerm(node: RaftNode) {
    return node.log.at(-1)?.term ?? 0;
  }

  private startElection(node: RaftNode) {
    node.term += 1;
    node.role = "candidate";
    node.votedFor = node.id;
    node.votes = new Set([node.id]);
    this.armElectionTimer(node);
    this.log(
      "election",
      `${name(node.id)} timed out → election for term ${node.term}`,
    );
    for (const peer of this.peers(node)) {
      this.send({
        from: node.id,
        to: peer.id,
        kind: "vote-req",
        term: node.term,
        lastLogIndex: node.log.length,
        lastLogTerm: this.lastTerm(node),
      });
    }
  }

  private becomeLeader(node: RaftNode) {
    node.role = "leader";
    for (const peer of this.peers(node)) {
      node.nextIndex.set(peer.id, node.log.length);
      node.matchIndex.set(peer.id, 0);
    }
    this.log(
      "leader",
      `${name(node.id)} is leader for term ${node.term} (${node.votes.size}/${this.nodes.length} votes)`,
    );
    this.broadcastAppend(node);
  }

  private broadcastAppend(leader: RaftNode) {
    leader.heartbeatDue = this.now + this.timing.heartbeat;
    for (const peer of this.peers(leader)) this.sendAppend(leader, peer.id);
  }

  private sendAppend(leader: RaftNode, peerId: number) {
    const prevIndex = leader.nextIndex.get(peerId) ?? leader.log.length;
    this.send({
      from: leader.id,
      to: peerId,
      kind: "append",
      term: leader.term,
      prevIndex,
      prevTerm: prevIndex > 0 ? leader.log[prevIndex - 1]!.term : 0,
      entries: leader.log.slice(prevIndex),
      leaderCommit: leader.commitIndex,
    });
  }

  private receive(message: Message) {
    const node = this.node(message.to);
    if (node.role === "down") return;

    if (message.term > node.term) {
      if (node.role === "leader")
        this.log(
          "step-down",
          `${name(node.id)} saw term ${message.term} and stepped down`,
        );
      node.term = message.term;
      node.role = "follower";
      node.votedFor = null;
      node.votes.clear();
    }

    switch (message.kind) {
      case "vote-req":
        return this.onVoteRequest(node, message);
      case "vote":
        return this.onVote(node, message);
      case "append":
        return this.onAppend(node, message);
      case "append-ack":
        return this.onAppendAck(node, message);
    }
  }

  private onVoteRequest(node: RaftNode, message: Message) {
    const upToDate =
      message.lastLogTerm! > this.lastTerm(node) ||
      (message.lastLogTerm === this.lastTerm(node) &&
        message.lastLogIndex! >= node.log.length);
    const granted =
      message.term === node.term &&
      (node.votedFor === null || node.votedFor === message.from) &&
      upToDate;
    if (granted) {
      node.votedFor = message.from;
      this.armElectionTimer(node);
    }
    this.send({
      from: node.id,
      to: message.from,
      kind: "vote",
      term: node.term,
      granted,
    });
  }

  private onVote(node: RaftNode, message: Message) {
    if (
      node.role !== "candidate" ||
      message.term !== node.term ||
      !message.granted
    )
      return;
    node.votes.add(message.from);
    if (node.votes.size >= this.majority) this.becomeLeader(node);
  }

  private onAppend(node: RaftNode, message: Message) {
    const reply = (success: boolean, matchIndex = 0) =>
      this.send({
        from: node.id,
        to: message.from,
        kind: "append-ack",
        term: node.term,
        success,
        matchIndex,
      });

    if (message.term < node.term) return reply(false);

    // A valid leader for this term: follow it and reset the election timer.
    node.role = "follower";
    node.votes.clear();
    this.armElectionTimer(node);

    const prevIndex = message.prevIndex!;
    if (
      prevIndex > node.log.length ||
      (prevIndex > 0 && node.log[prevIndex - 1]!.term !== message.prevTerm)
    ) {
      return reply(false);
    }

    message.entries!.forEach((entry, i) => {
      const at = prevIndex + i;
      if (at < node.log.length && node.log[at]!.term !== entry.term)
        node.log.length = at;
      if (at >= node.log.length) node.log.push(entry);
    });

    const matchIndex = prevIndex + message.entries!.length;
    if (message.leaderCommit! > node.commitIndex) {
      node.commitIndex = Math.min(message.leaderCommit!, matchIndex);
    }
    reply(true, matchIndex);
  }

  private onAppendAck(node: RaftNode, message: Message) {
    if (node.role !== "leader" || message.term !== node.term) return;

    if (!message.success) {
      // Walk back one entry and retry right away, so a lagging follower catches up quickly.
      node.nextIndex.set(
        message.from,
        Math.max(0, (node.nextIndex.get(message.from) ?? 1) - 1),
      );
      this.sendAppend(node, message.from);
      return;
    }

    const match = Math.max(
      node.matchIndex.get(message.from) ?? 0,
      message.matchIndex!,
    );
    node.matchIndex.set(message.from, match);
    node.nextIndex.set(message.from, match);
    this.advanceCommit(node);
  }

  /** Commits the newest current-term entry that a majority holds. */
  private advanceCommit(leader: RaftNode) {
    for (let n = leader.log.length; n > leader.commitIndex; n--) {
      if (leader.log[n - 1]!.term !== leader.term) break;
      let holders = 1;
      for (const match of leader.matchIndex.values()) if (match >= n) holders++;
      if (holders >= this.majority) {
        leader.commitIndex = n;
        this.log(
          "commit",
          `Entry #${n} committed — ${holders}/${this.nodes.length} servers have it`,
        );
        return;
      }
    }
  }
}
