// The settings page's search and the scroll that brings a picked row into
// view: one concern, so the host calls one hook.
import type { RefObject } from "react";
import type { Strings } from "../../i18n/strings";
import type { SearchEntry } from "../../settings/settings-search";
import { useReveal, type SearchablePage } from "../../settings/SettingsSearch";
import { useSettingsDialogSearch } from "./settings-search";

export function useSettingsPageSearch({
  t,
  pages,
  owns,
  onPick,
  content,
  jump,
  clearJump,
}: {
  t: Strings;
  pages: SearchablePage[];
  owns: boolean;
  onPick: (match: { entry: SearchEntry }) => void;
  content: RefObject<HTMLDivElement | null>;
  jump: SearchEntry | null;
  clearJump: () => void;
}) {
  const search = useSettingsDialogSearch({ t, pages, owns, onPick });
  useReveal(content, jump, clearJump);
  return search;
}
