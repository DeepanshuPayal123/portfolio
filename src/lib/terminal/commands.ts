import { site } from "@/data/site";

export interface Line {
  text: string;
  tone?: "dim" | "accent" | "err";
}

/** Side effects are returned, not performed, so commands stay pure and testable. */
export type Effect =
  | { kind: "open"; url: string }
  | { kind: "clear" }
  | { kind: "exit" }
  | { kind: "theme" };

export interface CommandResult {
  lines: Line[];
  effect: Effect | null;
}

const print = (...texts: string[]): CommandResult => ({
  lines: texts.map((text) => ({ text })),
  effect: null,
});
const fail = (text: string): CommandResult => ({
  lines: [{ text, tone: "err" }],
  effect: null,
});

const HELP: [string, string][] = [
  ["help", "list commands"],
  ["whoami", "one-line intro"],
  ["ls [projects]", "list files"],
  ["cat <file>", "print a file, e.g. cat projects/prqlite"],
  ["open <resume|github|linkedin>", "open a link"],
  ["contact", "how to reach me"],
  ["theme", "toggle light / dark"],
  ["clear", "clear the screen"],
  ["exit", "close the terminal (or press Esc)"],
];

const OPEN_TARGETS: Record<string, string> = {
  resume: site.links.resume,
  github: site.links.github,
  linkedin: site.links.linkedin,
};

function catProject(id: string): CommandResult | null {
  const project = site.projects.find((p) => p.id === id);
  if (!project) return null;
  const result = print(
    `# ${project.name} — ${project.kind} (${project.period})`,
    project.summary,
    ...project.points.map((point) => `  - ${point}`),
    `stack:  ${project.stack.join(", ")}`,
    `source: ${project.source}`,
  );
  if (project.credit)
    result.lines.push({ text: `note:   ${project.credit.text}`, tone: "dim" });
  return result;
}

function cat(file: string | undefined): CommandResult {
  if (!file) return fail("usage: cat <file>");
  if (file === "about" || file === "about.txt") return print(site.intro);
  if (file === "resume.pdf")
    return {
      lines: [
        {
          text: "cat: resume.pdf: binary file — try 'open resume'",
          tone: "dim",
        },
      ],
      effect: null,
    };
  if (file === "projects" || file === "projects/")
    return fail(`cat: ${file}: Is a directory`);
  const project = file.startsWith("projects/")
    ? catProject(file.slice("projects/".length))
    : null;
  return project ?? fail(`cat: ${file}: No such file or directory`);
}

export function runCommand(input: string): CommandResult {
  const [cmd = "", ...args] = input.trim().split(/\s+/);
  if (!cmd) return { lines: [], effect: null };

  switch (cmd) {
    case "help":
      return print(...HELP.map(([name, what]) => `${name.padEnd(31)}${what}`));
    case "whoami":
      return print(`${site.name} — ${site.role} · ${site.headline}`);
    case "ls":
      if (!args[0]) return print("about.txt  projects/  resume.pdf");
      if (args[0] === "projects" || args[0] === "projects/")
        return print(site.projects.map((p) => p.id).join("  "));
      return fail(`ls: ${args[0]}: No such file or directory`);
    case "cat":
      return cat(args[0]);
    case "open": {
      const target = args[0] ?? "";
      const url = OPEN_TARGETS[target];
      if (!url)
        return fail(
          `open: unknown target '${target}' (try resume, github, linkedin)`,
        );
      return {
        lines: [{ text: `opening ${target}…`, tone: "dim" }],
        effect: { kind: "open", url },
      };
    }
    case "contact":
      return {
        lines: [
          { text: `email     ${site.email}`, tone: "accent" },
          { text: `github    ${site.links.github}` },
          { text: `linkedin  ${site.links.linkedin}` },
        ],
        effect: null,
      };
    case "theme":
      return {
        lines: [{ text: "switching theme…", tone: "dim" }],
        effect: { kind: "theme" },
      };
    case "clear":
      return { lines: [], effect: { kind: "clear" } };
    case "exit":
      return { lines: [], effect: { kind: "exit" } };
    case "sudo":
      if (args.join(" ") === "hire-me") {
        return {
          lines: [
            { text: "[sudo] password for recruiter: ********", tone: "dim" },
            {
              text: `Permission granted. Drafting an email to ${site.name}…`,
              tone: "accent",
            },
          ],
          effect: {
            kind: "open",
            url: `mailto:${site.email}?subject=${encodeURIComponent("Let's talk")}`,
          },
        };
      }
      return fail(
        "recruiter is not in the sudoers file. This incident will be reported.",
      );
    default:
      return fail(`command not found: ${cmd} — type 'help'`);
  }
}
