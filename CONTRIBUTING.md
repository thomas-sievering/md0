# Contributing to md0

md0 is a deliberately small, local Markdown source editor. Keep changes focused: no cloud/account requirement, no preview pane, and no navigation machinery without a clear reason.

## Before contributing

md0 is licensed under the [MIT License](LICENSE). Contributions to md0's own code should use the same license; third-party material must retain its applicable notices.

## Development

On Windows, install Node.js 22.12+ (Node 24 is used in CI):

```sh
npm ci
npm run typecheck
npm test
npm start
```

If your host exports `ELECTRON_RUN_AS_NODE`, clear it before `npm start`; the E2E configuration clears it for GUI tests. Tests launch real Electron windows in isolated temporary profiles and should run in a desktop session.

- `src/main/`: filesystem operations, document sessions, drafts, and window ownership.
- `src/preload.ts`: the narrow, named IPC bridge.
- `src/renderer/`: CodeMirror editor, search, links, chapter index, and styling.
- `tests/`: unit and real-Electron end-to-end tests.
- `docs/engineering.md`: current behavior, safety guarantees and their limits.

## Expectations for changes

- Preserve raw Markdown bytes outside deliberate edits, including mixed line endings and BOM.
- Never discard or overwrite local work silently. Cover save, cancellation, conflict, and restart paths when changing persistence.
- Keep Node and arbitrary filesystem access out of the renderer. Validate privileged operations in the main process.
- Add regression tests and update user-facing documentation when behavior changes.
- Avoid unrelated formatting, generated files, private notes, credentials, and personal sample documents.
- Run `npm run dist:win` for changes to packaging or installed file opening. Check the installer and default-app flow manually as well.

## Reporting problems

Include your Windows version, md0 version, reproduction steps, expected behavior, and whether the document was an unnamed draft or an existing file. Use a minimal synthetic Markdown example. Do not attach private documents, your user profile, recovery records, or unredacted traces.

If a problem could expose private data or bypass the renderer's security boundaries, follow the [security policy](SECURITY.md). Do not publish exploit details or sensitive material in a public issue.
