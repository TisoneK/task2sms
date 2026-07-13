# Agent + Model Registry (update in place)

Which agents and models have worked on this repo — and what they've
shown they can and can't do here. Update your row each session (last
seen + session count); add a row if you're new. The Observations
section is how the user learns which agent to hand which task, and how
agents learn a predecessor's blind spots (and verify its work
accordingly).

| Agent | Model | First seen | Last seen | Sessions |
|---|---|---|---|---|
| Super Z | unknown (system prompt states "built on the GLM model" but no exact version ID — recorded as `unknown` per protocol rule: never fabricate a version) | 2026-07-13 | 2026-07-13 | 1 |

## Observations

Concrete, evidence-based capabilities and limits — things demonstrated
in this repo's sessions, not marketing claims or self-assessment.
Update in place when a newer session contradicts an old observation.

- **Super Z / unknown:** Discovered and worked around a factual error in the kickoff file (`task2sms-kickoff.md` claims `TisoneK/.context` is public — it is actually private; cloned successfully using the user's PAT). (2026-07-13)
- **Super Z / unknown:** Sandbox has no Docker installed — `docker-compose up` cannot run; backend/frontend must be tested via direct `uvicorn`/`vite` instead. (2026-07-13)
- **Super Z / unknown:** Successfully ran a 12-commit session end-to-end (bootstrap + 11 fixes + report) on the Task2SMS repo. Backend pytest 46/46 green throughout; frontend `npm run build` succeeded after each UI commit. Demonstrated: Pydantic schema tightening, FastAPI lifespan startup validator, Jinja2 autoescape, jose/jinja2 version bumps, SQLAlchemy ORM refactor (replacing `text()`), React.lazy code-splitting (initial bundle 453→253 kB), aria-label coverage, JWT-expiry PrivateRoute, tailwind darkMode config, vite regression revert, alembic env.py model imports. (2026-07-13)
- **Super Z / unknown:** Sub-agent delegation pattern worked well: two parallel `Explore` sub-agents (one for backend, one for frontend) deep-scanned the codebase and surfaced 50 findings between them in a single round-trip. Sub-agent outputs were thorough, with file:line references and severity ratings. Worth reusing for future reviews on this repo. (2026-07-13)
- **Super Z / unknown:** Hit one sandbox-specific failure: the workspace `/home/z/my-project/.env` leaks `DATABASE_URL=file:/home/z/my-project/db/custom.db` into the env, which broke `pytest` until overridden. Documented in `system/environments.md` "Verified commands" so the next agent doesn't rediscover it. (2026-07-13)
