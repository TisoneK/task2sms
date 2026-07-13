# User Preferences (update in place)

How the user likes things done **on this project**. Seeded from
Pre-Flight at bootstrap; grows as sessions reveal preferences —
corrections the user gives, patterns they approve, things they state
outright. This file exists so the user never has to give the same
correction twice.

## Learning rules

1. **Record preferences, not instructions.** A preference is standing:
   it would apply to future sessions ("plain-language changelog
   entries"). An instruction is one-off ("skip the tests this once") —
   it dies with the session and does not belong here.
2. **Every bullet carries provenance** — how and when it was learned:
   `(pre-flight)`, `(stated, YYYY-MM-DD)`, `(correction, YYYY-MM-DD)`,
   `(approved pattern, YYYY-MM-DD)`. An explicit statement or correction
   outranks an inferred pattern.
3. **Current-state file.** When the user changes their mind, update the
   bullet in place and refresh its provenance — don't keep the stale
   version. History lives in the session log, not here.
4. **A session instruction beats a recorded preference for that
   session.** Follow the instruction; afterwards, if it looked like a
   standing change of mind, update this file.
5. **Committed to git — keep it professional.** Working-style facts
   only. Never personal details, never opinions about people, never
   credentials.

## Workflow
- Push to main directly after each commit (pre-flight)
- One logical change per commit (pre-flight)
- Follow the `.context/` protocol end-to-end each session (pre-flight)

## Communication
- Plain-language commit messages; technical detail in `.context/reviews/` reports (pre-flight)

## Code style
- Match the existing style of the file/module being edited (approved pattern, 2026-07-13)
- Backend is async-first (FastAPI + aiosqlite + aiosmtplib) — keep new I/O async (approved pattern, 2026-07-13)

## Review depth
- Fix safe issues; flag architectural changes for explicit approval (pre-flight)
- Scope: discovery + review + fix all safe issues (pre-flight)

## Risk & approvals
- Schema/migration changes (Alembic) need explicit user approval before commit (pre-flight — inferred from "flag architectural changes")
- Secret/credential handling: never write to files; use `.context/secrets/` (gitignored) for local-only values (protocol rule)
- Backend is async-first (FastAPI + aiosqlite + aiosmtplib) — keep new I/O async (approved pattern, 2026-07-13, observed in codebase)
- Conventional Commits with scope; `chore(context):` for `.context/` edits; `docs(review):` for review reports (approved pattern, 2026-07-13, observed in git log + protocol rule)
- Security fixes bundled by concern (e.g. all dependency bumps + Jinja2 autoescape in one commit) is acceptable; unrelated concerns split into separate commits (approved pattern, 2026-07-13, observed in protocol §Step 11 examples)
