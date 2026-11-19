// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../i18n/locales/en";
import { fill } from "../i18n/fill";
import { AI_NAME } from "../i18n/names";
import type { Strings } from "../i18n/strings";
import { NO_BLOCK } from "../editor/caret-block";
import {
  EDIT_ACTION_EVENT,
  EDITOR_MORE_EVENT,
  INSERT_BLOCK_EVENT,
  TOGGLE_BLOCK_EVENT,
  TOGGLE_MARK_EVENT,
} from "../utils/events";
import { PhoneFormatBar } from "./PhoneFormatBar";

vi.mock("../prefs/SettingsContext", () => ({
  useSettings: () => ({
    settings: {
      language: "en",
      imageFolder: "assets",
      textusAi: true,
      enableCompletion: true,
      enableGrammarCheck: true,
      enableAskAi: true,
    },
  }),
}));

vi.mock("../ai/image-models", () => ({
  useImageService: () => "openai",
}));

vi.mock("../engine/layout/tab-element", () => ({
  tabElement: (id: string) =>
    id === "tab-1" ? document.getElementById("test-editor") : null,
}));

vi.mock("../editor/images/image-store", () => ({
  pickImageFile: vi.fn(async () => null),
  copyToImageFolder: vi.fn(async () => null),
}));

vi.mock("../engine/controls/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

const dispatched: CustomEvent[] = [];

beforeEach(() => {
  dispatched.length = 0;
  vi.spyOn(window, "dispatchEvent").mockImplementation((event) => {
    dispatched.push(event as CustomEvent);
    return true;
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("keyboard-up");
  vi.restoreAllMocks();
});

const t = en as unknown as Strings;

function renderBar() {
  return render(
    <PhoneFormatBar t={t} tabId="tab-1" docPath={null} block={NO_BLOCK} />,
  );
}

describe("PhoneFormatBar", () => {
  it("shows the main keys", () => {
    renderBar();
    for (const label of [
      t.menuInsertGroup,
      t.toolbarHeading,
      t.menuBulletList,
      AI_NAME,
      t.menuUndo,
      t.menuRedo,
      t.toolbarHideKeyboard,
    ])
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
  });

  it("sends the editor's undo event", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: t.menuUndo }));
    const event = dispatched.find((e) => e.type === EDIT_ACTION_EVENT);
    expect(event?.detail).toBe("undo");
  });

  it("opens the AI actions from the main bar", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: AI_NAME }));
    expect(dispatched.some((e) => e.type === EDITOR_MORE_EVENT)).toBe(true);
  });

  it("opens the heading choices just above the bar", () => {
    renderBar();
    const key = screen.getByRole("button", { name: t.toolbarHeading });
    fireEvent.click(key);
    expect(key.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("toolbar", { name: t.toolbarHeading }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: fill(t.menuHeadingTemplate, { n: "2" }),
      }),
    );
    const event = dispatched.find((e) => e.type === INSERT_BLOCK_EVENT);
    expect(event?.detail).toBe("h2");
  });

  it("switches between the two panels and closes on a tap outside", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: t.toolbarHeading }));
    fireEvent.click(screen.getByRole("button", { name: t.menuBulletList }));
    expect(
      screen.queryByRole("toolbar", { name: t.toolbarHeading }),
    ).toBeNull();
    const panel = screen.getByRole("toolbar", { name: t.menuBulletList });
    fireEvent.click(screen.getByRole("button", { name: t.menuTaskList }));
    expect(dispatched.some((e) => e.type === TOGGLE_BLOCK_EVENT)).toBe(true);
    expect(panel).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("toolbar", { name: t.menuBulletList }),
    ).toBeNull();
  });

  it("opens the nine-key insert panel and inserts a block", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: t.menuInsertGroup }));
    for (const label of [
      t.menuCodeBlock,
      t.menuTable,
      t.menuBlockquote,
      t.blockCallout,
      t.menuMathBlock,
      t.menuTaskList,
      t.menuDivider,
      t.missingImageFilter,
      t.menuInsertLink,
    ])
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.toolbarMore })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.menuTable }));
    const event = dispatched.find((e) => e.type === INSERT_BLOCK_EVENT);
    expect(event?.detail).toBe("table");
  });

  it("gives the document the keys back when the insert panel closes", () => {
    const root = document.createElement("div");
    root.id = "test-editor";
    const editor = document.createElement("div");
    editor.className = "ProseMirror";
    editor.tabIndex = -1;
    root.append(editor);
    document.body.append(root);
    try {
      renderBar();
      fireEvent.click(screen.getByRole("button", { name: t.menuInsertGroup }));
      fireEvent.click(screen.getByRole("button", { name: t.menuInsertGroup }));
      expect(document.activeElement).toBe(editor);
    } finally {
      root.remove();
    }
  });

  it("shows inline formats on a selection and sends bold", async () => {
    document.documentElement.classList.add("keyboard-up");
    const root = document.createElement("div");
    root.id = "test-editor";
    const paragraph = document.createElement("p");
    paragraph.textContent = "hello";
    root.append(paragraph);
    document.body.append(root);
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 100,
      top: 100,
      left: 20,
      right: 120,
      bottom: 120,
      width: 100,
      height: 20,
      toJSON: () => ({}),
    } as DOMRect);

    renderBar();
    const bold = await screen.findByRole("button", { name: t.toolbarBold });
    fireEvent.click(bold);
    const event = dispatched.find((e) => e.type === TOGGLE_MARK_EVENT);
    expect(event?.detail).toBe("bold");
    root.remove();
  });
});
