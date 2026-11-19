import type { Button } from "../app/format-buttons";
import type { TableAction } from "../editor/editor-menu-tables";
import { TableEditIcon, TrashIcon, UndoIcon } from "../engine/controls/icons";
import { IMAGE_WIDTHS } from "../editor/images/image-widths";
import {
  EDIT_ACTION_EVENT,
  IMAGE_ACTION_EVENT,
  TABLE_ACTION_EVENT,
} from "../utils/events";
import { RedoActionIcon } from "./PhoneEditorBarIcons";

/** Undo, the first key wherever the caret is. */
export const UNDO: Button = {
  label: (t) => t.menuUndo,
  Icon: UndoIcon,
  event: EDIT_ACTION_EVENT,
  detail: "undo",
};

export const REDO: Button = {
  label: (t) => t.menuRedo,
  Icon: RedoActionIcon,
  event: EDIT_ACTION_EVENT,
  detail: "redo",
};

function tableButton(
  action: TableAction,
  label: (t: Parameters<Button["label"]>[0]) => string,
): Button {
  return {
    label,
    Icon: (props) => <TableEditIcon kind={action} {...props} />,
    event: TABLE_ACTION_EVENT,
    detail: action,
  };
}

export const TABLE: Button[][] = [
  [
    tableButton("row-below", (t) => t.insertRowBelow),
    tableButton("row-above", (t) => t.insertRowAbove),
    tableButton("column-right", (t) => t.insertColumnRight),
    tableButton("column-left", (t) => t.insertColumnLeft),
  ],
  [
    tableButton("delete-row", (t) => t.deleteRow),
    tableButton("delete-column", (t) => t.deleteColumn),
    tableButton("delete-table", (t) => t.deleteTable),
  ],
];

export const IMAGE: Button[][] = [
  [
    {
      label: (t) => t.imageWidthAuto,
      text: (t) => t.imageWidthShortAuto,
      event: IMAGE_ACTION_EVENT,
      detail: "width:auto",
      on: (b) => b.image?.width === null,
    },
    ...IMAGE_WIDTHS.map((percent): Button => ({
      label: (t) => t[`imageWidth${percent}`],
      text: () => `${percent}%`,
      event: IMAGE_ACTION_EVENT,
      detail: `width:${percent}`,
      on: (b) => b.image?.width === `${percent}%`,
    })),
  ],
  [
    {
      label: (t) => t.deleteImage,
      Icon: TrashIcon,
      event: IMAGE_ACTION_EVENT,
      detail: "delete",
    },
  ],
];
