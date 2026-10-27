# Domain docs

This repo uses a single-context layout: root `GLOSSARY.md` and `docs/adr/`.

## Before exploring the codebase

- Read `GLOSSARY.md` at the repo root.
- Read ADRs in `docs/adr/` that touch the area you're about to work in.

If these files don't exist, proceed silently. Create domain docs lazily through `/domain-modeling`, when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis, test name, or other output, use the term defined in `GLOSSARY.md`.

If the concept isn't in the glossary, reconsider whether it fits the project's language or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, surface the conflict explicitly and explain why the decision is worth reopening.
