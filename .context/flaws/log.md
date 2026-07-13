# Flaws Log (append-only — flows to the protocol package)

Friction caused by the `.context/` system or the protocol itself. See
`README.md` in this directory for the split between `flaws/` and
`inefficiencies/`.

<!-- TEMPLATE — copy below the last entry:
---
## YYYY-MM-DD — <agent> / <model> (Session N)

- **Flaw:** <what in the protocol or .context/ system didn't work>
- **Symptom:** <what happened to the agent — the observable friction>
- **Root cause:** <why the protocol/.context/ let this happen>
- **Suggested fix:** <concrete change to the package — a step, a pitfall,
  a template, a rule>
- **Status:** open | fixed in package <commit-sha or date>
-->

---
## 2026-07-13 — Super Z / unknown (Session 1)

- **Flaw:** The `task2sms-kickoff.md` universal kickoff file (from the `TisoneK/.context` package) states under "Package Repository" that `TisoneK/.context` is "public — Clone directly, no PAT needed." It is actually **private** — unauthenticated requests to `https://github.com/TisoneK/.context` return HTTP 404; only requests with the user's PAT return HTTP 200.
- **Symptom:** The agent's first `git clone https://github.com/TisoneK/.context.git .context` failed with `fatal: could not read Username for 'https://github.com': No such device or address` (git tries to prompt for credentials on a 404). The agent had to probe the URL with `curl`, discover the repo was private, then re-clone with the PAT — adding ~3 minutes and one extra step to Step 0.
- **Root cause:** The package repo's visibility was changed to private after the kickoff file was written, and the kickoff file was never updated. The kickoff file's "Is the package repo private? No" line is a hard-coded claim that nothing re-validates.
- **Suggested fix:** Two options: (1) Make `TisoneK/.context` actually public (preferred — the protocol is open-source by design and there's no reason for the package repo to be private). (2) If it must stay private, update the kickoff file's "Package Repository" section to say "Yes — clone with the same PAT you used for the project repo" and add a Step 0-C.3 note that re-uses `GIT_TOKEN` for the package clone. Also add a line to the kickoff's "Common Pitfalls" section: "If the package repo is private, the clone will fail with a 404 — re-run with `https://x-access-token:${GIT_TOKEN}@github.com/TisoneK/.context.git`."
- **Status:** open

---
## 2026-07-13 — Super Z / unknown (Session 1)

- **Flaw:** The protocol's Step 4 ("Install dependencies") says "Python projects: ALWAYS create a virtualenv first" — but the Z.ai cloud sandbox comes with a pre-provisioned venv at `/home/z/.venv` that already has the project's pinned deps (and several others like gradio, fastmcp, mcp, svglib). Creating a new venv would have re-installed everything from scratch (~2 minutes) and lost the pre-installed packages.
- **Symptom:** The agent initially tried `/home/z/.venv/bin/pip install` (failed — no `pip` in the venv, only `pip3`), then `pip3 install` (succeeded, with peer-dep conflict warnings about the pre-installed gradio/fastmcp/mcp versions). Net result: ~1 minute wasted on the wrong pip path.
- **Root cause:** The protocol assumes a fresh sandbox where the agent creates its own venv. It doesn't address the case where the sandbox provides a pre-provisioned venv with non-project packages already installed.
- **Suggested fix:** Add a Step 4 sub-step: "Check for an existing venv first: `ls /home/z/.venv/bin/python3` (Z.ai sandbox) or `ls .venv/bin/python` (local). If it exists and has the project's deps, use it (`/home/z/.venv/bin/python3 -m pytest`). Only create a new venv if no pre-existing one is found or if the pre-existing one is missing the project's deps." Also note: "On the Z.ai sandbox, use `pip3` not `pip` — the venv at `/home/z/.venv` has `pip3` but not `pip`."
- **Status:** open

---
## 2026-07-13 — Super Z / unknown (Session 1)

- **Flaw:** The protocol's Step 4 doesn't warn that the sandbox scaffold's `/home/z/my-project/.env` may leak environment variables that break the project's config. In this session, the scaffold's `DATABASE_URL=file:/home/z/my-project/db/custom.db` leaked into the env and broke `pytest` collection.
- **Symptom:** First `pytest` run failed with `sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL from string 'file:/home/z/my-project/db/custom.db'` before any test ran. ~5 minutes of diagnosis.
- **Root cause:** The protocol assumes the project's `.env` is the only source of env vars. It doesn't account for the sandbox scaffold's own `.env` (which is for the agent workspace, not for the project) leaking into the project's process environment.
- **Suggested fix:** Add a Step 8 (baseline health checks) sub-step: "If pytest fails at collection time with a config-import error, check `env | grep -i database` (or whichever env var the project reads) — the sandbox scaffold's `/home/z/my-project/.env` may be leaking a non-project value. Override with `export DATABASE_URL=...` before re-running."
- **Status:** open
