import { describe, expect, test } from "vitest";
import { site } from "@/data/site";
import { runCommand } from "@/lib/terminal/commands";

const text = (input: string) =>
  runCommand(input)
    .lines.map((l) => l.text)
    .join("\n");

describe("terminal commands", () => {
  test("help lists every command", () => {
    const out = text("help");
    for (const cmd of [
      "help",
      "whoami",
      "ls",
      "cat",
      "open",
      "contact",
      "theme",
      "clear",
      "exit",
    ]) {
      expect(out).toContain(cmd);
    }
  });

  test("whoami", () => {
    expect(text("whoami")).toContain(site.name);
    expect(text("whoami")).toContain(site.role);
  });

  test("ls and ls projects", () => {
    expect(text("ls")).toBe("about.txt  projects/  resume.pdf");
    expect(text("ls projects")).toBe("prqlite  lockstep  erp");
  });

  test("cat prints files, and LOCKSTEP keeps its tf-raft credit", () => {
    expect(text("cat about.txt")).toContain(site.intro);
    expect(text("cat projects/prqlite")).toContain(
      "https://github.com/DeepanshuPayal123/PRQLite",
    );
    expect(text("cat projects/lockstep")).toContain("tf-raft");
  });

  test("cat on a missing file fails like a shell", () => {
    expect(runCommand("cat nope").lines).toEqual([
      { text: "cat: nope: No such file or directory", tone: "err" },
    ]);
  });

  test("open returns an effect instead of navigating by itself", () => {
    expect(runCommand("open resume").effect).toEqual({
      kind: "open",
      url: "/resume.pdf",
    });
    expect(runCommand("open github").effect).toEqual({
      kind: "open",
      url: site.links.github,
    });
    expect(runCommand("open linkedin").effect).toEqual({
      kind: "open",
      url: site.links.linkedin,
    });
    expect(text("open myspace")).toMatch(/unknown target 'myspace'/);
  });

  test("contact prints the email address", () => {
    expect(text("contact")).toContain(site.email);
  });

  test("clear, exit and theme are effects for the UI to perform", () => {
    expect(runCommand("clear").effect).toEqual({ kind: "clear" });
    expect(runCommand("exit").effect).toEqual({ kind: "exit" });
    expect(runCommand("theme").effect).toEqual({ kind: "theme" });
  });

  test("sudo hire-me opens a mail draft; any other sudo is refused", () => {
    const effect = runCommand("sudo hire-me").effect;
    expect(effect?.kind).toBe("open");
    expect(effect && "url" in effect ? effect.url : "").toMatch(
      new RegExp(`^mailto:${site.email}\\?subject=`),
    );
    expect(text("sudo rm -rf /")).toMatch(/not in the sudoers file/);
  });

  test("blank input does nothing; unknown commands say so", () => {
    expect(runCommand("   ")).toEqual({ lines: [], effect: null });
    expect(runCommand("vim").lines).toEqual([
      { text: "command not found: vim — type 'help'", tone: "err" },
    ]);
  });
});
