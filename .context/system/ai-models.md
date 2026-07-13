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
