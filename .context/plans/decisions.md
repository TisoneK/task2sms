# Architectural Decisions (append-only, ADR-style)

Decisions already made — future agents respect these rather than
relitigating them. To reverse one, append a new ADR that supersedes it.

<!-- TEMPLATE — copy below the last entry:
---
## ADR-N: <short title> (YYYY-MM-DD)
- **Status:** accepted | superseded by ADR-M
- **Context:** <what forced the decision>
- **Decision:** <what was decided>
- **Consequences:** <trade-offs accepted; what future agents must respect>
-->

---
## ADR-1: Refuse to start in production with insecure default secrets (2026-07-13)
- **Status:** accepted
- **Context:** `app/core/config.py` ships with placeholder defaults `SECRET_KEY = "dev-secret-key-change-in-production"` and `WEBHOOK_SECRET = "change-me-webhook-secret"`. A production deploy that forgot to override these would silently run with publicly-known signing keys — an attacker could forge JWTs as any user and forge inbound webhook signatures. The same risk applied to `FRONTEND_URL`: a malformed value (empty string, wildcard, scheme-relative) used as a CORS allow-origin with `allow_credentials=True` would quietly weaken CORS.
- **Decision:** Added `_validate_runtime_config()` in `main.py:lifespan` (commit `5d7b186`) that raises `RuntimeError` in `DEBUG=False` mode if any of `SECRET_KEY`, `WEBHOOK_SECRET` are still the default, or if `FRONTEND_URL` is not a valid `http(s)://host[:port]` URL. In `DEBUG=True` mode it logs a warning and continues, so local dev still works.
- **Consequences:** (1) Future agents must not weaken this validator. (2) Anyone deploying Task2SMS to production must set real `SECRET_KEY`, `WEBHOOK_SECRET`, and `FRONTEND_URL` env vars (or `.env` entries) — the README and `.env.example` already say to, but now the app enforces it. (3) The validator runs at app startup, not import time, so pytest (which imports `app` but doesn't start the lifespan) is unaffected. (4) If a future agent adds another secret with an insecure default, extend `_INSECURE_DEFAULTS` rather than adding a separate validator.

---
## ADR-2: Code-split every authenticated route (2026-07-13)
- **Status:** accepted
- **Context:** All 15 authenticated pages were eagerly imported at the top of `App.jsx`, producing a single 454 kB JS bundle. A user who only sends SMS still downloaded the scraper (93 kB), webhooks, organizations, and analytics bundles.
- **Decision:** Convert all 15 authenticated page imports to `React.lazy()` wrapped in a single `<Suspense>` inside the existing `P` component (which already wraps each route in `ErrorBoundary`). Login and Register pages stay eagerly imported — they're needed for the unauthenticated entry path. (Commit `3b46592`.)
- **Consequences:** (1) Initial bundle is now 253 kB (44% reduction); each page is its own 5–10 kB chunk loaded on first navigation. (2) Future agents adding a new page MUST use `lazy(() => import(...))`, not a static import, or they undo the split. (3) The Suspense fallback is a plain "Loading…" div — if a page wants a fancier skeleton, it should handle its own loading state internally, not rely on the route-level fallback. (4) `ErrorBoundary` still wraps each route, so a failure in one page's chunk doesn't take down the whole app.

---
## ADR-3: Tailwind darkMode uses [data-theme="dark"] selector, not the .dark class (2026-07-13)
- **Status:** accepted
- **Context:** The app toggles theme via `<html data-theme="dark">` (set by `src/store/themeStore.js`), but `tailwind.config.js` had no `darkMode` key, so Tailwind defaulted to `media` (OS `prefers-color-scheme`). Any `dark:` variant in components responded to the OS theme, not the manual toggle, making those variants appear broken.
- **Decision:** Configure `darkMode: ['selector', '[data-theme="dark"]']` in `tailwind.config.js` (commit `b394106`). Now `dark:` variants align with the manual toggle.
- **Consequences:** (1) Future agents writing `dark:` variants should remember the trigger is the `data-theme` attribute on `<html>`, not a `.dark` class. (2) The existing CSS-variable-based theming in `src/index.css` (`:root[data-theme='dark'] { ... }`) is the source of truth for theme colors; `dark:` Tailwind variants are a secondary mechanism for one-off overrides. (3) Don't introduce a `.dark` class anywhere — it won't trigger anything.
