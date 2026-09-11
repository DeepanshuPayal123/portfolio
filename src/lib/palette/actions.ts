import { site } from "@/data/site";

export interface PaletteAction {
  id: string;
  title: string;
  group: "Navigate" | "Links" | "Actions";
  keywords: string[];
  /** Section anchor or URL, for navigate and link actions. */
  href?: string;
  /** Shown on the right of the row instead of the group name. */
  hint?: string;
}

export const ACTIONS: PaletteAction[] = [
  {
    id: "go-experience",
    title: "Go to Experience",
    group: "Navigate",
    keywords: ["work", "internships", "jobs"],
    href: "#experience",
  },
  {
    id: "go-projects",
    title: "Go to Projects",
    group: "Navigate",
    keywords: ["prqlite", "lockstep", "erp"],
    href: "#projects",
  },
  {
    id: "go-skills",
    title: "Go to Skills",
    group: "Navigate",
    keywords: ["stack", "languages"],
    href: "#skills",
  },
  {
    id: "go-education",
    title: "Go to Education",
    group: "Navigate",
    keywords: ["iit", "cgpa", "college"],
    href: "#education",
  },
  {
    id: "go-contact",
    title: "Go to Contact",
    group: "Navigate",
    keywords: ["reach", "hire"],
    href: "#contact",
  },
  {
    id: "open-resume",
    title: "Open resume (PDF)",
    group: "Links",
    keywords: ["cv", "pdf", "download"],
    href: site.links.resume,
  },
  {
    id: "open-github",
    title: "Open GitHub",
    group: "Links",
    keywords: ["code", "source", "repos"],
    href: site.links.github,
  },
  {
    id: "open-linkedin",
    title: "Open LinkedIn",
    group: "Links",
    keywords: ["profile", "network"],
    href: site.links.linkedin,
  },
  {
    id: "copy-email",
    title: "Copy email address",
    group: "Actions",
    keywords: ["mail", "email", "contact"],
    hint: site.email,
  },
  {
    id: "toggle-theme",
    title: "Toggle light / dark theme",
    group: "Actions",
    keywords: ["dark", "light", "theme", "mode"],
  },
  {
    id: "open-terminal",
    title: "Open terminal",
    group: "Actions",
    keywords: ["shell", "cli", "console"],
    hint: "~",
  },
];

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) if (ch === needle[i]) i++;
  return i === needle.length;
}

/** Title prefix > word prefix > keyword prefix > substring > fuzzy subsequence. */
function score(action: PaletteAction, query: string): number {
  const title = action.title.toLowerCase();
  if (title.startsWith(query)) return 4;
  if (title.split(/[^a-z0-9]+/).some((word) => word.startsWith(query)))
    return 3;
  if (action.keywords.some((k) => k.toLowerCase().startsWith(query))) return 2;
  if (title.includes(query)) return 1;
  return isSubsequence(query, title) ? 0.5 : 0;
}

export function filterActions(
  actions: PaletteAction[],
  query: string,
): PaletteAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...actions];
  return actions
    .map((action, index) => ({ action, index, score: score(action, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.action);
}
