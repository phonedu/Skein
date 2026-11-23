import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { counted, currentStrings } from "../../i18n/current";
import "../editor-inline.css";

/** The blocks opened by hand, by their YAML: a node view rebuilt (a
 *  selection, an edit elsewhere) opens as it was. */
const opened = new Set<string>();

/** The number of top-level keys in a front matter block: one per line
 *  written `key: ...`. */
export function frontmatterKeys(text: string): number {
  return text.split(/\r?\n/).filter((line) => /^[A-Za-z0-9_-]+\s*:/.test(line))
    .length;
}

/**
 * A note's front matter as one quiet line - "Properties · 9" - opened to
 * the raw YAML on a click. The text stays the node's own, so saving and
 * exporting it is unchanged; collapsed it is out of the way, which is what
 * a library card's machine fields need.
 */
export const frontmatterCollapse = $prose(
  () =>
    new Plugin({
      props: {
        nodeViews: {
          frontmatter: (node) => {
            const dom = document.createElement("div");
            dom.className = "frontmatter-block frontmatter-collapsed";
            const head = document.createElement("button");
            head.type = "button";
            head.className = "frontmatter-head";
            head.contentEditable = "false";
            const label = document.createElement("span");
            label.className = "frontmatter-label";
            const chevron = document.createElement("span");
            chevron.className = "frontmatter-chevron";
            chevron.setAttribute("aria-hidden", "true");
            head.append(label, chevron);
            const body = document.createElement("div");
            body.className = "frontmatter-body";
            const yaml = document.createElement("pre");
            yaml.className = "frontmatter-yaml";
            body.append(yaml);
            dom.append(head, body);

            let current: ProseNode = node;
            let expanded = opened.has(node.textContent);
            const draw = () => {
              const t = currentStrings();
              label.textContent = counted(
                t.frontmatterProps,
                frontmatterKeys(current.textContent),
              );
              dom.classList.toggle("frontmatter-collapsed", !expanded);
              chevron.textContent = expanded ? "▾" : "▸";
              head.setAttribute("aria-expanded", String(expanded));
            };
            // The press is the button's, not the editor's.
            const toggle = () => {
              expanded = !expanded;
              if (expanded) opened.add(current.textContent);
              else opened.delete(current.textContent);
              draw();
            };
            head.addEventListener("pointerdown", (e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle();
            });
            head.addEventListener("mousedown", (e) => {
              e.preventDefault();
              e.stopPropagation();
            });
            draw();

            return {
              dom,
              contentDOM: yaml,
              update: (next) => {
                if (next.type.name !== "frontmatter") return false;
                current = next;
                draw();
                return true;
              },
              // The class and label are the view's own, not the document's.
              ignoreMutation: (m) =>
                m.type === "attributes" && m.target === dom,
            };
          },
        },
      },
    }),
);
