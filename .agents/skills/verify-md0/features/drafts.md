# Immediate thoughts and unnamed draft recovery

Startup opens the last unsaved unnamed draft, or a focused blank editor. Saved named files are not reopened automatically.

## Sub-features

- `startup-blank`: type immediately without choosing a file.
- `draft-restart`: the latest unsaved unnamed text returns after restarting with the same profile.
- `draft-save`: Ctrl+S opens a Markdown picker; cancellation retains text, a fresh target converts to a named file, and successful conversion retires that draft.
- `new-draft`: Neues Dokument / Ctrl+N parks an unnamed draft under its own identity; named dirty work requires confirmation.
- `draft-errors`: local protection failures stay visible and block leaving the unprotected draft.

## How to get to it (user POV)

- Launch the app and type directly.
- Close and reopen to continue unsaved thoughts. `Lokal gesichert` means local recovery, not a named Markdown file.
- Use Ctrl+S or menu Speichern to name the draft. After saving, the next launch is blank unless another unsaved draft remains.
- Use menu Neues Dokument or Ctrl+N for a fresh page.

## Driving it with Playwright Electron

Run `node .agents/skills/verify-md0/scripts/verify.mjs drafts` after building. The helper does not open its fixture through a picker for this journey. Require blank focused textbox, type `# Instant thoughts`, wait for `Lokal gesichert`, capture the draft record and `draft-protected`. Restart the owned app/profile and require the same text and local status. Cancel Ctrl+S, verify retention, then choose fresh `thoughts.md`, require exact disk bytes and saved status. Restart again and require a blank focused editor. Capture `draft-restored`, `draft-saved-as-file`, `blank-after-save`, doctor reports and traces across restarts.

`tests/e2e/drafts.spec.ts` additionally verifies no automatic file dialog, existing-target refusal, named autosave after conversion, new-document menu and local-protection errors. `tests/drafts.test.ts` uses real temporary storage for independent identities, preservation on switch, emptying a draft, failed publication, malformed recovery and protection retries. These are separate from the short helper proof.

## Gotchas

- No periodic backup timer: every edit successfully acknowledged as `Lokal gesichert` has a file-synced, atomically published record in `userData/drafts/`. Abrupt termination can lose not-yet-acknowledged/in-flight text; hardware/power-loss guarantees are not claimed.
- Storage is local and unencrypted. Failed/corrupt records are preserved, not silently removed. Interrupted staging files are not recovery records.
- The helper proves normal restarts, not forced power loss, native dialog visuals, or the Ctrl+N entry point. It does not prove general recovery of unsaved named files.
