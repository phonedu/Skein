// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { configurePlugins } from "../store/plugin-records";
import type { Strings } from "../../i18n/strings";
import { askPlugin } from "../manager";
import { PluginListPane, type PluginListItem } from "./PluginListView";

const items: PluginListItem[] = [
  {
    label: "planning",
    actions: [{ label: "Rename", command: "tags.rename" }],
  },
  { label: "project" },
];

vi.mock("./usePluginListItems", () => ({
  keyOf: (item: PluginListItem, i: number) => item.id ?? String(i),
  usePluginListItems: () => ({
    info: { select: true },
    items,
    swapItem: () => {},
    children: new Map(),
    open: new Set(),
    toggleOpen: () => {},
    error: null,
    fail: () => {},
  }),
}));
vi.mock("../manager", () => ({ askPlugin: vi.fn(async () => null) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  configurePlugins({
    strings: () =>
      ({
        pluginMoreFor: "{name} more",
      }) as Strings,
    language: () => "en",
    dark: () => false,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("opens a row's menu for a finger held on it, as a right-click does", () => {
  render(<PluginListPane plugin="catvinci.tags" view="tags" />);
  const [row, plain] = screen.getAllByRole("treeitem");
  fireEvent.touchStart(row, { touches: [{ clientX: 30, clientY: 40 }] });
  act(() => vi.advanceTimersByTime(600));
  fireEvent.touchEnd(row);
  expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();

  // The tap after it opens what it is on.
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(plain);
  expect(askPlugin).toHaveBeenCalledWith("catvinci.tags", "$listSelect", {
    view: "tags",
    item: items[1],
  });

  // A row with nothing to do has no menu to hold for.
  fireEvent.touchStart(plain, { touches: [{ clientX: 30, clientY: 80 }] });
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
});

it("gives a row with actions a button for them, which does not open the row", () => {
  render(<PluginListPane plugin="catvinci.tags" view="tags" />);
  const more = screen.getByRole("button", { name: "planning more" });
  fireEvent.click(more);
  expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
  // The row's own action stays its own: the button's click is not a pick.
  expect(askPlugin).not.toHaveBeenCalled();
  // The row without actions has no button.
  expect(
    screen.queryAllByRole("button", { name: /project more/ }),
  ).toHaveLength(0);
});
