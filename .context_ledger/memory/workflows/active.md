# Active Workflow (overwrite when the workflow changes)

The workflow currently in force for this repo — which protocol edition
agents follow and the standing session parameters. Update only when the
user changes the rules; note the change in your session entry.

- **Protocol:** by agent type — local agents → .context_ledger/core/rules/ai-engineering-protocol-local.md; cloud/sandbox agents → .context_ledger/core/rules/ai-engineering-protocol.md
- **Protocol location:** on disk — vendored in `.context_ledger/core/` (no network fetch needed; version in `.context_ledger/core/VERSION`, last verified in `../core.lock`)
- **Package upstream:** https://github.com/TisoneK/context-ledger.git
- **Since:** 2026-10-11
- **Default role:** engineer
- **Scope:** discovery + review + fix all safe issues
- **Target:** general sweep
- **Focus areas:** all — security, performance, UX, architecture, testing, docs
- **Findings handling:** fix safe issues; flag architectural changes for approval
- **Push policy:** push to main directly after each commit (repo is public)
- **Commit style:** Conventional Commits with scope; chore(ledger): for .context_ledger/ changes
- **Commit granularity:** one logical change per commit
- **Deliverable:** report in .context_ledger/memory/office/reviews/ + chat summary
- **Gates:** `.context_ledger/memory/workflows/gates.conf` — checkpoint before each next action; `pre-commit`, `integration`, and `exit` gates are mandatory
