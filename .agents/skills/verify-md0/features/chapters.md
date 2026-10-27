# Transient chapter index

## Sub-features

- `chapters-hold`: holding plain Alt for 300 ms opens an H1/H2 index; releasing Alt closes it without jumping. Repeated Alt keydowns of the same hold neither restart the timer nor count as a foreign combination.
- `chapters-menu`: `Menü` → `Kapitelindex` opens the same index without holding. Escape, choosing an entry or clicking outside closes it.
- Entries come from the Markdown syntax tree: ATX/Setext H1 and H2 only, H2 indented. Frontmatter, fenced code and H3+ are excluded. A document without headings shows `Keine Kapitel vorhanden.`
- The reached chapter is subtly marked (`aria-current`) and is the initial keyboard selection. Arrow up/down, Home/End move; Enter or click confirms.
- Confirming scrolls the heading near the top (or to the end of the page for late headings), keeps the editor's cursor/selection and returns focus. After confirm or Escape the overlay stays closed for the rest of that Alt hold.
- Other Alt combinations (Alt+Shift, Ctrl+Alt, Alt+letter, AltGr/right Alt) suppress or end the held overlay without `preventDefault`. Window focus loss closes it and resets the held state. No global shortcuts are registered.

## How to get to it (user POV)

Hold Alt in an open document until the index appears, move with arrow keys, then Enter (or click an entry). Release Alt to dismiss without jumping. Alternatively open `Menü` → `Kapitelindex`.

## Driving it with Playwright Electron

Build, then run `node .agents/skills/verify-md0/scripts/verify.mjs chapters`. The fixture adds `## Detail`, a fenced `# Hidden code`, `### Too deep`, 120 body paragraphs and a Setext `Last chapter` to the BOM/mixed-ending note; it is opened via the menu with renderer time paused.

- Select the first line. Hold Alt for 200 ms (index hidden), then five repeated Alt keydowns 100 ms apart: the focused `listbox` `Kapitelindex` shows exactly `Original`, `Detail`, `Last chapter`, current `Original`. Capture `chapters-held`.
- Release Alt: hidden, editor focused, DOM selection unchanged.
- New hold, End+Enter: hidden, still hidden after a further 500 ms of the same hold; release; scroll is past 1000 px, selection unchanged. Capture `chapters-confirmed`.
- Menu entry: index focused without holding after 1 s, current marker `Last chapter`. Capture `chapters-menu`; Escape returns focus to the editor.
- Menu entry plus mouse click on `Original` scrolls that heading near the top. Menu entry plus header click closes the index. Exact file bytes are unchanged (`disk-after-chapters.md`).

`npx playwright test tests/e2e/chapters.spec.ts` additionally covers the empty state in a new window, Shift/Ctrl/Alt+letter combinations (no `preventDefault`) and a real OS focus change to a second window.

## Gotchas

- Playwright enables focus emulation, so renderer `blur` never fires under test, and `BrowserWindow.blur()` emits nothing on Windows. The main process forwards real window blur (`document:window-blurred`); tests focus a second BrowserWindow to produce it.
- Real Alt+Tab, Windows system shortcuts and AltGr layouts need a manual check in the target Electron window; synthetic keyboard events are not proof of OS shortcut behavior.
- The verification window takes OS focus. Keystrokes from a person using the desktop at the same time land in the app (one run received a stray `x` in its startup draft) and invalidate that run.
