# "Crash the leader." — Live Raft cluster

Portfolio mein hero ke theek baad wala section. Browser ke andar 5 servers ka ek chhota cluster
chalta hai jo milkar **leader chunta hai** aur **data pe sahmati banata hai**. Visitor kisi bhi
server ko "crash" karke dekh sakta hai ki system bina toote kaise sambhalta hai.

Yeh wahi algorithm hai (**Raft**) jis par etcd (Kubernetes), CockroachDB aur Consul chalte hain.
LOCKSTEP mein isi protocol ko hands-on study kiya tha.

---

## 1. Basic samjho (bina tech ke)

Socho 5 dost ek shared notebook sambhalte hain. Rule: notebook mein sirf **leader** likh sakta hai.

- **Leader chunna** — shuru mein koi leader nahi. Jiska timer pehle khatam hota hai woh bolta hai
  "mujhe leader banao". Jise **3 ya zyada** vote (majority) mil gaye, woh leader.
- **Heartbeat** — leader har second sabko "main zinda hoon" bolta hai. Jab tak yeh aata rahe,
  koi election nahi hota.
- **Leader mar gaya** — heartbeat band → kisi ka timer khatam → naya election → kuch second mein
  naya leader.
- **Likhna (write)** — leader nayi entry sabko bhejta hai. Jab 3 logon ke paas copy pahunch jaaye,
  tab woh entry **committed** (pakki) hoti hai.
- **3 log gayab** — bache 2 majority nahi bana sakte, isliye na leader chuna jaata hai, na kuch
  likha jaata hai. Galat data likhne se behtar hai ki kuch na likhe.

## 2. Screen pe kya dikhta hai

| Dikhta hai | Matlab |
|---|---|
| ⭐ + blue glow wala circle | Leader |
| Server ke around ghat-ti ring | Election timer — zero hone par election |
| Amber pulse | Candidate (vote maang raha hai) |
| Laal dashed circle | Crashed server |
| Chalte dots | Network messages — blue heartbeat, cyan log entry, amber vote request, green vote |
| Server ke neeche chhote dibbe | Uska log — bhare = committed, khaali = abhi pakka nahi |
| Term | Kaunsa election round chal raha hai (har election pe badhta hai) |
| Event log | Kahani: "S3 timed out → election for term 5" |

**Visitor kya kar sakta hai:** kisi server pe click (crash / dobara click = restart),
**Crash leader**, **Send write**, **Reset**. Koi kuch na kare tab bhi har ~4.5 s pe ek automatic
write aati hai, taaki cluster zinda dikhe.

## 3. Technical detail

### Algorithm (core Raft, Ongaro & Ousterhout)
- `RequestVote` / `AppendEntries` messages, randomized election timeouts.
- Vote tabhi milta hai jab candidate ka log "up-to-date" ho; har server ek term mein ek hi vote deta hai.
- Log matching `prevIndex` / `prevTerm` se; conflict par follower ka log truncate hota hai.
- Leader **sirf apne current term** ki entry majority ke baad commit karta hai (subtle safety rule).
- Crash ke baad term, vote aur log bache rehte hain (persistent); commit index volatile hai aur leader se dobara seekha jaata hai.
- Failed append pe leader ek entry peeche jaake turant retry karta hai, taaki wapas aaya server jaldi catch-up kare.

### Simulation design
- **Deterministic:** seeded RNG (mulberry32) + time sirf `step(dt)` se aage badhta hai. Same seed +
  same inputs = hubahu same history, isliye har bug replay ho sakta hai (FoundationDB-style testing).
- Network latency simulate hoti hai (280–400 ms), taaki har packet aankh se dikhe.
- **Timing data se tune ki:** pehli timing mein split votes (sab ek saath candidate) ho rahe the.
  500 seeds pe kai parameter sets naap ke best chuna:

  | | Median | p90 | Max |
  |---|---|---|---|
  | Pehla leader | 1.8 s | 2.6 s | 8.3 s |
  | Leader crash ke baad naya leader | 3.2 s | 4.5 s | 9.2 s |

### Testing
- 30 unit tests (`tests/unit/raft.test.ts`): election, re-election, minority mein koi progress nahi,
  restart ke baad catch-up, determinism.
- **Chaos testing:** 20 random seeds × 60 s, random crash / restart / write. Har step pe check:
  1. ek term mein kabhi do leader nahi (election safety)
  2. jo commit ho gaya woh kabhi nahi badalta
- 8 e2e tests × 3 browsers (Chromium, Safari, iPhone) (`tests/e2e/consensus.spec.ts`): leader
  chuna jaata hai, crash pe naya leader higher term mein, write commit hoti hai, click se
  crash/restart, har server labelled button, off-screen pe pause, reduced motion mein Start button.

### UI
- React island (`client:visible`) — code tabhi load hota hai jab section screen pe aaye.
- `requestAnimationFrame` loop; section screen se bahar ho ya tab chhupa ho to ruk jaata hai.
- Har server ek asli `<button>` hai (keyboard + screen reader), jaise "S3, leader, term 4. Crash this server".
- Reduced motion: simulation "Start simulation" dabane par hi chalta hai.
- Dono themes (night / dawn) ke design tokens use karta hai.

## 4. Level — seedha aakalan

- **Idea:** naya nahi (raft.github.io, "The Secret Lives of Data" jaise visualizations hain), par
  student portfolio pe bahut kam dikhta hai.
- **Algorithm:** core Raft hai, production Raft nahi. Isme **nahi** hai: network partitions,
  log compaction / snapshots, membership changes, disk persistence.
- **Engineering practice** (deterministic sim, chaos tests, data-driven tuning): mid-to-senior level.

**Kul milakar:** intern / new-grad portfolio ke liye **top tier**; absolute engineering scale pe
**mid level** — mushkil cheez saaf aur sahi tareeke se, par research / production level nahi.

> Interview mein iske baare mein poochha ja sakta hai ("split vote kya hai?", "leader purane term
> ki entry kyun commit nahi karta?", "isse test kaise kiya?") — apne shabdon mein samjhana aana chahiye.

## 5. Files

| File | Kya hai |
|---|---|
| `src/lib/raft/sim.ts` | Raft simulation (pure TypeScript, koi DOM nahi) |
| `src/islands/RaftDemo.tsx` | Drawing + controls (React island) |
| `src/components/Consensus.astro` | Section + styles |
| `tests/unit/raft.test.ts` | Simulation tests, chaos fuzz included |
| `tests/e2e/consensus.spec.ts` | Browser tests |

## 6. Chalana

```bash
npm test                                          # unit tests (Raft included)
npx playwright test tests/e2e/consensus.spec.ts   # browser tests
npm run build && npx astro preview                # local site → http://localhost:4321
```

**Aage ka idea:** network partition — cluster ko do hisson mein kaat ke dikhana ki chhota hissa
kaam kyun rok deta hai (split-brain se bachav). Raft ka sabse impressive scenario.
