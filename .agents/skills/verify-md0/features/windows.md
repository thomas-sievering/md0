# File entry points and separate windows

## Sub-features

- Startup file arguments and a second OS invocation use the same app/profile.
- Open picker, local-file drop and recent-file menu use the same routing.
- A named document or nonempty draft remains in its window; an empty draft may be reused.
- Canonical paths focus existing windows, with Windows case-insensitive comparison.
- Up to ten recent paths survive restart. Missing/inaccessible files show errors without replacing work.

## How to get to it (user POV)

Use the PowerShell development command in the root README with a Markdown path; invoke again for another file or the same file. Drop a local Markdown file onto the editor, or open the menu and select a recent path. Ctrl+N from a named document opens another blank window.

## Driving it with Playwright Electron

After building, run `npx playwright test tests/e2e/windows.spec.ts tests/e2e/drop.spec.ts tests/e2e/recent.spec.ts tests/e2e/recovery-windows.spec.ts`. All tests use unique OS-temp profiles and disposable files. Playwright retains traces under `test-results/e2e/`, separate from persistent verification evidence.

- `windows.spec.ts` uses an actual secondary Electron process, not an emitted synthetic `second-instance` event. Check separate content, retained unsaved edits, duplicate-path focus (ASCII case alias on Windows), Ctrl+N, startup draft-recovery warnings alongside a file argument, and failed OS opens in a draft.
- `drop.spec.ts` uses CDP `Input.dispatchDragEvent` with a real OS path, so Chromium supplies an OS-backed File to the actual renderer drop handler. Require new-window content, byte-for-byte unchanged original, duplicate focus, unsupported-extension error and no inserted file text. It captures `test-results/drop-preserves-work.png`.
- `recent.spec.ts` uses the actual menu/picker, restarts with the same profile, removes a fixture externally, then retries the menu path after restoring that file. Require preserved draft text and no spurious window on failure.
- `recovery-windows.spec.ts` creates a conflict backup through the visible UI, then attempts recovery in another unnamed window. Require duplicate refusal, existing-window focus, and successful recovery from the owning file window.
- The `safety` verification helper separately records two-window retained-work and canceled-close evidence.

## Gotchas

- CDP exercises Chromium's native drag pipeline but not the physical Explorer mouse gesture. Native picker appearance and final Windows file associations remain manual/unverified.
- The first file in a multi-file drop is used. Arbitrary text drops retain CodeMirror's normal behavior.
- Case tests alter ASCII letters only: uppercasing Unicode `ß` changes the actual filename to `SS`, not a case alias on NTFS.
- Canonical realpaths cover symlink aliases, not distinct hard-link paths. Cross-platform distribution and installers remain out of scope.
