# Inefficiency Log (append-only, mandatory)

Every session appends one block — honestly. Friction you absorb silently
is friction the next agent hits blind. "None this session" is valid only
if literally nothing slowed you down.

<!-- TEMPLATE — copy below the last entry:
---
## YYYY-MM-DD — <agent> / <model>
- **Problem:** <what went wrong or was slower than it should be>
- **Cost:** <rough time/effort wasted>
- **Cause:** <root cause if known>
- **Workaround / fix:** <what worked, or "unresolved">
- **Prevent next time:** <protocol/context change that would have avoided it>
-->

---
## 2026-07-13 — Super Z / unknown
- **Problem:** Backend `pytest` collection failed with `sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL from string 'file:/home/z/my-project/db/custom.db'` before any test ran.
- **Cost:** ~5 minutes of diagnosis (reading conftest.py, database.py, config.py, hunting for the source of the bad URL).
- **Cause:** The Z.ai sandbox scaffold ships a `/home/z/my-project/.env` file containing `DATABASE_URL=file:/home/z/my-project/db/custom.db` (for the agent's own workspace DB, not for Task2SMS). Pydantic Settings picks up environment variables from the parent process, so when pytest imported `app.core.database`, `settings.DATABASE_URL` was the bad value and `create_async_engine` failed at import time.
- **Workaround / fix:** Override the env var before running pytest: `export DATABASE_URL="sqlite+aiosqlite:///./task2sms.db" && /home/z/.venv/bin/python3 -m pytest`. Documented in `system/environments.md` "Verified commands".
- **Prevent next time:** Documented in `system/environments.md` so the next agent on this sandbox sees the workaround. (Not preventable at the project level — the leak is in the sandbox scaffold, not Task2SMS.)

---
## 2026-07-13 — Super Z / unknown
- **Problem:** Frontend `npm install` failed on a clean checkout with `ERESOLVE` peer-dependency conflict between `vite@8.0.3` (pinned in `package.json`) and `@vitejs/plugin-react@4.7.0` (which only supports vite 4-7).
- **Cost:** ~10 minutes of diagnosis (reading package.json, package-lock.json, git log on package.json to find when vite 8 was introduced, discovering commit `91e7a01` had reverted the `afd986e` downgrade).
- **Cause:** Commit `afd986e` had correctly downgraded vite from 8.0.3 to 7.3.1 to fix this exact conflict, but commit `91e7a01` "feat: implement multi-element fields for web monitors" accidentally reverted it — likely a merge-conflict resolution that took the wrong side.
- **Workaround / fix:** Reverted vite to `^7.3.1` and regenerated `package-lock.json` from a clean install (commit `279d7ac`). `npm install` now succeeds without `--legacy-peer-deps`.
- **Prevent next time:** None at the project level — this was a one-off merge-conflict mistake. The protocol's Step 6 (review recent commits) caught it; future agents should keep doing that step.

---
## 2026-07-13 — Super Z / unknown
- **Problem:** Adding `min_length=8` to `UserCreate.password` (commit `23fe670`) broke two existing test fixtures that used 5-7 character placeholder passwords (`"correct"`, `"wrong"`, `"u1"`, `"u2"`).
- **Cost:** One test-failure cycle (~2 minutes to read the failure, identify the fixture, and fix).
- **Cause:** The new schema constraint was correct (aligns with the existing `/api/settings/change-password` endpoint's 8-char minimum), but the tests had been written with short placeholder strings that violated the new policy.
- **Workaround / fix:** Updated `tests/test_auth.py` fixtures to use 8+ char passwords (`"correctpass"`, `"wrongpass"`, `"u1user"`, `"u2user"`). Test intent unchanged.
- **Prevent next time:** When tightening input validation, grep the test suite for the affected fields before pushing — fixture strings often use short placeholders that don't satisfy stricter limits.
