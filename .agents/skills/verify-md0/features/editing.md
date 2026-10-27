# Open, edit and deliberately save

Users open an existing Markdown file, edit its source and save automatically after 1.5 seconds without typing, or immediately through explicit save. Unrelated bytes remain intact.

## Sub-features

- `open-menu` and `open-shortcut`: load an existing document.
- `edit-dirty`: typing changes the editor and dirty indicator; disk stays unchanged before the quiet period expires.
- `autosave`: existing files save after a typing pause; conflicts/errors pause automatic attempts.
- `save-menu` and `save-shortcut`: persist exact text while retaining BOM and unrelated separators.
- `reopen`: saved text survives a new open operation.

## How to get to it (user POV)

- Upper-left `Menü` → `Datei öffnen`, or Ctrl+O.
- Type in the source editor. Wait 1.5 seconds for autosave, or save explicitly.
- `Menü` → `Speichern`, or Ctrl+S.
- Tab can focus the menu button; Escape closes its menu. These keyboard accessibility paths need explicit extra coverage; clicking the menu is not proof of them.

## Driving it with Playwright Electron

Preconditions: baseline fixture and doctor from the index. Run `node .agents/skills/verify-md0/scripts/verify.mjs edit`.

- **Menu open:** click `getByRole('button', { name: 'Menü', exact: true })`, then `getByRole('button', { name: 'Datei öffnen' })`. The native picker returns the owned `note.md`; `getByRole('textbox', { name: 'Markdown bearbeiten' })` contains `# Original`.
- **Type:** click that textbox, press `Control+End`, type `Additional text`. Status becomes `Ungespeichert`; real disk bytes still equal the original. Capture `unsaved`.
- **Shortcut save:** press `Control+s`. Status becomes `Gespeichert`; disk equals original bytes plus `Additional text`, including the original BOM/mixed endings. Capture `saved-keyboard` and `disk-after-keyboard.md`.
- **Menu save:** append ` Menu save`, click `Menü`, then `getByRole('button', { name: /^Speichern/ })`. Require saved status and exact bytes; retain `disk-after-menu.md`.
- **Shortcut reopen:** set the native picker to the same file and press `Control+o`. Require both additions still visible, capture `reopened`.

For autosave evidence, run `node .agents/skills/verify-md0/scripts/verify.mjs autosave`. This uses real time: append text, assert dirty status and unchanged bytes, capture `autosave-pending`, wait for saved status, independently verify exact bytes and capture `autosave-complete` plus `disk-after-autosave.md`. Controlled-time conflict/error/switch cases live in `tests/e2e/autosave.spec.ts`.

## Gotchas

- The `edit` and `safety` helper journeys pause renderer time to keep their deliberate-save/discard actions before the autosave deadline. They are not real-time autosave proof; use the separate `autosave` journey.
- The menu command accessible names include shortcut text; use the helper's partial open-name and save regex rather than exact `Speichern`.
- The textbox is CodeMirror contenteditable, not a textarea. Use real keyboard input; setting its DOM content bypasses the app.
- Ctrl+O reopens only because the native picker stub selects the fixture. Native picker behavior remains unverified.
- The shipped `edit` journey tests appended text and preservation of untouched bytes, not every undo/redo or newline-editing case. Broader cases live in `tests/e2e/history.spec.ts` and `editor.spec.ts`; port them into the isolated helper for new evidence rather than claiming coverage from this journey.
