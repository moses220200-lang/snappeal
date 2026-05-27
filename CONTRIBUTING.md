# Contributing to ParkingRabbit

The wiki is the source of truth. Code changes follow the wiki, not the other way around. Anything that changes a product decision must be reflected in `wiki/docs/` in the same commit (or PR).

## Sync policy

- **Every wiki edit ships immediately.** No "I'll commit later" — commit and push to `main` as part of the same working session that produced the change.
- **The roadmap is canonical for scope.** If a decision affects what ships in v0.1 / v0.2 / v0.3, `wiki/docs/business/roadmap.md` must reflect it. Same commit.
- **The audit page records every closed decision.** When a `🔴` or `🟡` finding in `wiki/docs/product/v0-1-mockup-audit.md` is resolved, flip it to `✅` with the decision and the date.
- **No silent renames.** A product name, domain, or terminology change touches every relevant doc in one commit. Grep before committing.

## Local workflow

```bash
docker compose up wiki        # http://localhost:8000 — live-reload as you edit
docker compose down
```

CI builds the wiki with `mkdocs build --strict` on every push touching `wiki/**`. Strict mode fails on broken links, missing nav entries, and template errors. Don't push wiki changes that don't build.

## Commit messages

- Imperative mood: *"Add data-gaps tracker page"* not *"Added"* or *"Adding"*.
- Reference the affected wiki section in the first line where it helps (*"Pricing: refactor to non-refundable model"*).
- The body explains *why*, not *what* — the diff shows what.

## Don't

- Don't commit the `.playwright-mcp/` directory (gitignored).
- Don't commit `.env` files (gitignored).
- Don't commit transient screenshots (gitignored — specific files listed).
- Don't bypass `--strict` in `mkdocs build`.
- Don't reverse decisions in the audit page without a dated entry explaining the reversal.
