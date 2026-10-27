---
name: verify-md0
description: Verify md0's Electron desktop UI on Windows with real editor and filesystem journeys. Use after editing, search, link, save, external-change, conflict, or recovery changes, or when collecting behavior evidence.
---

# Verify md0

Read [features/README.md](features/README.md), then the feature being verified. Run from the repository root. This app is a desktop source editor, not a website: there is no HTTP server, port, login, database or migration. The document API is a secondary test seam, not a substitute for UI proof.

## Launch

Use Windows with Node 22.12+ (repo validated with Node 24), installed dependencies and Electron's runtime. If dependencies are absent, run `npm ci`; let Electron installation complete. Then:

```sh
npm run build
node .agents/skills/verify-md0/scripts/verify.mjs edit
```

The helper launches the actual `out/main.cjs` through Playwright `_electron.launch`, with repository path and `--user-data-dir=<unique OS-temp directory>/profile`. It creates a real BOM/mixed-ending Markdown fixture in that directory. An empty profile needs no additional setup. Ready means the isolated profile and local renderer are confirmed, the `Menü` button is visible, and opening the fixture through the menu renders `# Original` in `Markdown bearbeiten`.

The command drives a short-lived session and tears it down automatically; it is not a persistent server. Other journeys:

```sh
node .agents/skills/verify-md0/scripts/verify.mjs conflicts
node .agents/skills/verify-md0/scripts/verify.mjs safety
node .agents/skills/verify-md0/scripts/verify.mjs autosave
node .agents/skills/verify-md0/scripts/verify.mjs drafts
node .agents/skills/verify-md0/scripts/verify.mjs search
node .agents/skills/verify-md0/scripts/verify.mjs chapters
```

Each command owns its profile and files, so runs can coexist without sharing documents. Never attach to the user's running editor. Each E2E test now also owns an isolated profile; run verification separately so evidence and build identity remain clear. Build once before launching; do not rebuild while verification is running.

If a host exports `ELECTRON_RUN_AS_NODE=1`, remove it from the launching shell first (`Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue` in PowerShell). Otherwise Electron runs as Node and rejects Playwright's debugging switch.

## Doctor

The helper's `doctor(label)` is one read-only check on the launched connection: expected package name/version, exact owned `userData`, live launcher, `file:` URL for this checkout's `out/index.html`, and visible menu. It records main-process and launcher PIDs (different on Windows) and the main bundle SHA-256 in `doctor-initial.json`, and again after a recovery restart.

Run it first whenever adding a step or investigating an unexpected state in the helper. Read its output and `error.txt` before retrying; on a failed doctor, do not drive that instance. To retry from chat, let automatic cleanup finish, rebuild if source changed, and rerun the chosen command for a fresh instance. A passing version check alone does not prove a fresh build: the preceding build command and recorded bundle hash matter.

## Drive

The executable Node helper lives at `scripts/verify.mjs`; invoke it with the commands above (no shell-specific env syntax or Unix PTY needed). It uses the repo's installed `@playwright/test` Electron driver, not Chrome/Surf or a web preview. Recipes and all known entry points live in the feature map.

Real controls include `getByRole('button', { name: 'Menü', exact: true })`, `getByRole('textbox', { name: 'Markdown bearbeiten' })`, `Control+o`, and `Control+s`. Native Electron open/save/confirmation dialogs are substituted via `app.evaluate(({ dialog }) => ...)`. The `search` journey additionally records `shell.openExternal` calls instead of opening real websites. These are the agreed external boundaries; editor interactions, IPC and URL validation stay real. Native picker appearance, keyboard navigation, OS overwrite confirmation and actual browser presentation require a separate manual Windows check.

Extend a journey by editing the helper with UI interactions, labeled action log entries and observable assertions. Do not invoke document IPC, set editor internals, or mutate application state via evaluate. Writing a fixture from outside the app is permitted only to model an external writer. Recovery must be driven by its visible menu, not by inserting a backup directly.

## Evidence

Each command prints its unique directory under `test-results/verification/<timestamp>-<journey>-<pid>/`. This is ignored local evidence; preserve it after cleanup. `actions.jsonl` and Playwright trace ZIPs capture actions, screenshots plus ARIA snapshots capture transitions, byte-for-byte disk copies prove saves, and `result.json` records pass/failure and cleanup errors. Conflict runs also retain backup files and copied output. Inspect a trace with `npx playwright show-trace` followed by the actual printed run directory's `trace.zip` path. The initial successful runs and an exact trace command are recorded in [proof.md](proof.md). Require exit code 0, `passed: true`, absent cleanup errors, and relevant assertions/artifacts. Screenshots alone are not behavioral proof. Exercise the real user path, capture action and resulting state, and independently check file bytes/nonexistence as appropriate. Keep all mapped entry points in the report: a menu pass does not verify a shortcut, and a skipped precondition is a failure with its reason, not a weakened journey.

No network, external messages, production files or test-only endpoints are required. There is no dry-run mode here; the helper actually writes disposable files. Mocks are limited to native dialogs and the external-browser boundary. Automated screenshots do not establish human acceptance of font, typing feel or native dialogs.

## Cleanup

The helper always attempts teardown, including failed assertions: stop and retain traces, close its own Electron app (accepting discard only for disposable text), then remove its OS-temp documents/profile. It never removes its evidence directory. `result.json` includes the scratch path and any cleanup error; confirm that path is absent and the evidence files remain after the command.

If cleanup fails, stop before launching another attempt. Target only the recorded owned process tree, after checking its command line/profile; never kill by executable name. The helper's emergency child-process kill is not proof every Windows descendant exited. Inspect the owned PIDs from doctor output before manually removing a leftover scratch directory. An externally interrupted agent or machine crash may bypass `finally`; retained doctor metadata is the ownership reference.

## Helpers

- `node .agents/skills/verify-md0/scripts/verify.mjs edit`: menu + shortcut open/save, dirty state, explicit save before the autosave deadline (paused renderer time), exact bytes, reopen.
- `node .agents/skills/verify-md0/scripts/verify.mjs conflicts`: clean external reload, dirty conflict, canceled/successful copy, latest disk load, backup/restart recovery with missing original.
- `node .agents/skills/verify-md0/scripts/verify.mjs safety`: retained dirty work when opening a second window, then canceled original-window close with paused renderer time.
- `node .agents/skills/verify-md0/scripts/verify.mjs autosave`: real-time dirty-to-saved transition after a typing pause, with exact disk bytes.
- `node .agents/skills/verify-md0/scripts/verify.mjs drafts`: focused blank startup, typing, local protection, restart recovery, save cancellation/conversion and blank restart.
- `node .agents/skills/verify-md0/scripts/verify.mjs search`: menu/shortcut search, navigation, empty/no-match states, close/focus, unchanged bytes, autosave/reload focus retention, deliberate links, literal autolinks and unsafe-scheme refusal without launching websites.
- `node .agents/skills/verify-md0/scripts/verify.mjs chapters`: held-Alt index with repeated keydowns, release without jump, keyboard confirm during a hold, menu/mouse/outside-click entry points, retained selection and unchanged bytes (paused renderer time).

All commands launch, doctor, drive, capture and clean up. No extra helper installation is needed beyond repo dependencies.

## Maintenance

`maintain-verification-skill` is installed in this environment. After `/reload`, invoke `/skill:maintain-verification-skill` when keeping this map aligned with app changes.
