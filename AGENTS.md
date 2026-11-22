# Agent guide

We use AI coding assistants on Textus ourselves, and so do some of our
contributors. This file is what we hand them: where things are, and the
few rules that have gone wrong before and must not again. The full rules
are in [CONTRIBUTING.md](CONTRIBUTING.md) and the documents it links; if
this file and they ever disagree, they win - and please tell us.

## Fork note (Skein)

This checkout is the **Skein fork** of Textus. It follows upstream by
release tag; everything fork-specific lives under `docs/skein/`, whose
[README](docs/skein/README.md) is the fork's document entry and its rules
the ones to work by. [STATUS](docs/skein/STATUS.md) is the only progress
source, [INDEX](docs/skein/INDEX.md) lists every live document, and
[decisions](docs/skein/decisions/README.md) is the ruling register.
Three things differ from the upstream guide below:

- `docs/design/` (design-language.md included) and `docs/images/` are
  dropped: upstream's design standard and UI screenshots are not this
  fork's reference. The interface authority is the decisions in
  `docs/skein/decisions/`; the old sealed boards
  were deleted on 2026-11-20. Where the rules below cite
  design-language.md, read those decisions instead.
- Upstream contributions are never built from this checkout: clone
  upstream fresh and prepare the branch there
  ([the procedure](docs/skein/discipline/publishing-gate.md)).
- `docs/releases/` keeps only `next/` and the template: the historical
  upstream release notes are not this fork's changelog.

`docs/dev/*` below is upstream's engineering manual: read it for how to
change the code, but never put fork plans, progress or rulings in it.

The fork's own AI rules (task six lines, completion evidence, scope,
external review) are in
[AI协作纪律.md](docs/skein/discipline/AI协作纪律.md); its procedures are in
[工程菜谱.md](docs/skein/discipline/工程菜谱.md). This file stays the
tool-neutral entry and the upstream engineering rules; it does not
duplicate them.

Docs are automated: `npm run docs:task -- brief <id>` writes the task six
lines, `start` refuses to start without them, and `npm run docs:context --
<id>` prints the task's context pack; `docs:new` creates a decision/spec/
research, `docs:find` searches, and `npm run docs` regenerates `STATUS.md` /
`INDEX.md` / the command and decision indexes and checks them. `STATUS.md` and
the generated indexes are never edited by hand.

Upstream work is one command per step: `npm run upstream:status` →
`upstream:plan -- vX.Y.Z` → `upstream:start --apply` → `upstream:clean
--apply` → `upstream:verify` → `upstream:record` → `upstream:finish --apply`;
PR candidates use `upstream:ticket`, `upstream:patch`, `upstream:gate`. Daily
close-out runs `npm run verify`; release notes use `release:new`. The full
command list is [docs/skein/COMMANDS.md](docs/skein/COMMANDS.md).

## Where things are

Textus is an Integrated Writing Environment (IWE) for Markdown on macOS,
Windows, Linux, iPhone and iPad,
built with Tauri 2: a React + TypeScript frontend in `src/` (the editor is
Milkdown/ProseMirror, source mode CodeMirror 6) and a Rust backend in
`src-tauri/`.

| Need                                                   | Read                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Setup, the checks to run, code style, writing          | [CONTRIBUTING.md](CONTRIBUTING.md)                                                                     |
| Folders, layers and what ESLint enforces; the backend  | [docs/dev/architecture.md](docs/dev/architecture.md)                                                   |
| How to add a setting, menu item, command, string, test | [docs/dev/recipes.md](docs/dev/recipes.md)                                                             |
| The one place for each common need: reuse it           | [docs/dev/reuse.md](docs/dev/reuse.md)                                                                 |
| Tabs, opening, saving, drafts, closing                 | [docs/dev/documents.md](docs/dev/documents.md)                                                         |
| Which test layer, the e2e helpers, CI                  | [docs/dev/testing.md](docs/dev/testing.md)                                                             |
| Branches, pull requests, commits, releases             | [docs/dev/releasing.md](docs/dev/releasing.md)                                                         |
| Desktop and iOS: what is shared, what is gated         | [docs/dev/ios-code-map.md](docs/dev/ios-code-map.md)                                                   |
| The interface's design standard                        | [docs/skein/decisions/README.md](docs/skein/decisions/README.md)                                       |
| Fork planning, status and rulings                      | [docs/skein/README.md](docs/skein/README.md)                                                           |
| Fork AI rules and procedures                           | [AI协作纪律.md](docs/skein/discipline/AI协作纪律.md), [工程菜谱.md](docs/skein/discipline/工程菜谱.md) |
| Every other document                                   | [docs/README.md](docs/README.md)                                                                       |

## Rules

- **Branches and pull requests** follow
  [releasing.md](docs/dev/releasing.md#pull-requests-and-commits): work goes
  to `main` from a branch, never pushed directly; plain English commit
  messages; don't merge a pull request yourself unless asked.
- **Run the checks** before you say a change is done: `npm run check:quick`
  while you work (only your files), and `npm run check` before a pull
  request ([CONTRIBUTING.md](CONTRIBUTING.md#before-you-push)).
- **Don't change CI or the test setup to make a check pass**: `.github/`,
  `playwright*.config.ts`, `vite*.config.ts`, `eslint.config.js`,
  `tsconfig*.json`, `scripts/check-*.mjs`, `e2e/helpers.ts`, or a test's
  expectation. Fix the code; if a check is truly wrong, change it in a pull
  request of its own that says why.
- **Reproduce a bug before fixing it**, in the engine where it was seen,
  and add a test in the lowest layer that catches it; check that it fails
  without the fix ([testing.md](docs/dev/testing.md)).
- **Check native behaviour in the built app** (`npm run tauri build -- --debug`):
  the window bar, title bar and traffic lights, drag regions, full screen,
  the side panels' layout and motion, `Cmd` shortcuts that have a menu
  item, file dialogs, input methods. A browser can't show these. Say in
  the pull request what you ran.
- **Generated files are never edited by hand**: `src/platform/bindings/`
  (`npm run bindings`), `docs/dev/plugins/reference.md`
  (`node scripts/plugin-reference.mjs`). The checks fail while they are
  stale.
- **Drag with pointer events** (`src/engine/drag/pointer-drag.ts`), never HTML drag
  and drop: the window's file drop swallows it.
- **The e2e plugin flows need a textus-plugins checkout** beside the
  repository or at `TEXTUS_PLUGINS_DIR`; without one the catalog is empty
  ([testing.md](docs/dev/testing.md#the-official-plugins)).
- **Keep the code shape** in [code-style.md](docs/dev/code-style.md)
  (file size, hooks a component, pure logic apart from side effects,
  provider differences as data). Make the smallest change that fixes the cause, match the
  surrounding code, and write comments that say why, not what.
- **Startup**: anything first used after a click or a keystroke loads
  through `lazyModule` (`src/lazy/lazy-module.ts`); the startup layer
  imports none of it. A pull request that grows the entry chunk says by how
  much, and why it can't wait.
- **Every user-visible string goes into all ten locale files** in
  `src/i18n/locales/` ([recipes.md](docs/dev/recipes.md#add-a-ui-string)).
- **Shapes shared by Rust and TypeScript** carry a comment on both sides
  naming the other; change both.
- **Interface work** follows the Skein decisions
  ([docs/skein/decisions/](docs/skein/decisions/README.md)): tokens only
  (no raw colour, radius or font size in a component), and the review
  checklist before a pull request that changes how something looks.
- **iOS is the same app in a narrower layout**: gate only what the platform
  can't do, with `#[cfg(desktop)]` and the flags in
  `src/platform/capabilities.ts`, never to hide a feature
  ([ios-code-map.md](docs/dev/ios-code-map.md)).
- **WebView2 can be as old as Chromium 105**: newer CSS goes behind
  `@supports` ([webview-support.md](docs/dev/webview-support.md)).
- **A release note** is a new file under `docs/releases/next/`
  ([its README](docs/releases/next/README.md)), never an edit to
  `docs/releases/X.Y.Z.md`. Documentation and notes are English.

## Safety

- Never commit or print secrets: anything named `*.local`, API keys, tokens,
  `AuthKey_*.p8`, signing keys.
- Never run an installed Textus (`/usr/bin/textus`, `/Applications/Textus.app`)
  for testing, and never point a test build at a real user's data. Run
  `npm run tauri dev` with throwaway data folders (on Linux set
  `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `XDG_STATE_HOME`
  to a temporary directory; [storage.md](docs/dev/storage.md) lists the
  folders on each platform).
- Never `rm -rf` a path built from a variable; move files to the trash or a
  scratch folder instead. Don't kill processes you didn't start.
- Don't drive the user's desktop (synthetic key presses, focusing windows)
  without being asked.
- The updater: Textus publishes `textus-latest.json`, never `latest.json`
  (that name belongs to old Levis installs). `npm run check` guards this;
  don't work around it.
- Don't change signing, notarization, release or store workflows unless the
  task is about them.
