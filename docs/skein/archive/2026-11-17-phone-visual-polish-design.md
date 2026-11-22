# Phone visual polish design

## Goal

Bring the Android phone surfaces from functional desktop reuse to the approved
Skein paper-and-ink composition, starting with the library home and then
applying the same visual rules to the editor, action sheets, and settings.

## Direction

- Product: a quiet Markdown library for returning to writing quickly.
- Character: literary, restrained, tactile.
- World: warm paper, graphite text, hairline rules, and fire only for active writing.
- Rich moments: the library tree and the document reading surface.
- Signature: a small fire mark for the note currently being written.

## Rules

- Android interaction follows Material 3: touch targets are at least 48dp,
  list rows use the 56/72/88dp rhythm, and FABs are 56dp.
- The Skein board remains the visual authority for palette and composition.
- Phone CSS is scoped under the phone surface or mobile root; desktop tree
  styling is not changed to achieve the phone result.
- Text uses existing semantic tokens. New visible strings go in all ten locale
  files.
- Every screen is checked with a fresh Android emulator screenshot beside its
  approved board before it is called complete.

## Sequence

1. Home: rebuild spacing, type hierarchy, search, tree rows, icons, and FAB.
2. Editor: tune title bar, document type, line height, progress, and word count.
3. Sheets: tune row height, section spacing, icon containers, and destructive state.
4. Settings: tune list rhythm, section titles, subpage hierarchy, and back affordance.
5. Shared motion and Android back behavior.

## Acceptance

The home, editor, sheet, and settings screenshots must show no clipping,
overlap, desktop toolbar leakage, undersized touch targets, or unexplained
spacing. The final check includes the phone unit tests, typecheck, lint,
Prettier, and a fresh emulator screenshot for every touched screen.
