// Single source of truth for everything the site says about Deepanshu.
// Facts come from the resume; LOCKSTEP wording follows the tf-raft attribution.

export interface Metric {
  value: string;
  label: string;
}

export interface Experience {
  company: string;
  role: string;
  period: string;
  location: string;
  summary: string;
  metrics: Metric[];
  points: string[];
  stack: string[];
}

export interface Project {
  id: "prqlite" | "lockstep" | "erp";
  name: string;
  kind: string;
  period: string;
  summary: string;
  points: string[];
  stack: string[];
  source: string;
}

export const site = {
  name: "Deepanshu",
  role: "Software Engineer",
  headline: "IIT Jodhpur CSE '27 · distributed systems & databases",
  intro:
    "I like the layers most people import. I built a SQL engine from the page up, studied Raft through a working replicated store, and ship backends that never trust the client.",
  location: "Jodhpur, India",
  email: "deepanshu280607@gmail.com",
  links: {
    github: "https://github.com/DeepanshuPayal123",
    linkedin: "https://www.linkedin.com/in/TODO",
    resume: "/resume.pdf",
  },

  experience: [
    {
      company: "123OfAI",
      role: "Software Engineer Intern",
      period: "May – Jul 2026",
      location: "Bangalore",
      summary:
        "Server-authoritative contest platform and an ML system-design studio.",
      metrics: [
        { value: "O(N) → O(log N)", label: "leaderboard ranking" },
        { value: "96 KB", label: "first-load JS across 220+ pages" },
      ],
      points: [
        "Built a contest platform that grades untrusted user code in isolated sandboxes against server-held hidden tests, so test cases and answers never reach the client.",
        "Replaced full-scan leaderboard aggregation with Redis sorted-set updates, and made grading writes idempotent so duplicate submissions and Redis outages fall back to the durable store instead of corrupting scores.",
        "Shipped an ML system-design studio where deterministic rule checks gate LLM rubric evaluation across 6 segments; code-splitting with SSG + ISR kept first-load JS at 96 KB.",
      ],
      stack: [
        "TypeScript",
        "Express",
        "Redis",
        "Azure Table/Blob",
        "Next.js 14",
        "React Flow",
        "Azure OpenAI",
      ],
    },
    {
      company: "Decklar",
      role: "Software Engineer Intern",
      period: "May – Jul 2025",
      location: "Ahmedabad",
      summary:
        "Sole engineer on a GPS-free, spoof-resistant proof-of-delivery engine.",
      metrics: [
        { value: "95%", label: "verdict accuracy on ground-truth runs" },
        { value: "Live", label: "in production in Germany" },
      ],
      points: [
        "Verifies deliveries from ambient Wi-Fi scans alone: filters unstable access points, matches each survivor to its nearest-RSSI reference points in a multi-year wardrive database, and centroids them into a fix.",
        "Clusters the reconstructed track into dwell-scored stops and returns a 4-verdict, confidence-scored output contract.",
        "Shipped the customer-facing feature: a route/date picker that runs the engine on demand and plots the track with color-coded stops.",
      ],
      stack: [
        "Python",
        "pandas",
        "NumPy",
        "FastAPI",
        "React 19",
        "TypeScript",
        "Leaflet",
      ],
    },
  ] satisfies Experience[],

  projects: [
    {
      id: "prqlite",
      name: "PRQLite",
      kind: "Relational database engine from scratch",
      period: "Mar 2025",
      summary:
        "Every layer hand-written in ~4,500 lines of C++17, from the character-level SQL scanner down to the pwrite() syscall. No parser generator, no embedded engine.",
      points: [
        "Four-stage query path: lexer → recursive-descent parser → semantic analyzer → Volcano-style iterator executor.",
        "Slotted-page storage, a buffer pool with pin-count eviction, and RAII page guards over a reader–writer page table.",
        "Write-ahead logging and BEGIN / COMMIT / ROLLBACK transactions backed by undo-based rollback.",
      ],
      stack: ["C++17", "CMake", "Docker", "GitHub Actions"],
      source: "https://github.com/DeepanshuPayal123/PRQLite",
    },
    {
      id: "lockstep",
      name: "LOCKSTEP",
      kind: "Raft-replicated key-value store",
      period: "Nov 2024",
      summary:
        "A fault-tolerant key-value store on the Raft consensus protocol, used to study consensus hands-on.",
      points: [
        "Leader election, quorum log replication and repair of divergent follower logs after node failures.",
        "The consensus core sits behind ports and adapters, so the same node runs over gRPC or an in-memory transport.",
        "A 21-case Jest suite fault-injects leader crashes mid-replication and asserts the logs converge.",
      ],
      stack: ["TypeScript", "gRPC", "Protocol Buffers", "Jest"],
      source: "https://github.com/DeepanshuPayal123/LOCKSTEP",
    },
    {
      id: "erp",
      name: "Enterprise Production & Order Management System",
      kind: "Full-stack ERP for InduBindu's made-to-order workflow",
      period: "Feb 2026",
      summary:
        "Replaced manual Excel tracking for a made-to-order manufacturer with role-based dashboards.",
      points: [
        "Processes 1000+ orders a day end to end.",
        "Integrates real-time Shopify webhooks, two courier APIs (Shiprocket, Delhivery) and barcode-based tracking.",
      ],
      stack: ["React", "Node.js", "Shopify webhooks"],
      source: "https://github.com/DeepanshuPayal123/InduBindu",
    },
  ] satisfies Project[],

  skills: [
    {
      group: "Languages",
      items: ["C++", "Python", "TypeScript", "JavaScript", "SQL"],
    },
    {
      group: "Backend & systems",
      items: [
        "Node.js",
        "Express",
        "REST",
        "gRPC / Protobuf",
        "WebSockets",
        "Webhooks",
        "Multithreading",
      ],
    },
    {
      group: "Data & infra",
      items: [
        "PostgreSQL",
        "Redis",
        "Azure (Blob, Table, OpenAI)",
        "Docker",
        "Linux",
        "GitHub Actions",
      ],
    },
    {
      group: "Frontend",
      items: ["React", "Next.js", "React Flow", "Leaflet", "Vite", "Tailwind"],
    },
    {
      group: "Tools",
      items: [
        "Git",
        "Jest",
        "pytest",
        "Postman",
        "pandas",
        "NumPy",
        "scikit-learn",
      ],
    },
    {
      group: "Concepts",
      items: [
        "Distributed consensus",
        "Concurrency",
        "Database internals",
        "System design",
        "DSA",
      ],
    },
  ],

  education: {
    school: "Indian Institute of Technology, Jodhpur",
    degree: "B.Tech. in Computer Science and Engineering",
    period: "Aug 2023 – Apr 2027 (expected)",
    cgpa: "9.17 / 10",
    coursework: [
      "Data Structures & Algorithms",
      "Operating Systems",
      "Databases",
      "Computer Networks",
      "Distributed Systems",
      "Object-Oriented Programming",
      "Software Engineering",
      "Machine Learning",
    ],
  },

  positions: [
    {
      title: "Overall Coordinator, Career Development Cell",
      org: "IIT Jodhpur",
      period: "May 2026 – present",
    },
    {
      title: "Teaching Assistant, Data Structures & Algorithms",
      org: "IIT Jodhpur",
      period: "Aug – Nov 2025",
    },
  ],
};
