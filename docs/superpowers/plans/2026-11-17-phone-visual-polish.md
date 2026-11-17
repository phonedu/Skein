# Phone visual polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-specs to implement this plan task-by-task.

**Goal:** Polish Textus Android phone screens against the Skein phone mockup, beginning with the library home.

**Architecture:** Keep phone presentation in phone and mobile scoped CSS. Reuse existing FileTree, editor, sheet, and settings behavior, changing only their phone composition and visual tokens. Capture each changed screen from `Xiaoshidan_API35` and compare it with the approved board.

**Tech Stack:** React, TypeScript, scoped CSS, Vitest, Tauri Android dev build, adb screenshots, Ryugi Artifacts.

---

### Task 1: Establish the phone visual token contract

**Files:**

- Modify: `src/phone/PhoneHome.css`
- Modify: `src/phone/PhoneEditorBar.css`
- Modify: `src/mobile/styles/base.css`
- Test: `src/phone/PhoneHome.test.tsx`

- [ ] Add contract assertions for the home searchbox, FAB, and 48px+ controls.
- [ ] Run `npx vitest run src/phone/PhoneHome.test.tsx` and confirm the new assertions fail against the current CSS.
- [ ] Replace phone-only raw layout values with existing spacing, type, shape, and semantic color tokens; keep the board's 56dp FAB and 48px touch targets.
- [ ] Run `npx vitest run src/phone/PhoneHome.test.tsx src/phone/PhoneEditorBar.test.tsx`.
- [ ] Run `npx tsc --noEmit && npx tsc -p tsconfig.node.json --noEmit`.
- [ ] Run `npx prettier --check src/phone/PhoneHome.css src/phone/PhoneEditorBar.css src/mobile/styles/base.css src/phone/PhoneHome.test.tsx`.
- [ ] Capture `.ryugi/tmp/phone-home-after.png` from the emulator and compare it with `.ryugi/tmp/phone-mockup/artboard-1.png`.

### Task 2: Polish the library tree surface

**Files:**

- Modify: `src/phone/PhoneHome.tsx`
- Modify: `src/phone/PhoneHome.css`
- Modify: `src/files/FileTree.css`
- Test: `src/phone/PhoneHome.test.tsx`
- Test: `src/files/FileTree.test.ts`

- [ ] Add a failing test that ensures phone rendering hides the desktop tree toolbar while retaining the existing open-file callback.
- [ ] Run the focused tests and confirm the failure.
- [ ] Add the phone-only tree skin: 56px document rows, 56px folder rows, 48px icon hit areas, balanced left indentation, muted metadata, active fire mark, and no desktop sorting/refresh controls.
- [ ] Keep the desktop `.tree-row` contract at 28px and verify it with `src/files/FileTree.test.ts`.
- [ ] Run focused tests, typecheck, lint, and Prettier.
- [ ] Seed the approved throwaway vault only if already available, capture populated and empty home screenshots, and compare both against artboard-1.

### Task 3: Polish the editor reading surface

**Files:**

- Modify: `src/phone/PhoneEditorBar.tsx`
- Modify: `src/phone/PhoneEditorBar.css`
- Modify: `src/mobile/styles/editor.css`
- Test: `src/phone/PhoneEditorBar.test.tsx`

- [ ] Add failing assertions for the title hierarchy, 48px bar actions, and the document title's centered layout.
- [ ] Run the focused test and confirm the failure.
- [ ] Apply the approved paper-and-ink type scale, 16px body rhythm, serif document heading, 1px progress rule, and bottom word-count placement without changing editor behavior.
- [ ] Run phone tests, typecheck, lint, and Prettier.
- [ ] Open a real note on Android and capture the editor screenshot beside artboard-2.

### Task 4: Polish action sheets and settings

**Files:**

- Modify: `src/engine/controls/ActionSheet.css`
- Modify: `src/engine/controls/Sheet.tsx` only if the existing sheet needs a phone class hook.
- Modify: `src/features/settings/settings-phone.css`
- Modify: `src/features/settings/settings-phone.tsx`
- Test: `src/features/settings/settings-phone.test.tsx`

- [ ] Add failing assertions for 48px sheet/settings rows, visible section spacing, and a phone back affordance.
- [ ] Run the focused tests and confirm the failure.
- [ ] Apply Material 3 touch sizing with Skein paper surfaces, grouped hairlines, semantic fire/danger colors, and clear primary/subtitle hierarchy.
- [ ] Run focused tests, typecheck, lint, and Prettier.
- [ ] Capture the document action sheet, library sheet, settings list, and one settings subpage on Android and compare with artboards 4, 5, and 6.

### Task 5: Verify the complete phone visual pass

**Files:**

- Modify: `docs/releases/next/phone-visual-polish.md`
- Modify: `.ryugi/artifacts/artboard/phone-home-visual/canvas.json`
- Add: `.ryugi/artifacts/artboard/phone-visual-polish/pages/*`

- [ ] Run `npm run check:quick` and record the known unrelated editor environment flakes separately.
- [ ] Restart the Android dev app, capture all touched screens after the final edit, and verify that every screenshot is fresh.
- [ ] Update the visual comparison artifact with the current screenshots and run its Artifacts check until CLEAN.
- [ ] Run `git diff --check`, the focused Vitest suite, TypeScript, ESLint, and Prettier.
- [ ] Record the final emulator evidence and remaining visual gaps in the verify page.
