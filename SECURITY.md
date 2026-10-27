# Security policy

## Report a vulnerability privately

Use GitHub's **Report a vulnerability** button under this repository's **Security** tab:

https://github.com/thomas-sievering/md0/security/advisories/new

Private vulnerability reporting is enabled for this repository. Reports are shared privately with the maintainer rather than posted as public issues. A GitHub account is required.

Please include:

- The md0 version and Windows version.
- A short description of the impact and the affected boundary.
- Reproduction steps using synthetic Markdown and disposable files.
- A proposed fix, if you have one.

Do not include credentials, private documents, your complete user profile, or unredacted recovery data. Do not publish exploit details in public issues before coordinated disclosure.

## Scope and support

md0 is early software maintained on a best-effort basis, without a guaranteed response time. Security fixes target the latest version; older versions do not have a separate support commitment.

Relevant boundaries include privileged IPC, filesystem access, document/recovery handling, renderer isolation, navigation, and external-link validation. The distributed Windows installer is currently unsigned and updates are manual.
