# Active Workflow (overwrite when the workflow changes)

The workflow currently in force for this repo — which protocol edition
agents follow and the standing session parameters. Update only when the
user changes the rules; note the change in your session entry.

- **Protocol:** `ai-engineering-protocol.md` (cloud/sandbox edition). Local IDE agents should use `ai-engineering-protocol-local.md` instead.
- **Protocol source (raw — for agent fetch):** https://raw.githubusercontent.com/TisoneK/.context/main/ai-engineering-protocol.md
- **Protocol source (blob — for human browsing):** https://github.com/TisoneK/.context/blob/main/ai-engineering-protocol.md
- **Fallback:** if the raw URL 404s (the `TisoneK/.context` repo is currently **private** despite the kickoff file saying public — clone with `https://x-access-token:${GIT_TOKEN}@github.com/TisoneK/.context.git --depth 1` and read `ai-engineering-protocol.md` locally).
- **Since:** 2026-07-13
- **Default role:** engineer — unless a session says otherwise; see the protocol package's `roles/` (reviewer, security-auditor, docs-agent available)
- **Scope:** discovery + review + fix all safe issues
- **Target:** general sweep — scan everything, fix safe issues
- **Focus areas:** all — security, performance, UX, architecture, testing, docs
- **Findings handling:** fix safe issues; flag architectural changes for approval
- **Push policy:** push to main directly after each commit (project repo is public, but uses PAT for pushes from cloud/sandbox)
- **Commit style:** Conventional Commits with scope; `chore(context):` for this directory
- **Commit granularity:** one logical change per commit
- **Deliverable:** report in `.context/reviews/` + chat summary
