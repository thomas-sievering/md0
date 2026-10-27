# External changes and conflict resolution

Clean files follow an external writer automatically; dirty conflicts retain local work and offer explicit disk-load or copy-save actions.

## Sub-features

- `external-clean`: clean editor reloads after disk changes.
- `external-dirty`: dirty local text remains visible when disk diverges.
- `copy-cancel` and `copy-save`: cancel changes nothing; a fresh-path copy preserves local work without overwriting the original.
- `load-disk`: load the latest disk contents only after retaining a local recovery backup.

## How to get to it (user POV)

- Open a file, then let another editor/agent modify it. Clean reload is automatic.
- If local edits exist, choose `Meine Version als Kopie speichern` or `Dateiversion laden` in the visible conflict area.

## Driving it with Playwright Electron

Preconditions: baseline fixture and doctor. Run `node .agents/skills/verify-md0/scripts/verify.mjs conflicts`; it also exercises recovery.

- **Clean reload:** after menu open, an external `writeFile` changes the owned document to `# Agent\r\nLine two\n`. Wait for textbox text `# Agent`, then capture `clean-reload`. This models a separate writer, not an app setter.
- **Conflict:** append `Local text` through the keyboard, externally write `# Other agent\n`. Wait for `getByRole('button', { name: 'Dateiversion laden', exact: true })`; editor still contains local text. Capture `conflict`.
- **Cancel copy:** configure the native save picker to cancel; click `Meine Version als Kopie speichern`. Wait for editable content again and assert no additional Markdown file appeared.
- **Save copy:** configure that picker to a fresh owned `copy.md`, click the same action, wait for `#notice` containing `als Kopie gespeichert`. Require copy bytes `# Agent\r\nLine two\nLocal text`, while original remains `# Other agent\n`. Capture `copy-saved` and `saved-copy.md`.
- **Latest disk load:** externally write `# Latest agent\n`, click `Dateiversion laden`. Require latest contents and `Gespeichert`. Capture `disk-loaded`; retain actual files from the owned profile's `conflict-recovery` as evidence. The subsequent restart recovery proves the local backup can be used.

## Gotchas

- Polling runs approximately once per second. Use awaited assertions, not fixed sleeps or immediate negative checks.
- Copy-save leaves the original/conflict open. It is not Save As; require the original bytes remain unchanged.
- Targets must be fresh and on a filesystem supporting hard links; existing targets/original aliases are refused. A failure to publish on the actual filesystem is a journey failure, not permission to bypass safety.
- Missing/deleted files, invalid encoding, retained errors, selection/scroll mapping, backup-failure and no-replace refusal need additional scenarios. Existing `tests/e2e/external.spec.ts` and unit tests are references, not proof those cases ran in this helper.
