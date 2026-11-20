---
name: skein-ui
description: Work on the Skein fork's interface - host-small-change + plugin-first, the rulings in the interface plan, phone two-book specs, Base UI and tokens. Use when changing layout, settings, phone UI, adding a view, or deciding whether a UI change belongs in the host or a plugin.
---

# Skein interface

The interface authority is the Skein plan, not upstream design docs. `docs/design/` and `docs/images/` are deleted; `04-boards/` is sealed (ruling 29). Do not look for a board or `design-language.md` to copy.

## Read first

- `docs/skein/README.md` §三 (current route) and §五 (reading order).
- `docs/skein/02-方案/Textus-界面改造方案.md` §4: every ruling, including numbers and names.
- `docs/skein/03-调研/界面现状盘点.md`: host truth - what each panel does and where it lives.
- Phone work: `02-方案/Textus-手机端工具栏改造方案.md` and `02-方案/Textus-手机端元素一致性方案.md`.
- `docs/skein/01-纪律/工程菜谱.md` R4.

## Route

- **Desktop:** host v1.4.5 is the base. Make a small host change only when a feature is blocked; features go to plugins. "Small host + plugin first" is ruling 29.
- **Phone:** the Android line is ours; iOS belongs to upstream. Do not put desktop tabs, the 48px track or the push sidebar on a phone unchanged.
- **Boards:** `04-boards/` is sealed - non-authoritative, not to be built from, not to be "corrected".
- **Design standard:** `docs/design/design-language.md` is not ours; tokens come from the code and the §4 rulings.

## Rules

- **Ruling first.** If no ruling covers the change, append one to §4 (the next number or a named ruling): what changes, why, and what it replaces. Get the user's approval before building.
- **Tokens only.** No raw colour, radius or font size in a component; spacing on the 4-point grid. Base UI supplies behaviour; the skin is drawn with our tokens.
- **Settings is an overlay**, not a page or tab (ruling 5). Keep the navigation column, search and Escape behaviour.
- **Landed host surfaces stay** unless a new ruling says otherwise: the settings overlay, single-island paper and the paper-and-ink base colours. Reopening one is a ruling, not a refactor.
- **Plugin first.** If a plugin can carry the feature, it does not become a host page. The host only does what blocks the plugin.
- **Platform gates** go through `src/platform/capabilities.ts`; gate only what the platform cannot do, never to hide a feature.
- **Startup:** anything first used after a click or keystroke loads through `lazyModule`; keep the entry chunk's budget.
- **Ten locales** for every user-visible string.

## Workflow

1. Write the six task lines; state which ruling governs the change.
2. If there is no ruling, stop and get one; do not invent an interface direction.
3. Decide host vs plugin. If plugin, use `docs/skein/03-调研/插件API要点.md` and the plugin recipe.
4. Make the smallest change; tokens; tests at the lowest layer.
5. Evidence: screenshots/recording for anything visible, built-app check for native behaviour, `npm run check:quick`; update task list and release note when user-visible.

## Don't

- Use `04-boards/` as the target, or "fix" it.
- Resurrect `docs/design/design-language.md` or `docs/images/`.
- Overturn a ruling silently, or change the host shell for a feature that belongs in a plugin.
- Use raw colours/radii/font sizes, half-pixel type sizes, or desktop elements on a phone.
- Change CI or test expectations to make a UI check pass.
