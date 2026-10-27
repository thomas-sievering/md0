# Protect unsaved work

Opening another file retains existing work in its window. Closing dirty named work still offers an explicit discard guard.

## Sub-features

- `open-retain`: open a different file in a separate window without replacing local edits.
- `close-cancel`: cancel discarding edits when closing the original window.

## How to get to it (user POV)

- With unsaved text, choose `Menü` → `Datei öffnen` or Ctrl+O and select another file. Both windows remain usable.
- Close the dirty document's desktop window. Choose `Abbrechen` to keep working, or `Änderungen verwerfen` to discard.

## Driving it with Playwright Electron

Run `node .agents/skills/verify-md0/scripts/verify.mjs safety` after building.

- The helper pauses renderer time, opens the fixture and appends `Local text` before autosave can run.
- Ctrl+O selects `second.md`. Require two windows, `# Second` in the new one, local text and original file label retained in the first, and no discard dialog. Capture both windows.
- Trigger the original window's real OS close event via Electron. Substitute native confirmation response `0`, await its invocation, then require two windows, editable original text and unchanged original disk bytes. Capture `close-canceled`.
- Menu-open, file-drop and OS-invocation coverage is described in [windows.md](windows.md). Autosave independence is tested in `tests/e2e/autosave.spec.ts`.

## Gotchas

- Native confirmation appearance and OS keyboard/button interaction still need manual Windows verification.
- Identify the original window by its document title rather than assuming Electron window order.
- Cleanup accepts discard only for disposable test work; that is teardown, not feature proof.
