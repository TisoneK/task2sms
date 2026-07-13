# Agent + Model Registry (update in place)

Which agents and models have worked on this repo — and what they've
shown they can and can't do here. Update your row each session (last
seen + session count); add a row if you're new. The Observations
section is how the user learns which agent to hand which task, and how
agents learn a predecessor's blind spots (and verify its work
accordingly).

| Agent | Model | First seen | Last seen | Sessions |
|---|---|---|---|---|
| Super Z | glm-5.2 (initially recorded as `unknown` because the system prompt states "built on the GLM model" without an exact version; corrected to `glm-5.2` on 2026-07-13 after the user stated the model in chat — per protocol precedence, user statement is authoritative) | 2026-07-13 | 2026-07-13 | 2 |

## Observations

Concrete, evidence-based capabilities and limits — things demonstrated
in this repo's sessions, not marketing claims or self-assessment.
Update in place when a newer session contradicts an old observation.

- **Super Z / glm-5.2:** Discovered and worked around a factual error in the kickoff file (`task2sms-kickoff.md` claims `TisoneK/.context` is public — it is actually private; cloned successfully using the user's PAT). (2026-07-13)
- **Super Z / glm-5.2:** Sandbox has no Docker installed — `docker-compose up` cannot run; backend/frontend must be tested via direct `uvicorn`/`vite` instead. (2026-07-13)
- **Super Z / glm-5.2:** Successfully ran a 12-commit session end-to-end (bootstrap + 11 fixes + report) on the Task2SMS repo. Backend pytest 46/46 green throughout; frontend `npm run build` succeeded after each UI commit. Demonstrated: Pydantic schema tightening, FastAPI lifespan startup validator, Jinja2 autoescape, jose/jinja2 version bumps, SQLAlchemy ORM refactor (replacing `text()`), React.lazy code-splitting (initial bundle 453→253 kB), aria-label coverage, JWT-expiry PrivateRoute, tailwind darkMode config, vite regression revert, alembic env.py model imports. (2026-07-13)
- **Super Z / glm-5.2:** Sub-agent delegation pattern worked well: two parallel `Explore` sub-agents (one for backend, one for frontend) deep-scanned the codebase and surfaced 50 findings between them in a single round-trip. Sub-agent outputs were thorough, with file:line references and severity ratings. Worth reusing for future reviews on this repo. (2026-07-13)
- **Super Z / glm-5.2:** Hit one sandbox-specific failure: the workspace `/home/z/my-project/.env` leaks `DATABASE_URL=file:/home/z/my-project/db/custom.db` into the env, which broke `pytest` until overridden. Documented in `system/environments.md` "Verified commands" so the next agent doesn't rediscover it. (2026-07-13)
- **Super Z / glm-5.2:** Violated Common Pitfall #30 during a post-session follow-up — asked the user "fix it or just log it?" when the protocol already prescribes "fix safe issues." The user called it out. Model is capable of protocol violations under conversational pressure; future sessions should re-read Pitfall #30 before responding to follow-up turns. (2026-07-13)
- **Super Z / glm-5.2:** Session 2 — skipped the `.context/` protocol bootstrap (Step 0–3) on the first attempt, diving into code inspection instead. User called it out ("Did you even read the uploaded file?"). Model acknowledged and restarted properly. Indicates the model is prone to shortcutting protocol steps when the task seems mechanically clear ("add Railway support" → "just read the Dockerfile and write one"). Future sessions: when a kickoff file is uploaded, treat Steps 0–3 as non-negotiable preamble, even if the task seems small. (2026-07-13, Session 2)
- **Super Z / glm-5.2:** Session 2 — successfully shipped a 3-commit feature (Railway single-service hosting) without Docker available on the sandbox. Worked around it by: (1) writing a `TestClient`-based smoke test for the SPA-serving logic (validates the FastAPI route ordering + catch-all without needing a running container), (2) static review of the Dockerfile, (3) verifying `npm run build` produces the exact output structure the Dockerfile stage 1 emits. Pattern worth reusing when Docker is unavailable: validate each layer of the image separately via the toolchain that IS available. (2026-07-13, Session 2)
