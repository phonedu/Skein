// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import {
  closeHistory,
  history,
  redo,
  undo,
  undoDepth,
} from "@milkdown/kit/prose/history";
import { EditorState, Plugin } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";

vi.mock("../platform/ipc-files", () => ({ undoFiles: {} }));

import { docHash } from "./undo-file";
import {
  historyFrom,
  leaveHistory,
  readHistory,
  takeHistory,
  writeHistory,
} from "./left-history";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block", toDOM: () => ["p", 0] },
    // As the editor's own: the file's block above the text.
    frontmatter: {
      content: "text*",
      group: "block",
      code: true,
      toDOM: () => ["pre", 0],
    },
    text: {},
  },
});

const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((v) => v.destroy()));

function editor(text: string) {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, schema.text(text)),
  ]);
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ doc, plugins: [history()] }),
  });
  views.push(view);
  return view;
}

/** Types `text` at the end as one undo step. */
function type(view: EditorView, text: string) {
  const end = view.state.doc.content.size - 1;
  view.dispatch(closeHistory(view.state.tr.insertText(text, end)));
}

const text = (view: EditorView) => view.state.doc.textContent;

it("keeps a history in a file and gives it back as it stands, with no edit made", () => {
  const before = editor("One");
  type(before, " two");
  type(before, " three");
  undo(before.state, before.dispatch);
  const file = writeHistory(leaveHistory(before.state)!);
  // The editor that was kept from is left as it was.
  expect(text(before)).toBe("One two");
  expect(undoDepth(before.state)).toBe(1);

  let edits = 0;
  const after = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, schema.text("One two")),
      ]),
      plugins: [
        history(),
        new Plugin({
          appendTransaction: (trs) => {
            edits += trs.filter((tr) => tr.docChanged).length;
            return null;
          },
        }),
      ],
    }),
  });
  views.push(after);
  expect(docHash(after.state.doc)).toBe(docHash(before.state.doc));
  after.dispatch(takeHistory(after.state, readHistory(file)!)!);
  expect(edits).toBe(0);
  expect(text(after)).toBe("One two");
  redo(after.state, after.dispatch);
  expect(text(after)).toBe("One two three");
  undo(after.state, after.dispatch);
  undo(after.state, after.dispatch);
  expect(text(after)).toBe("One");
  // The caret goes where the edit was, as the file kept it.
  expect(after.state.selection.head).toBeLessThanOrEqual(4);
});

it("gives the history back to a note that gained front matter when saved", () => {
  const before = editor("One");
  type(before, " two");
  type(before, " three");
  const file = writeHistory(leaveHistory(before.state)!);

  // Saved: the file now names it. The editor's text is the body alone.
  const after = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: schema.node("doc", null, [
        schema.node("frontmatter", null, schema.text("textus_id: abc")),
        schema.node("paragraph", null, schema.text("One two three")),
      ]),
      plugins: [history()],
    }),
  });
  views.push(after);
  expect(docHash(after.state.doc)).toBe(docHash(before.state.doc));
  after.dispatch(takeHistory(after.state, readHistory(file)!)!);
  undo(after.state, after.dispatch);
  undo(after.state, after.dispatch);
  expect(after.state.doc.firstChild!.type.name).toBe("frontmatter");
  expect(after.state.doc.child(1).textContent).toBe("One");
});

it("moves a history down by front matter the note already had and grew", () => {
  const before = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: schema.node("doc", null, [
        schema.node("frontmatter", null, schema.text("title: a")),
        schema.node("paragraph", null, schema.text("One")),
      ]),
      plugins: [history()],
    }),
  });
  views.push(before);
  type(before, " two");
  const file = writeHistory(leaveHistory(before.state)!);

  const after = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: schema.node("doc", null, [
        schema.node(
          "frontmatter",
          null,
          schema.text("title: a\ntextus_id: abc"),
        ),
        schema.node("paragraph", null, schema.text("One two")),
      ]),
      plugins: [history()],
    }),
  });
  views.push(after);
  expect(docHash(after.state.doc)).toBe(docHash(before.state.doc));
  after.dispatch(takeHistory(after.state, readHistory(file)!)!);
  undo(after.state, after.dispatch);
  expect(after.state.doc.child(1).textContent).toBe("One");
});

it("keeps a multi-step event's maps with its steps when the front matter grows", () => {
  const before = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: schema.node("doc", null, [
        schema.node(
          "paragraph",
          null,
          schema.text("abcdefghijklmnopqrstuvwxyz"),
        ),
      ]),
      plugins: [history()],
    }),
  });
  views.push(before);
  // One event, two steps (as Replace All builds), then a transaction kept
  // for its map alone: its map still describes the old positions.
  const event = before.state.tr.insertText("A", 1);
  event.insertText("B", 6);
  before.dispatch(closeHistory(event));
  before.dispatch(
    before.state.tr.insertText("Z", 27).setMeta("addToHistory", false),
  );
  const body = before.state.doc.child(0).textContent;
  const file = writeHistory(leaveHistory(before.state)!);

  const after = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: schema.node("doc", null, [
        schema.node("frontmatter", null, schema.text("textus_id: abc")),
        schema.node("paragraph", null, schema.text(body)),
      ]),
      plugins: [history()],
    }),
  });
  views.push(after);
  expect(docHash(after.state.doc)).toBe(docHash(before.state.doc));
  after.dispatch(takeHistory(after.state, readHistory(file)!)!);
  undo(after.state, after.dispatch);
  // The event's two insertions are gone; the map-only edit stays.
  expect(after.state.doc.child(1).textContent).toBe(
    "abcdefghijklmnopqrstuvwxZyz",
  );
  expect(after.state.doc.firstChild!.type.name).toBe("frontmatter");
});

it("drops a history whose front matter changed in place", () => {
  const before = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: schema.node("doc", null, [
        schema.node("frontmatter", null, schema.text("title: a")),
        schema.node("paragraph", null, schema.text("One")),
      ]),
      plugins: [history()],
    }),
  });
  views.push(before);
  type(before, " two");
  const file = writeHistory(leaveHistory(before.state)!);

  const after = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: schema.node("doc", null, [
        schema.node("frontmatter", null, schema.text("title: b")),
        schema.node("paragraph", null, schema.text("One two")),
      ]),
      plugins: [history()],
    }),
  });
  views.push(after);
  expect(takeHistory(after.state, readHistory(file)!)).toBeNull();
});

it("takes no history over one of its own, nor a file that isn't one", () => {
  const before = editor("One");
  type(before, " two");
  const left = leaveHistory(before.state)!;
  expect(takeHistory(before.state, left)).toBeNull();
  expect(readHistory("[[{}]]")).toBeNull();
  expect(readHistory("not json")).toBeNull();
});

it("hands a history to the next editor as it stands, undo and redo, with no edit made", () => {
  const before = editor("One");
  type(before, " two");
  type(before, " three");
  undo(before.state, before.dispatch);
  const left = leaveHistory(before.state)!;
  const kept = before.state.doc.toJSON();

  // Another editor, its own schema, the same document.
  const next = new Schema(schema.spec);
  let edits = 0;
  const after = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: next.nodeFromJSON(kept),
      plugins: [
        historyFrom({}, left),
        new Plugin({
          appendTransaction: (trs) => {
            edits += trs.filter((tr) => tr.docChanged).length;
            return null;
          },
        }),
      ],
    }),
  });
  views.push(after);
  expect(edits).toBe(0);
  expect(text(after)).toBe("One two");
  expect(undoDepth(after.state)).toBe(1);
  redo(after.state, after.dispatch);
  expect(text(after)).toBe("One two three");
  undo(after.state, after.dispatch);
  undo(after.state, after.dispatch);
  expect(text(after)).toBe("One");
  // Typed now, it is a step of its own.
  redo(after.state, after.dispatch);
  type(after, "!");
  undo(after.state, after.dispatch);
  expect(text(after)).toBe("One two");
});

it("leaves nothing for an editor with no history", () => {
  expect(leaveHistory(editor("One").state)).toBeNull();
});
