import { describe, expect, test } from "vitest";
import { ACTIONS, filterActions } from "@/lib/palette/actions";

const ids = (query: string) => filterActions(ACTIONS, query).map((a) => a.id);

describe("command palette search", () => {
  test("an empty query lists every action in its declared order", () => {
    expect(ids("")).toEqual(ACTIONS.map((a) => a.id));
    expect(ids("   ")).toEqual(ACTIONS.map((a) => a.id));
  });

  test("word-prefix matches in the title rank first", () => {
    expect(ids("res")[0]).toBe("open-resume");
    expect(ids("proj")[0]).toBe("go-projects");
    expect(ids("dark")[0]).toBe("toggle-theme");
  });

  test("keywords match too", () => {
    expect(ids("cv")[0]).toBe("open-resume");
    expect(ids("mail")[0]).toBe("copy-email");
    expect(ids("shell")[0]).toBe("open-terminal");
  });

  test("case-insensitive, with a fuzzy subsequence match as the last resort", () => {
    expect(ids("GITHUB")[0]).toBe("open-github");
    expect(ids("lnkdn")).toContain("open-linkedin");
  });

  test("no match means no results", () => {
    expect(ids("zzzz")).toEqual([]);
  });

  test("ids are unique and every action belongs to a group", () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
    for (const action of ACTIONS)
      expect(["Navigate", "Links", "Actions"]).toContain(action.group);
  });
});
