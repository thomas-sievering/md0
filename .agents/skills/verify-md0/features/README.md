# md0 verification map

This is the maintained source for user-facing verification. Read the relevant feature file before driving; keep entry points distinct when reporting coverage.

## Baseline preconditions

- Windows, installed repo dependencies/Electron, successful `npm run build`.
- Run from repository root with `node .agents/skills/verify-md0/scripts/verify.mjs <journey>`; journeys are `edit`, `conflicts`, `safety`, `autosave`, `drafts`, `search`, `chapters`.
- The helper creates a unique temporary profile plus `note.md` containing UTF-8 BOM, frontmatter, mixed LF/CRLF, a heading and a code fence. File journeys open it through the menu; `drafts` starts directly in the blank editor.
- Doctor must confirm the checkout's renderer and isolated profile. No credentials, migrations, network or user documents are needed.
- Substituted native dialogs return paths/cancellations only. The search/link journey also records the external-browser boundary without launching websites. Document operations, editor, IPC, URL validation and disk writes remain real.

## Driving conventions

Use Playwright Electron and accessible names; shortcut recipes target Windows Control keys. Capture transition screenshots/ARIA and labeled action logs plus traces. Each invocation owns its instance; the helper performs cleanup even on assertion failure. Never double-drive a default/user profile.

## Proof and skip reporting

Evidence survives under the printed `test-results/verification/<run>/` directory. Check `result.json`, action logs, screenshots/ARIA, traces and independent file evidence. Report feature ID and entry point. An entry not exercised is unverified even when a neighboring entry passes. A missing precondition fails the journey; record the reason in the feature's Gotchas rather than substituting an easier path. Native dialog visuals/interaction, human typography acceptance and broader unit-test guarantees remain outside these automated proofs.

## Features

- [Immediate thoughts and unnamed drafts](drafts.md): blank focused startup, last unsaved draft recovery, deliberate naming and blank restart after save.

- [Open, edit and save](editing.md): menu/shortcut open and save, dirty state, byte fidelity, reopen and autosave.
- [External changes and conflict resolution](external-changes.md): clean reload, conflict actions, copy cancellation and backup before disk load.
- [Recover a local conflict backup](recovery.md): startup and file-specific menu recovery, retained dirty text, missing original.
- [Protect unsaved work](unsaved-work.md): retain work when opening another window; cancel closing dirty work.
- [File entry points and separate windows](windows.md): OS invocation, file drops, duplicate focus and persistent recent files.
- [Search and deliberate links](search-links.md): shortcut/menu search, navigation, empty/no-match states, closing/focus, literal matching, live edits and validated Ctrl+click links.
- [Transient chapter index](chapters.md): held-Alt and menu H1/H2 index, keyboard/mouse jumps that keep the writing selection, dismissal and focus loss.

Each feature uses four H2s: Sub-features, How to get to it (user POV), Driving it with Playwright Electron, Gotchas. Extend this map alongside feature changes.
