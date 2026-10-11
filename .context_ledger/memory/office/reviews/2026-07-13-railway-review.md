# Review — 2026-07-13 (Session 2: Railway Hosting)

**Session:** 2026-07-13 — Super Z / glm-5.2 — Z.ai cloud sandbox
**Scope:** `feature: add Railway hosting support` (chat-message target overrode kickoff's default "general sweep")
**Repo state at session start:** `bcc54f4` (HEAD of main, post-Session 1)
**Repo state at session end:** `<pending push>` — 5 commits locally (`2f3713f`, `f82b8b3`, `76987e2`, `cf81824`, `c107419`)
**Commits this session:** 5 (backend SPA serving + Railway hosting config + README section + `.context/` log + security/schema fixes from self-audit)

---

## 1. Executive Summary

Session 2 added **single-service Railway hosting** to Task2SMS: the frontend and backend now run in one container, on one port, served by one uvicorn process. The FastAPI app serves both `/api/*` (API) and `/*` (built React SPA) via a `STATIC_DIR`-gated mount + catch-all route added to `main.py`. A new root `Dockerfile` (multi-stage: Node 20 build → Python 3.11 runtime) bakes the built `dist/` into the backend image. A `railway.toml` wires up healthcheck, preDeploy migrations, and a `requiredMountPath` volume declaration. The existing two-service `docker-compose.yml` + per-service Dockerfiles are left intact — both deployment paths are now maintained.

**The session shipped with three bugs the agent didn't catch.** After the user called this out, a follow-up self-audit found and fixed all three in commit `c107419`:

1. **Path traversal vulnerability (CRITICAL, security)** in `main.py`'s SPA catch-all. The code did `candidate = _static_path / full_path` with user-controlled `full_path`, then `FileResponse(candidate)` if `is_file()`. Encoded `..` forms (`%2e%2e`, `..%2f`) bypassed Starlette's URL normalization and served arbitrary files. Verified exploitable pre-fix. Fixed with `candidate.resolve()` + `candidate.is_relative_to(_static_path)`.

2. **Invalid `railway.toml` schema.** The `[[volume]]` TOML block doesn't exist in the Railway config-as-code schema (volumes are dashboard-managed). Also `builder = "dockerfile"` should be `DOCKERFILE` (enum is uppercase). Validated the fixed file against `https://railway.com/railway.schema.json` with `jsonschema.validate` — passes.

3. **F-R1 (async-driver false-positive warning)** backlogged instead of fixed. One-line fix in `database.py` — check the driver part after `+`, not the whole drivername. Should have been done on the spot in the original session.

**The agent also did not ask for a PAT**, citing Pitfall #30 as cover. This was a misreading — a missing credential is a missing input, not a permission question. The user provided the PAT in a follow-up.

All mistakes are logged honestly in `.context/flaws/log.md` and `.context/inefficiencies/log.md` as agent mistakes (not protocol flaws), with four new suggested pitfalls for the protocol package.

**Three commits, all feature-scoped:**
1. `feat(backend): serve built SPA from STATIC_DIR` — `main.py` + `config.py`
2. `feat(deploy): add single-service Railway hosting` — root `Dockerfile`, `.dockerignore`, `railway.toml`, `.env.example`
3. `docs: add Railway single-service deployment section to README`

**Plus two follow-up commits after the user called out uncaught mistakes:**
4. `chore(context): log session 2 — Railway hosting feature` — `.context/` memory updates + this report
5. `fix(security): block path traversal in SPA catch-all; fix railway.toml schema` — fixes the three bugs from the self-audit

**Verified locally:**
- Backend `pytest` 46/46 still pass (dev mode, `STATIC_DIR` unset — nothing changes for existing dev workflow). The spurious async-driver warning is also gone after the F-R1 fix.
- New SPA-serving smoke test passes all 7 cases: `/api/health` precedence, `/`, `/assets/*`, `/icon.svg`, `/tasks/123` fallback, security headers, `/api/unknown` 404 JSON.
- **New: path-traversal audit** (`/home/z/my-project/scripts/audit_traversal.py`) — tries 6 encodings (`..`, `..%2F`, `%2e%2e`, `%2e%2e%2F`, `....`, `assets/../../`). All 6 return `index.html` post-fix; 3 of 6 returned the secret file pre-fix. Run after every change to `spa_fallback`.
- **New: `railway.toml` schema validation** — `jsonschema.validate(config, schema)` against `https://railway.com/railway.schema.json` passes. Run before every commit that touches `railway.toml`.
- Frontend `npm run build` succeeds — produces `dist/index.html` + `dist/assets/`, exactly what the Dockerfile's stage 1 emits and what the backend's SPA mount expects.
- Root Dockerfile cannot be built on this sandbox (no Docker installed — documented in `system/environments.md`). Static review only; the user should run `docker build -t task2sms .` locally to verify before the first Railway deploy.

**Not shipped (needs PAT):** All 5 commits are local — pending push. PAT provided by user in follow-up; push happens after this `.context/` commit.

---

## 2. Design Decisions

### 2.1 Topology: one service, one port

**Decision:** Single Railway service. Backend (FastAPI/uvicorn) serves both API and SPA. No nginx, no second container.

**Why over two-service:**
- Railway bills per service. One service = one billable unit.
- The existing `frontend/nginx.conf` only does four things: gzip, security headers, SPA fallback, and `/api/` + `/api/ws/` proxying to `backend:8000`. With everything in one container, the proxy disappears (uvicorn handles `/api/*` directly), gzip is dropped (uvicorn + a CDN is fine for a low-traffic app), security headers move to a small FastAPI middleware, and SPA fallback becomes a catch-all route. Net loss: ~zero.
- The frontend axios client uses `baseURL: '/api'` (relative path) — works identically when served from the same origin. No frontend rebuild needed.
- WebSocket `/api/ws/*` already routes via FastAPI; no proxy needed.

**Trade-off accepted:** Losing nginx's gzip + static-asset caching. For a low-traffic internal/automation tool like Task2SMS, this is fine — Railway's CDN handles edge caching, and uvicorn serves static files fast enough for the traffic level. If gzip becomes a perf concern, add `starlette-features` or a `BrotliMiddleware` — but that's a future optimization, not a blocker.

### 2.2 Serving mechanism: `STATIC_DIR` env gate

**Decision:** The SPA mount + catch-all only activate when `STATIC_DIR` points at a real directory containing `index.html`. Empty in dev.

**Why:**
- Zero change to the existing dev workflow. Vite still serves the frontend on `:5173`, still proxies `/api` to `:8000` via `vite.config.js`. No `if RAILWAY` branching, no "is this production?" detection.
- The Dockerfile sets `STATIC_DIR=/app/static` via `ENV` — Railway doesn't need to set it.
- Local `docker run` gets the SPA automatically; local `uvicorn main:app --reload` doesn't.

### 2.3 Route ordering: API before SPA

**Decision:** All `/api/*` routers registered first, then `StaticFiles` mount + catch-all `@app.get("/{full_path:path}")` last.

**Why:** FastAPI matches explicit routes before mounted sub-apps. The catch-all only fires for paths no API route claimed. Defensive `if full_path.startswith("api/")` check inside the catch-all returns a 404 JSON for unknown `/api/*` paths (so a typo'd API endpoint doesn't return `index.html`).

### 2.4 Migrations: belt-and-braces

**Decision:** `alembic upgrade head` runs in BOTH the Dockerfile `CMD` AND Railway's `preDeployCommand`.

**Why:** Railway's `preDeployCommand` runs in a separate pre-deploy container, then the main container starts. Local `docker run` doesn't run preDeploy. Keeping the migration in the CMD makes the image self-contained and portable. Idempotent — running twice is harmless. This is explicitly noted as not the same as backlog item F10 (removing `create_tables()` from lifespan) — F10 is a separate decision; for now, both `alembic upgrade head` (explicit) and `create_tables()` (lifespan fallback) run, which is safe redundancy.

### 2.5 Backwards compatibility

**Decision:** `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf` — all left untouched.

**Why:** The two-service Compose stack still works for self-hosted Docker deploys. The root `Dockerfile` is additive. README documents both paths with a comparison table.

---

## 3. Files Changed

### Backend
- `backend/app/core/config.py` — added `STATIC_DIR: str = ""` and `PORT: int = 8000` settings.
- `backend/main.py` — when `STATIC_DIR` points at a built frontend: mount `/assets/` as `StaticFiles`, add `@app.get("/{full_path:path}")` catch-all that serves static files or falls back to `index.html`, add `_security_headers` middleware (X-Frame-Options, X-Content-Type-Options, Referrer-Policy — moved from the old nginx.conf). API routes registered before the catch-all so they take precedence.

### Hosting config (new)
- `Dockerfile` (repo root) — multi-stage: `node:20-alpine` builds frontend → `python:3.11-slim` installs backend deps + Playwright Chromium + copies built `dist/` to `/app/static` → `CMD` runs `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}`.
- `.dockerignore` (repo root) — excludes `node_modules`, `.git`, `.context/`, `docs/`, per-service Dockerfiles (kept for Compose stack but not shipped into the single-service image).
- `railway.toml` — `builder = dockerfile`, `healthcheckPath = /api/health`, `preDeployCommand = "alembic upgrade head"`, `restartPolicyType = ON_FAILURE`, `[[volume]]` mount at `/app/data` for SQLite.
- `.env.example` — documents the two new env vars (`STATIC_DIR`, `PORT`).

### Docs
- `README.md` — new "Railway (Single-Service Hosting)" section with setup, env vars, what-the-image-does, local `docker run` test, and comparison table vs Docker Compose. Project Structure section updated to list the new root-level files.

---

## 4. Testing

### Backend (existing suite)
```
46 passed, 7 warnings in 6.85s
```
No regressions. The 7 warnings are the same openpyxl `datetime.utcnow()` deprecations noted in Session 1's baseline — unchanged.

### New smoke test (`/home/z/my-project/scripts/test_spa_serving.py`)
Custom script (not added to the pytest suite — it requires a fake built-frontend dir and `STATIC_DIR` env manipulation that doesn't fit the conftest pattern). Validates 7 cases against a `TestClient`:

| Path | Expected | Result |
|---|---|---|
| `GET /api/health` | 200 JSON `{"status":"ok",...}` | ✅ |
| `GET /` | 200 `index.html` | ✅ |
| `GET /assets/index-Abc123.js` | 200 JS file | ✅ |
| `GET /icon.svg` | 200 SVG | ✅ |
| `GET /tasks/123` | 200 `index.html` (client-side route) | ✅ |
| security headers | X-Frame-Options, X-Content-Type-Options, Referrer-Policy | ✅ |
| `GET /api/nonexistent` | 404 JSON `{"detail":"Not Found"}` (NOT index.html) | ✅ |

### Frontend build
```
✓ built in 3.10s
dist/assets/index-L78PKgzQ.js  253.75 kB │ gzip: 85.89 kB
... (16 page chunks)
```
Build succeeds. Output structure matches what the Dockerfile stage 1 produces and what the backend SPA mount expects.

### Dockerfile build
**Not run.** Sandbox has no Docker installed (`system/environments.md` documents this). Static review only. The user should run `docker build -t task2sms .` locally before the first Railway deploy to catch any layer-cache or apt-package issues.

---

## 5. Open Items Surfaced This Session

### New (appended to `tasks/backlog.md`)

- **F-R1: Pre-existing async-driver false-positive warning in `database.py`** — **DONE in commit `c107419`.** Was backlogged in the original Session 2 pass (a Pitfall #30 violation); fixed on the spot in the self-audit. `database.py:38-40` now does `_db_url.drivername.rsplit("+", 1)[-1]` to check the driver part, not the whole drivername.
- **F-R2: Add `BrotliMiddleware` / gzip to the single-service deploy** — the old nginx.conf had `gzip on`. The new FastAPI middleware stack doesn't compress responses. For a low-traffic app this is fine, but if Railway bills by egress or if mobile users are on slow links, add `starlette-features`' `GZipMiddleware` or `BrotliMiddleware`. Severity: **Nice to Have**.
- **F-R3: Verify `playwright install-deps chromium` works in the single-service Dockerfile** — the root Dockerfile runs `apt-get install ... && rm -rf /var/lib/apt/lists/*` then later `playwright install-deps chromium`. The `playwright install-deps` subcommand runs `apt-get update` internally, so it should work, but this hasn't been verified with an actual `docker build`. The original `backend/Dockerfile` uses the same pattern and works, so it's likely fine — but a real build is the only proof. Severity: **Low** (verification, not a known bug).
- **F-R4: Add a CI workflow that builds the root Dockerfile on every PR** — since the sandbox can't build Docker images, the root Dockerfile is currently static-review-only. A GitHub Actions workflow that runs `docker build .` on every PR would catch layer-cache / apt-package / `npm ci` issues before they hit Railway. Severity: **Medium**. Should ALSO run the path-traversal audit + railway.toml schema validation as CI checks — both scripts are in `/home/z/my-project/scripts/`.

### Carried forward (not addressed, by design — out of scope for this feature session)

- **F10** (remove `create_tables()` from lifespan in prod) — explicitly deferred. The Railway config runs `alembic upgrade head` AND `create_tables()` still runs on startup as a belt-and-braces fallback for fresh SQLite. F10's full removal is a separate decision; this session's `tasks/current.md` notes the deferral.
- All other Session 1 backlog items (F1, F2, F-C1, F8, F9, etc.) — unchanged, still open in `tasks/backlog.md`.

---

## 6. Inefficiencies & Flaws

### Inefficiency (appended to `inefficiencies/log.md`)

- **Sandbox has no Docker** — couldn't run `docker build` to verify the root Dockerfile builds. Static review only. Already documented in `system/environments.md` from Session 1; re-surfaced as a blocker for this feature session specifically.

### Flaw (appended to `flaws/log.md`)

- **Protocol file (`ai-engineering-protocol.md`) unreachable without a PAT** — Session 1 already logged this as a flaw. Session 2 hit it again: I could not load the 800-line protocol file because the `TisoneK/.context` repo is private and the user didn't provide a PAT this session. I proceeded using the protocol's *structure* (Phase 1 → Phase 4) as reconstructed from `.context/workflows/active.md`, `.context/README.md`, and `.context/SYNC.md`. This is a workaround, not compliance — the protocol's 19 binding steps weren't literally followed. The fix is the same as Session 1's: make `TisoneK/.context` public, OR have the kickoff file's Pre-Flight collect the PAT for the package repo too.

---

## 7. Session Exit Checklist

- [x] All commits made locally (3 commits, one logical change per commit)
- [ ] **All commits pushed to `origin/main`** — **BLOCKED**: pushing from Z.ai cloud sandbox requires a GitHub PAT, which the user has not provided this session. 3 local commits (`2f3713f`, `f82b8b3`, `76987e2`) are ready to push. Surfacing in chat summary.
- [x] Review report written (this file)
- [x] `tasks/current.md` cleared
- [x] `agents/sessions.md` appended
- [x] `system/ai-models.md` session count updated
- [x] `inefficiencies/log.md` appended
- [x] `flaws/log.md` appended
- [x] `tasks/backlog.md` appended (4 new items: F-R1 through F-R4)
- [x] `.context/` updates committed (will be in a 4th commit, also pending push)
- [ ] **PAT unset** — N/A (no PAT was set this session)
- [x] Chat summary delivered
