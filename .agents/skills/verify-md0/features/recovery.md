# Recover a local conflict backup

Users can recover the locally retained text from an explicit conflict disk-load operation, including after restarting when the original file has disappeared.

## Sub-features

- `restore-startup`: recover the most recent backup without opening a document first.
- `restore-current-file`: opening an original first scopes recovery to its latest backup.
- `restore-missing`: recovered text remains dirty and the absent original is not recreated.

## How to get to it (user POV)

- First resolve a dirty conflict with `Dateiversion laden`; this creates the local backup.
- After restart, `Menü` → `Lokale Sicherung wiederherstellen`.
- Alternatively open the original file, then use that same menu command for file-specific recovery.

## Driving it with Playwright Electron

Preconditions: a real backup produced through the preceding conflict journey. The helper seeds this precondition by driving the actual conflict controls, never by writing a backup. Run `node .agents/skills/verify-md0/scripts/verify.mjs conflicts`.

- **Restart:** after `disk-loaded`, close only the owned app, delete owned `note.md`, then relaunch with the same temporary `--user-data-dir`. Run doctor again.
- **Startup restore:** click `Menü`, then `getByRole('button', { name: 'Lokale Sicherung wiederherstellen', exact: true })`. Textbox contains `Local text`; status is `Ungespeichert`. Assert `readFile(note.md)` still rejects; capture `recovered`. Backup JSON, action log and before/after restart traces survive cleanup.
- **File-specific entry (additional coverage):** in a separate scenario, retain the original instead of deleting it on restart; select it through `Datei öffnen`, then choose the same recovery menu button. Require the corresponding backed-up local text and unchanged original bytes. This is not executed by the shipped helper; add the scenario and assertions before reporting `restore-current-file` verified.

## Gotchas

- A fresh profile has no backups. Starting recovery without first creating a dirty-conflict disk-load backup fails the journey's precondition; do not call an unavailable action a pass.
- Ordinary unsaved edits do not create backups. This feature is not general crash/draft recovery.
- Use the same isolated profile across restart and retain it until proof is captured. A different profile cannot see the backup.
- Backups contain raw local text and are unencrypted. Verification uses synthetic fixtures; avoid collecting personal documents into artifacts.
- Dirty recovery confirmation, invalid UTF-8 originals, and copy-save after recovery need explicit additional evidence. Startup recovery alone does not establish file-specific entry coverage.
