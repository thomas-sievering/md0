# Third-party notices

md0 includes software and fonts maintained by other projects. Their licenses are separate from any license chosen for md0's own code.

## Runtime components

- **Electron** — MIT, with additional Chromium, Node.js, and other runtime notices. Electron's distribution supplies `LICENSE.electron.txt` and `LICENSES.chromium.html` next to the installed executable.
- **CodeMirror 6**, **Lezer**, and their production dependencies — license texts are collected from the installed dependency graph during every build into `out/THIRD_PARTY_NOTICES.txt`. The installer ships a readable copy at `resources/THIRD_PARTY_NOTICES.txt`.
- **iA Writer Mono**, based on IBM Plex — SIL Open Font License 1.1. Copyright Information Architects Inc. and IBM Corp.; see [the complete font license](assets/fonts/LICENSE.md). The installer also ships `resources/FONT_LICENSE.md`.

The generated notices include complete license texts and copyright notices for production npm packages, not just this summary. The build fails if a production package has no discoverable license file so additions receive explicit review.

Development tools are listed in `package.json` and locked in `package-lock.json`; they are not part of the bundled renderer/main-process code. Consult their package distributions for their respective licenses.
