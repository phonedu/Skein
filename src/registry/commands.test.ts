import { describe, expect, it, vi } from "vitest";
import {
  commandForCombo,
  commands,
  registerCommand,
  runCommand,
} from "./commands";
import { sidebarTab, sidebarTabs } from "../app/frame/sidebar-tabs";
import { registerSidebarTab } from "./sidebar-tabs";

describe("commands", () => {
  it("run by id or by their shortcut, while they can, and go when taken back", () => {
    const run = vi.fn();
    let enabled = true;
    const remove = registerCommand({
      id: "example.hello",
      title: () => "Hello",
      run,
      shortcut: "mod+alt+9",
      enabled: () => enabled,
    });
    expect(runCommand("example.hello")).toBe(true);
    expect(commandForCombo("mod+alt+9")?.id).toBe("example.hello");
    enabled = false;
    expect(runCommand("example.hello")).toBe(false);
    expect(commandForCombo("mod+alt+9")).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
    expect(() =>
      registerCommand({ id: "example.hello", title: () => "", run }),
    ).toThrow(/already registered/);
    remove();
    expect(commands()).toHaveLength(0);
    expect(runCommand("example.hello")).toBe(false);
  });
});

describe("sidebar tabs", () => {
  it("are Files, Outline and Search; a plugin's tab belongs to the launcher", () => {
    expect(sidebarTabs().map((tab) => tab.id)).toEqual([
      "tree",
      "outline",
      "search",
    ]);
    const remove = registerSidebarTab({
      id: "example",
      label: () => "Example",
      Icon: () => null,
      Panel: () => null,
    });
    // The view column is Textus's own: a plugin's page opens from the top
    // bar's launcher, not as a tab here.
    expect(sidebarTabs()).toHaveLength(3);
    remove();
    // One no longer there is Files.
    expect(sidebarTab("example").id).toBe("tree");
  });
});
