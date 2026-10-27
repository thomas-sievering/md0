# Generator proof

## Ticket 06 and md0 rename: Windows verification, October 27, 2026

The app/package, UI and project-local skill are now `md0` / `verify-md0`; the feature tracker is `.scratch/md0/`. Doctor confirmed `md0`, version 0.1.0, the exact isolated profile, this checkout's renderer and the built main bundle hash. Ctrl+click was confirmed with the user before implementation. Existing default legacy profiles are retained for compatibility without moving/deleting user data.

Six journeys passed with exit code 0, `passed: true`, no cleanup errors and every recorded scratch directory independently confirmed absent. Action logs, traces, screenshots/ARIA and exact file copies remain at:

- `test-results/verification/2026-10-27T17-57-46-083Z-search-25824/`: shortcut/menu search, Enter/Shift+Enter and both navigation buttons, empty/no-match states, Escape/close focus return, unchanged source bytes, ordinary versus deliberate HTTP/HTTPS link clicks, and refusal of active/unknown/file/relative/anchor destinations. `external-browser-calls.json` independently lists three allowed calls, including an autolink whose literal `&amp;` is retained; no actual websites were launched. The menu screenshot shows the gesture explanation. The extended journey also proves query typing remains outside document bytes across autosave, and that external reloads retain query/input caret and the focused navigation button. Screenshots/ARIA plus `disk-after-search-autosave.md` and `disk-after-search-reload.md` capture those transitions.
- `test-results/verification/2026-10-27T17-57-51-240Z-edit-21740/`: menu/shortcut opening/saving, exact BOM/mixed endings, retained additions and reopen.
- `test-results/verification/2026-10-27T17-57-52-572Z-conflicts-21988/`: clean external reload, dirty conflict, canceled/successful copy, latest-disk load, retained backup and restart recovery with missing original.
- `test-results/verification/2026-10-27T17-57-56-070Z-safety-26176/`: retained dirty work in a second-window open and canceled original-window close.
- `test-results/verification/2026-10-27T17-57-57-511Z-autosave-23520/`: real-time typing-pause save and independently checked exact bytes.
- `test-results/verification/2026-10-27T17-58-00-428Z-drafts-7180/`: blank focused startup, local protection, real restarts/recovery, save cancellation/conversion and blank restart.

These runs were repeated after all review corrections. Standards: one documented queue violation and one authorization-duplication heuristic were corrected; browser launches share the application queue and privileged IPC uses one caller-authorization helper. Spec: one P1 and two P2 findings were individually reproduced with failing real Electron tests, then corrected (autosave search-focus loss, external-reload search-state/focus loss, and inappropriate autolink entity decoding). All four targeted search/link tests pass. This is local validation of fixes, not a claimed second independent review. The main bundle hash in every result matches the current build, and the renderer was freshly rebuilt before the final suite/journeys.

Final validation: typecheck and 24 unit tests pass; four targeted search/link Electron tests pass; the final complete Electron run finished 24/25. The remaining failure is `tests/e2e/drafts.spec.ts:110`: the page closes while the draft-protection test checks that its alert disappears. Earlier complete 23-test runs each finished 22/23 (virtual-clock autosave, then close-versus-protection); both failed tests passed when rerun individually. Their behavior was not changed as part of this ticket. The full suite is not claimed green. The final failure trace remains under `test-results/e2e/drafts-local-backup-failur-71e70-ntil-thoughts-are-protected/trace.zip`.

The new search/link Electron tests also cover literal brackets, edits with search open, reference/autolinks, escaped destinations/entities and code/image nonactivation. The helper does not claim those additional suite cases. Native dialog/browser appearance and human typography/typing acceptance remain unverified.

Playwright now clears only `test-results/e2e/`, preserving `test-results/verification/` across later suite runs. Earlier historical evidence below may already have been cleared by the previous root-level output directory.

```sh
npx playwright show-trace test-results/verification/2026-10-27T17-57-46-083Z-search-25824/trace.zip
```

## Ticket 05: File entry points and separate windows

On Windows at implementation `2ddd19e`, `npm run typecheck` and `npm test` passed: 24 unit tests and 21 Electron tests. A separate trace-on run of the six file-entry/window/recovery tests passed; traces are retained under `test-results/file-entrypoints/`. They cover actual second-process invocation, duplicate focus and Windows ASCII case aliases, named-window Ctrl+N, startup recovery warnings, failed OS opens in drafts, native Chromium file drops, persistent recent paths/retry, and cross-window backup ownership. Initial independent review found two integration bugs; both were reproduced red, fixed and accepted in targeted re-review with zero unresolved spec findings. The optional shared-extension-policy duplication was also removed.

After the final suite (which clears older `test-results`), the helper journeys passed with `passed: true`, no cleanup errors, and both recorded scratch directories independently confirmed absent:

- `test-results/verification/2026-10-27T16-49-58-670Z-safety-7500/`: Ctrl+O opens a separate document window, retains dirty original work without confirmation, then canceled original-window close keeps both windows and original bytes. Both windows are captured.
- `test-results/verification/2026-10-27T16-50-00-151Z-edit-17404/`: menu/shortcut saves, exact mixed-ending source bytes and same-file reopen/focus.

```sh
npx playwright show-trace test-results/file-entrypoints/drop-a-real-file-drop-open-26ea9-ext-or-replacing-dirty-work/trace.zip
npx playwright show-trace test-results/verification/2026-10-27T16-49-58-670Z-safety-7500/trace.zip
```

CDP file drag events exercise Chromium's drag pipeline with OS-backed File objects through the real editor handler. This is not a claim of manually dragging with the physical Explorer mouse. Native dialog appearance, final file associations, installer and human visual acceptance remain outside these proofs. Older evidence links below are historical and may have been cleared by later suites; archive current evidence before running a clearing command.

## Ticket 04: Immediate thoughts and draft recovery

User confirmed: restore the last unsaved draft, otherwise start blank. On Windows, `npm run typecheck` and `npm test` passed (24 document tests, 15 Electron tests, including mixed-corruption recovery and fresh-draft undo isolation). Five helper journeys passed after that build, with no cleanup errors and independently confirmed absent scratch directories:

- `test-results/verification/2026-10-27T16-29-14-997Z-drafts-7040/`: focused blank startup → keyboard thoughts → local recovery record → actual app restart → retained text → canceled/successful Markdown save → blank focused restart. Screenshots, ARIA, three doctor reports, restart traces and exact saved-file bytes are retained.
- `test-results/verification/2026-10-27T16-29-17-259Z-autosave-22964/`: named-file autosave still preserves exact bytes.
- `test-results/verification/2026-10-27T16-29-20-262Z-conflicts-2816/`: external reload, conflict actions, copy and restart recovery.
- `test-results/verification/2026-10-27T16-29-24-010Z-edit-25552/`: explicit menu/shortcut saves and reopen.
- `test-results/verification/2026-10-27T16-29-25-447Z-safety-21016/`: cancel named-document switch and close.

Draft/new-document failure, independent identities and no-replace target tests are recorded separately in the unit/Electron suite, not claimed by the short helper journey. The helper proves normal restart recovery, not abrupt power-loss behavior or native dialog visuals. Screenshot inspection confirms the old file-open welcome is gone and the startup caret is in the empty writing surface; this does not claim human typography acceptance.

```sh
npx playwright show-trace test-results/verification/2026-10-27T16-29-14-997Z-drafts-7040/before-draft-restart.zip
```

## Ticket 03: Autosave verification

After `npm run typecheck` and `npm test` passed (15 document tests, 13 Electron tests, including the backup-restoration timer regression), ran the updated helper on Windows with a fresh build. All four journeys exited 0 with `passed: true`, no cleanup errors and removed scratch directories:

- `test-results/verification/2026-10-27T16-01-44-203Z-autosave-25424/`: real-time dirty-to-saved transition, unchanged disk before save, exact BOM/mixed-ending bytes afterward; screenshot, ARIA, action log and trace.
- `test-results/verification/2026-10-27T16-01-52-525Z-edit-25700/`: deliberate menu/shortcut saves with renderer time paused before autosave.
- `test-results/verification/2026-10-27T16-01-54-593Z-safety-20204/`: canceled switch and close with renderer time paused.
- `test-results/verification/2026-10-27T16-01-47-882Z-conflicts-25580/`: real-time external reload, both conflict actions and restart recovery.

Inspect the autosave trace:

```sh
npx playwright show-trace test-results/verification/2026-10-27T16-01-44-203Z-autosave-25424/trace.zip
```

Controlled-time conflict, coalescing, access/read-only failure, explicit retry and document-switch coverage is in `tests/e2e/autosave.spec.ts`, not claimed by the short real-time helper journey. Native dialog visuals and human typing-feel acceptance remain unverified.

## Initial generator verification (tickets 01–02)

Ran on the actual local Windows Electron target, not a browser preview or container stand-in. `npm run build` succeeded, then all three helper commands exited 0 with `passed: true` and no cleanup errors.

Evidence directories (relative to repository root):

- `test-results/verification/2026-10-27T15-35-32-278Z-edit-16456/`: menu and shortcut open/save, no-autosave dirty state, byte preservation and reopen.
- `test-results/verification/2026-10-27T15-35-34-414Z-conflicts-21764/`: clean external reload, conflict, copy cancel/save, latest disk load, startup recovery after restart with missing original.
- `test-results/verification/2026-10-27T15-35-39-104Z-safety-10496/`: canceled shortcut switch and window close; awaited native confirmation invocation before asserting retained state.

Inspect the editing trace:

```sh
npx playwright show-trace test-results/verification/2026-10-27T15-35-32-278Z-edit-16456/trace.zip
```

After teardown, independently checked all three directories: evidence files and trace ZIPs still exist, scratch directories are absent, and recorded main/launcher PIDs are no longer running. Artifact counts are 15, 21 and 11 respectively.

An earlier failed doctor incorrectly assumed Windows launcher PID equals Electron main-process PID. That attempt also executed cleanup and retained its failure evidence; the doctor now records both PIDs and checks the owned profile/renderer on its launched connection.

Dependencies/Electron were already installed. These runs validate build and launch from an empty profile, not a fresh-machine `npm ci` or Electron runtime download. No additional setup was supplied by a stand-in. Native dialogs alone were substituted, as in existing repo E2E tests. Manual native-dialog interaction, visual acceptance, file-specific recovery, alternate unsaved-switch entry and discard acceptance remain explicitly unverified; see the feature map for those paths.

Artifacts are ignored local files, not committed fixtures. Later test commands may erase ignored test output; archive a run outside `test-results` before running tools that clear that directory when long-term retention is needed.
