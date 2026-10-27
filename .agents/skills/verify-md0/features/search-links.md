# Search and deliberate links

## Sub-features

- `search-shortcut` and `search-menu`: the same search-only panel, absent outside search.
- Literal, case-insensitive highlighting and current/total match count; empty query and no-match states.
- Enter/Shift+Enter and next/previous buttons wrap through results.
- Escape and close button return focus to the editor without changing source.
- Editing updates matches through CodeMirror search state.
- Autosave retains query-input focus; external reloads retain the open query, input caret and focused search control.
- Ordinary clicks edit; Ctrl+click opens inline, reference and autolink HTTP/HTTPS destinations through the system-browser boundary.
- Unknown/active schemes, local files and anchors are refused. Code and image syntax do not launch the browser.

## How to get to it (user POV)

Press Ctrl+F or select `Menü` → `Im Dokument suchen`. Type a literal query, use Enter/Shift+Enter or arrow buttons, then Escape or the close button. The menu explains `Links öffnen: Strg + Klick (nur HTTP/HTTPS).` Hold Ctrl and click a Markdown link label or destination; an ordinary click only positions the cursor.

## Driving it with Playwright Electron

Build, then run `node .agents/skills/verify-md0/scripts/verify.mjs search`. It opens a BOM/mixed-ending fixture via the menu after doctor validates package `md0` and the owned profile.

- Shortcut search: require focused `getByRole('searchbox', { name: 'Im Dokument suchen' })`, empty prompt, fill `original` and require `1 / 3`. Capture `search-matches`.
- Enter/Shift+Enter and both arrow buttons prove forward/backward wrap. Query `no such text` shows `Keine Treffer`; capture `search-no-matches`.
- Escape closes and focuses the editor. Open again through the menu, search and close by button. Require exact unchanged source bytes.
- Intercept only `shell.openExternal`, record ordinary click as no call, then real Ctrl+click on HTTP and HTTPS labels. Refuse JavaScript, file, custom, relative and anchor destinations; require visible refusal and no additional calls. Confirm the renderer URL is unchanged.
- Retain `external-browser-calls.json`, `disk-before.md`, `disk-after-search-links.md`, `link-gesture-and-refusal` screenshot/ARIA, action log and trace.
- Externally append an autolink containing literal `&amp;`, wait for real reload, Ctrl+click it and require the browser call still contains `&amp;`. The final call artifact contains three allowed destinations.
- With renderer time paused, type a document edit, open search, then advance past autosave. Require saved status and focused search input; continued query typing must not reach the editor or disk. Capture `search-after-autosave` and exact `disk-after-search-autosave.md`.
- Externally replace the document with search focused, advance the poll, require the same query/input caret and updated count. Repeat with a focused navigation button. Capture `search-after-reload`, `search-button-after-reload` and `disk-after-search-reload.md`. Escape must return to the editor.

Run `npx playwright test tests/e2e/search.spec.ts tests/e2e/links.spec.ts` for additional literal bracket queries, editing with search open, reference links, inline-destination entities/escapes and code/image nonactivation. Those additional checks are suite evidence, not claims about the helper journey.

## Gotchas

- Ctrl+click is the confirmed Windows gesture, not ordinary click or a global shortcut. Native browser appearance is not established by an intercepted call.
- Only absolute HTTP/HTTPS destinations are supported; refusal does not mutate document/error/save state. Navigation/window creation in Electron remain blocked.
- Native dialogs and browser launch are the only substitutions. Do not call document IPC or set editor internals to demonstrate these features.
