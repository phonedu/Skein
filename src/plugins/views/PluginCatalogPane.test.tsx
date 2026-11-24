// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resolveStrings } from "../../i18n/strings";

const calls = vi.hoisted(() => ({
  first: vi.fn(),
  second: vi.fn(),
}));

vi.mock("./plugin-launcher", () => ({
  pluginPages: () => [
    {
      label: "Bookmarks",
      description: "Bookmarks",
      plugin: "p.bookmarks",
      run: calls.first,
    },
    {
      label: "Table",
      description: "Bookmarks",
      plugin: "p.bookmarks",
      run: calls.second,
    },
  ],
}));

vi.mock("../store/plugin-records", () => {
  const snapshot = { loaded: true, allOn: true, records: [] };
  return {
    pluginsSnapshot: () => snapshot,
    subscribePlugins: () => () => {},
  };
});

const { PluginCatalogPane } = await import("./PluginCatalogPane");

describe("the right column's plugin catalog", () => {
  it("groups pages by plugin and runs the page picked", () => {
    const view = render(<PluginCatalogPane t={resolveStrings("en")} />);
    expect(view.getAllByText("Bookmarks")).toHaveLength(2);
    fireEvent.click(view.getByText("Table"));
    expect(calls.second).toHaveBeenCalledTimes(1);
    expect(calls.first).not.toHaveBeenCalled();
  });
});
