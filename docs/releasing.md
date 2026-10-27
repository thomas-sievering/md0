# Release checklist

## Before the first public push

- [x] Confirm the source license and copyright holder: MIT, Thomas Sievering. Root `LICENSE`, package metadata, and documentation agree.
- [x] Choose the repository owner/name and public visibility: `thomas-sievering/md0`.
- [x] Review the initial snapshot using an explicit path list; no blanket add of local scratch or imported skills.
- [x] Use a fresh, single-root publication history without `.scratch/` tickets or prototypes. Preserve the prior development history locally; do not push that archive branch.
- [x] Confirm the publication identity: Thomas Sievering, `thomas.sievering@gmail.com`. The initial public commit has no development-history parents.
- [x] Scan the candidate files and prior historical file versions for credential/private-path patterns. No matches found. Automated pattern checks are a first pass, not proof that no private information exists.
- [x] Enable GitHub private vulnerability reporting and document it in `SECURITY.md`.
- [x] Review the synthetic-draft README screenshots and check relative documentation file links.

The public snapshot excludes scratch tickets/prototypes and their old history. The repository also ignores imported personal skills, `skills-lock.json`, dependencies, build output, and local test evidence. The md0-specific verification skill remains versioned. Keep the local development archive off the public remote.

## Check the release candidate

From a clean checkout on Windows with Node 24:

```sh
npm ci
npm run typecheck
npm test
npm run dist:win
```

The Windows workflow performs these checks and retains the installer as a build artifact. It does not publish a GitHub Release or push changes.

Manually verify:

- Per-user installation and Start menu launch.
- The solid-circle app icon in the taskbar.
- Windows' explicit default-app selection for `.md`.
- Explorer opening a Markdown path with spaces/non-ASCII characters, both before and after the app is running.
- Draft retention across normal restart and existing-file autosave.
- Uninstall behavior; never assume uninstall erases local drafts or recovery data.
- `resources/THIRD_PARTY_NOTICES.txt`, `resources/FONT_LICENSE.md`, and Electron/Chromium runtime notices accompany the installed app.

There is no code-signing certificate configured. Clearly label the installer as unsigned; do not imply that Windows security warnings have been eliminated.

## Publish only after approval

1. Finalize the version and release notes in `CHANGELOG.md`.
2. Review and commit the intended source changes.
3. Create/configure the approved repository, push the reviewed history, and inspect the first CI run.
4. Tag the release and attach `dist/md0-Setup-<version>.exe` to a GitHub Release. Do not commit executable build artifacts to Git.
5. Update the README's download wording once a release actually exists.

Code signing, update delivery, and additional platforms can follow later. None is promised by the current release candidate.
