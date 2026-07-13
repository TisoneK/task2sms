# Environments (update in place)

Machines and sandboxes agents have run on, and what it takes to work on
this project from each. One block per environment; update the matching
block (and its "last verified" date) every time you run on it again.

## Rules

1. **Match before you add.** At session start, check whether the machine
   you're on already has a block (use its "Identify by" line). Update the
   match; add a new block only for a genuinely new environment.
2. **Record what you verified, not what you assume.** A command belongs
   under "Verified commands" only after it ran successfully on this
   environment, this project.
3. **Agents never delete blocks.** An environment the project no longer
   uses may be pruned by the user; if you can't verify a block, leave it
   alone — its last-verified date already says how stale it is.
4. **Machine facts only.** Secret values go in `secrets/`; user
   preferences in `user/`; project-wide decisions in `plans/`.

---
## Z.ai cloud sandbox (last verified 2026-07-13)
- **Identify by:** hostname pattern `c-*-kangaroo.al8.x86_64`, `$USER=z`, `$HOME=/home/z`, Debian 13 trixie, workspace `/home/z/my-project`
- **OS:** Debian GNU/Linux 13 (trixie) on Linux 5.10 (x86_64)
- **Runtimes:** Node v24.18.0, Python 3.12.13 (in `/home/z/.venv`), bun (available)
- **Package manager:** npm 11.16.0, pip/pip3 (venv), bun
- **Verified commands:**
  - `git clone https://github.com/TisoneK/task2sms.git` works (public, no auth)
  - `git clone "https://x-access-token:${GIT_TOKEN}@github.com/TisoneK/.context.git" .context` works (private repo — needs PAT)
  - `git config user.name/user.email` works (sandbox has no global identity)
  - Backend deps: `pip install -r backend/requirements.txt` (Python venv at `/home/z/.venv`) — **not yet run this session**
  - Frontend deps: `npm install` in `frontend/` — **not yet run this session**
  - Tests: `pytest` (backend, 46 cases per README) — **not yet run this session**
- **Quirks:**
  - No `docker` installed on the sandbox — Docker Compose stack (`docker-compose up`) cannot run here. Backend / frontend must be run directly via `uvicorn` and `vite` instead.
  - No `go` / `rustc` / `psql` installed.
  - The `TisoneK/.context` package repo is **private** (returns 404 unauthenticated, 200 with PAT) — the kickoff file's "public" claim is wrong. Always clone/fetch with the PAT.
  - `GIT_TOKEN` env var must persist for the entire session (needed for every push to the project repo from cloud/sandbox). Unset only at protocol Step 19.
  - Project repo (`task2sms`) is public for cloning but pushes still need the PAT — re-add the token to `git remote set-url origin` only for the push, then strip it back (pattern from protocol Step 0-C.2).
