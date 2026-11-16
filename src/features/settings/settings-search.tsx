import { useState } from "react";
import { listMove } from "../../engine/controls/list-keys";
import {
  SettingsSearchField,
  SettingsSearchIndex,
  SettingsSearchResults,
  type SearchablePage,
} from "../../settings/SettingsSearch";
import { useSettingsSearch } from "../../settings/useSettingsSearch";
import type { SearchMatch } from "../../settings/settings-search";
import type { Strings } from "../../i18n/strings";
import "./settings-search.css";

/**
 * The dialog's search: the capsule field at the nav
 * column's top; while it holds a query the results stand in for the page;
 * picking one is the frame's to turn into the page open plus the jump (the
 * engine's reveal). ⌘F focuses the field while the dialog is open - the
 * same binding the tab had, `owns` saying whether the dialog holds it.
 */
export function useSettingsDialogSearch(props: {
  t: Strings;
  pages: SearchablePage[];
  /** Whether ⌘F is the dialog's now (it is open). */
  owns: boolean;
  onPick: (match: SearchMatch) => void;
}) {
  const search = useSettingsSearch(() => props.owns);
  // The pages are mounted out of sight only once there is a query: until
  // then no page runs its effects (the MCP page polls the backend).
  const [indexed, setIndexed] = useState(false);
  if (search.searching && !indexed) setIndexed(true);
  const resultGroups = props.pages
    .map((page) => ({
      key: page.key,
      name: page.name,
      matches: search.matches.filter((m) => m.entry.page === page.key),
    }))
    .filter((group) => group.matches.length > 0);
  const flatMatches = resultGroups.flatMap((group) => group.matches);
  const activeIndex = Math.min(
    search.active,
    Math.max(flatMatches.length - 1, 0),
  );
  const optionId = (index: number) => `${search.listId}-option-${index}`;

  const pick = (match: SearchMatch | undefined) => {
    if (!match) return;
    search.setQuery("");
    props.onPick(match);
  };

  return {
    searching: search.searching,
    /** The pages, mounted out of sight and read into entries - once the
     *  search has something to look for. */
    index: indexed ? (
      <SettingsSearchIndex pages={props.pages} onEntries={search.setEntries} />
    ) : null,
    field: (
      <div className="settings-nav-search">
        <SettingsSearchField
          t={props.t}
          inputRef={search.searchInput}
          query={search.query}
          listId={search.listId}
          activeId={flatMatches.length ? optionId(activeIndex) : undefined}
          onQueryChange={(query) => {
            search.setQuery(query);
            search.setActive(0);
          }}
          onMove={(key) => {
            const moved = listMove(key, activeIndex, flatMatches.length);
            if (moved !== null) search.setActive(moved);
          }}
          onPick={() => pick(flatMatches[activeIndex])}
        />
      </div>
    ),
    results: (
      <SettingsSearchResults
        t={props.t}
        groups={resultGroups}
        listId={search.listId}
        optionId={optionId}
        active={activeIndex}
        onPick={pick}
      />
    ),
    /** Goes to a picked result: the query is done with. */
    pick,
  };
}
