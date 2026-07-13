# Task2SMS

A full-stack platform for automated multi-channel messaging — SMS, WhatsApp, Telegram, and Email — driven by scheduled tasks, conditional rules, live data sources, and web monitoring.

---

## Features

### Messaging Channels
- **SMS** — Africa's Talking, Twilio, GSM modem; automatic retry with exponential backoff; fallback mock for testing
- **WhatsApp** — Twilio WhatsApp sandbox / Business API
- **Telegram** — Bot API with HTML/Markdown/MarkdownV2 parse modes; bot status verification
- **Email** — Async SMTP with Jinja2 HTML templates (Gmail, SendGrid, any SMTP provider)

### Task Automation
- **Flexible Scheduling** — Cron expressions, intervals (every X min/hr/day), or one-time execution
- **Conditional Sending** — Send only when a rule is met (e.g. `score < 50`, `price changed`)
- **Message Templates** — `{variable}` placeholders filled from context at runtime
- **Multi-channel Tasks** — One task can trigger SMS, email, WhatsApp, and Telegram simultaneously

### Integrations
- **Data Sources** — Connect REST APIs or CSV URLs; live data used as task context for conditional logic
- **Web Monitor** — Watch any element on any website using CSS selectors, XPath, text match, or regex
  - Auto-detects JavaScript-rendered pages and upgrades to Playwright headless Chromium
  - Conditions: value changed, contains, equals, greater/less than
  - Fires alerts via any combination of SMS / Email / WhatsApp / Telegram
- **Webhooks** — HMAC-signed HTTP callbacks fired on every event (SMS, task, email, WhatsApp, Telegram)

### Platform
- **Multi-user & RBAC** — Organizations with Admin / Member / Viewer roles; invite by email
- **Advanced Analytics** — 7/30/90-day breakdowns by channel, delivery rates, provider stats, Excel export
- **Notification History** — Full log for SMS, email, WhatsApp, and Telegram with status and error details
- **Offline Queue & Retry** — Failed SMS messages retry automatically every 5 minutes

### Developer
- Full OpenAPI docs at `/docs` and `/redoc`
- 46 pytest test cases across 8 modules
- Docker + Docker Compose for one-command deployment
- Alembic database migrations (4 versions, SQLite default / PostgreSQL ready)

---

## Quick Start (Local Dev)

### Prerequisites
- Python 3.11+
- Node.js 20+

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # fill in provider keys
uvicorn main:app --reload
```

API: **http://localhost:8000**  
Docs: **http://localhost:8000/docs**

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard: **http://localhost:5173**

---

## Docker (Production)

```bash
cp .env.example .env    # fill in values
docker-compose up -d
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## Railway (Single-Service Hosting)

Host the frontend and backend on **one Railway service** — one container, one port, one billable unit. The FastAPI app serves both `/api/*` (API) and `/*` (built React SPA) from a single uvicorn process. No nginx, no second container.

### One-time setup

1. **Create a Railway project** and add this repo. Railway auto-detects the root `Dockerfile` and `railway.toml`.
2. **Add a Postgres plugin** (recommended) — Railway provides a `DATABASE_URL` you'll wire in below. Alternatively, use the built-in `/app/data` volume mount with SQLite (no plugin needed, but data is lost if the volume is detached).
3. **Set these required environment variables** in the Railway service (Settings → Variables):

   | Variable | Value |
   |---|---|
   | `SECRET_KEY` | A random 32+ char string (e.g. `openssl rand -hex 32`). **Must not** be the placeholder. |
   | `WEBHOOK_SECRET` | Another random string. **Must not** be the placeholder. |
   | `FRONTEND_URL` | `https://<your-service>.up.railway.app` (your Railway domain — generate one in Settings → Networking). |
   | `DATABASE_URL` | From the Postgres plugin's "Connect" tab. Format: `postgresql+asyncpg://...`. (If using SQLite + volume instead: `sqlite+aiosqlite:////app/data/task2sms.db`.) |

4. **Generate a Railway domain** (Settings → Networking → Generate Domain). The app won't pass the startup validator until `FRONTEND_URL` is set to this domain.
5. **Deploy.** Railway builds the image, runs `alembic upgrade head` as a preDeploy step, then starts uvicorn on `$PORT`. The healthcheck pings `/api/health`.

### What the single-service image does

- **Builds the frontend** in a Node 20 stage, copies `dist/` into the backend image at `/app/static`.
- **Backend serves the SPA** when `STATIC_DIR=/app/static` (set automatically by the Dockerfile). `main.py` mounts `/assets/` as `StaticFiles` and adds a catch-all that returns `index.html` for client-side routes (`/login`, `/tasks/123`, etc.). API routes under `/api/*` always take precedence.
- **Security headers** (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) are applied by a FastAPI middleware — moved from the old `nginx.conf` so the single-service deploy keeps them without nginx.
- **Migrations** run on every container start (`alembic upgrade head` in the CMD) AND as a Railway `preDeployCommand`. Idempotent — safe to run twice.
- **Healthcheck** at `/api/health` returns `{"status":"ok","version":"1.0.0"}` without touching the DB, so Railway can verify the service is up before routing traffic.

### Optional environment variables

Set per feature — see `backend/.env.example` for the full list. The most common:

- **SMS:** `DEFAULT_SMS_PROVIDER`, `AT_USERNAME`, `AT_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- **WhatsApp:** `WHATSAPP_PROVIDER`, `WHATSAPP_FROM`
- **Telegram:** `TELEGRAM_BOT_TOKEN`
- **Email:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`
- **Webhooks:** `WEBHOOK_SECRET` (required — see above)

### Local test of the same image

```bash
docker build -t task2sms .
docker run -p 8000:8000 \
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -e WEBHOOK_SECRET=$(openssl rand -hex 32) \
  -e FRONTEND_URL=http://localhost:8000 \
  -e DATABASE_URL=sqlite+aiosqlite:////app/data/task2sms.db \
  -v task2sms-data:/app/data \
  task2sms
```

Then visit **http://localhost:8000** (frontend), **http://localhost:8000/docs** (API docs).

### Railway vs Docker Compose — which to pick?

| | Railway (single service) | Docker Compose (two services) |
|---|---|---|
| Hosting | Railway (managed) | Any Docker host (VPS, self-hosted) |
| Services | 1 container, 1 port | 2 containers (nginx + uvicorn) |
| Billable units | 1 | 2 (or 1 VPS) |
| SSL/TLS | Automatic (Railway domain) | Bring your own (Caddy/traefik/etc.) |
| Persistent storage | Railway volume or Postgres plugin | `./data` bind mount |
| Use when | You want managed hosting with zero ops | You want full control / self-host |

Both deployment paths are maintained. Pick one based on your hosting target — the codebase supports both.

---

## Configuration

All settings in `backend/.env` (copy from `.env.example`):

### Application
| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | — | JWT signing secret — **must change in production** |
| `DATABASE_URL` | `sqlite+aiosqlite:///./task2sms.db` | SQLite or PostgreSQL URL |
| `DEBUG` | `false` | Enable SQLAlchemy query logging |

### SMS Providers
| Variable | Description |
|---|---|
| `DEFAULT_SMS_PROVIDER` | `africastalking` \| `twilio` \| `gsm` |
| `AT_USERNAME` | Africa's Talking username (`sandbox` for testing) |
| `AT_API_KEY` | Africa's Talking API key |
| `AT_SENDER_ID` | Optional sender ID |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio phone number e.g. `+1234567890` |

### WhatsApp
| Variable | Default | Description |
|---|---|---|
| `WHATSAPP_PROVIDER` | `twilio` | WhatsApp provider |
| `WHATSAPP_FROM` | `whatsapp:+14155238886` | Sender number |

### Telegram
| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_DEFAULT_PARSE_MODE` | `HTML` \| `Markdown` \| `MarkdownV2` |

### Email / SMTP
| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port (587 for STARTTLS) |
| `SMTP_USERNAME` | — | SMTP login |
| `SMTP_PASSWORD` | — | SMTP password or app password |
| `SMTP_FROM_EMAIL` | `noreply@task2sms.com` | Sender address |
| `SMTP_FROM_NAME` | `Task2SMS` | Sender display name |

### Webhooks
| Variable | Description |
|---|---|
| `WEBHOOK_SECRET` | HMAC signing secret for outbound webhook signatures |

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/auth/me` | Current user |

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks` | List tasks (paginated) |
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/{id}` | Get task |
| PATCH | `/api/tasks/{id}` | Update task |
| DELETE | `/api/tasks/{id}` | Delete task |
| POST | `/api/tasks/{id}/run` | Run task immediately |
| PATCH | `/api/tasks/{id}/toggle` | Pause / activate |

### SMS
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sms/send` | Send SMS immediately |
| GET | `/api/notifications` | SMS history (paginated) |

### WhatsApp
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/whatsapp/send` | Send WhatsApp message |
| GET | `/api/whatsapp/history` | WhatsApp history |

### Telegram
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/telegram/send` | Send Telegram message |
| GET | `/api/telegram/history` | Telegram history |
| GET | `/api/telegram/bot-info` | Verify bot token |

### Email
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/email/send` | Send email |
| GET | `/api/email/history` | Email history |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics?days=30` | Multi-channel analytics (7/30/90 days) |
| GET | `/api/analytics/export/notifications.xlsx` | Export SMS history to Excel |
| GET | `/api/stats` | Dashboard summary stats |

### Organizations
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/orgs` | My organizations |
| POST | `/api/orgs` | Create organization |
| GET | `/api/orgs/{id}/members` | List members |
| POST | `/api/orgs/{id}/members` | Invite member |
| PATCH | `/api/orgs/{id}/members/{uid}` | Change member role |
| DELETE | `/api/orgs/{id}/members/{uid}` | Remove member |

### Webhooks
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/webhooks` | List webhooks |
| POST | `/api/webhooks` | Create webhook |
| PATCH | `/api/webhooks/{id}` | Update webhook |
| DELETE | `/api/webhooks/{id}` | Delete webhook |
| GET | `/api/webhooks/{id}/deliveries` | Delivery log |
| GET | `/api/webhooks/events/list` | All supported event types |

### Data Sources
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/datasources` | List data sources |
| POST | `/api/datasources` | Create |
| PATCH | `/api/datasources/{id}` | Update |
| DELETE | `/api/datasources/{id}` | Delete |
| POST | `/api/datasources/{id}/fetch` | Fetch now and cache result |

### Web Monitor
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/monitors` | List monitors |
| POST | `/api/monitors` | Create monitor |
| PATCH | `/api/monitors/{id}` | Update monitor |
| DELETE | `/api/monitors/{id}` | Delete monitor |
| POST | `/api/monitors/{id}/check` | Run check immediately |
| GET | `/api/monitors/{id}/logs` | Check history |

### Settings
| Method | Endpoint | Description |
|---|---|---|
| PATCH | `/api/settings/profile` | Update name / email |
| POST | `/api/settings/change-password` | Change password |

---

## Webhook Events

All outbound webhooks include `X-Task2SMS-Signature: sha256=<hmac>` for verification.

| Event | Fired When |
|---|---|
| `sms.sent` | SMS delivered successfully |
| `sms.failed` | SMS delivery failed |
| `task.run` | Task executed (all messages sent) |
| `task.failed` | Task executed with failures |
| `email.sent` | Email sent successfully |
| `whatsapp.sent` | WhatsApp message sent |
| `telegram.sent` | Telegram message sent |

**Verify signatures in your endpoint:**
```python
import hmac, hashlib

def verify(secret: str, body: bytes, header: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)
```

---

## Data Sources & Conditional Logic

Connect a live API to your tasks for dynamic, data-driven messaging:

```
Data Source fetch → {"score": 43, "student": "Alice"}
          ↓
Task condition:  score < 50  → TRUE
          ↓
Template:  "Hi {student}, your score is {score}. Please see your teacher."
          ↓
SMS sent to +254712345678
```

---

## Web Monitor

Watch any element on any website and fire alerts when it changes:

```
URL: https://shop.example.com/product/123
Selector (CSS): span.price
Condition: value changed
Interval: every 30 minutes
Alert channels: SMS + Telegram
```

For JavaScript-rendered sites (React, Vue, Angular), enable **Playwright mode** — the monitor launches a headless Chromium browser, waits for the page to render, then extracts the value.

**Supported selector types:**
- `CSS` — `div.price`, `#stock-count`, `.availability`
- `XPath` — `//span[@class="price"]/text()`
- `Text Contains` — checks if a string exists anywhere on the page
- `Regex` — extracts first capture group from raw HTML

---

## Running Tests

```bash
cd backend
pip install -r requirements.txt
pytest -v
```

| Test File | Coverage |
|---|---|
| `test_auth.py` | Register, login, token validation, protected routes |
| `test_tasks.py` | CRUD, toggle, run now, cron, conditional tasks |
| `test_sms.py` | Send, bulk send, notification history |
| `test_webhooks.py` | Create, update, delete, event validation, deliveries |
| `test_organizations.py` | Create org, invite, RBAC role enforcement |
| `test_analytics.py` | Stats endpoint, date periods, Excel export |
| `test_datasources.py` | CRUD operations |
| `test_settings.py` | Profile update, password change |

---

## Project Structure

```
task2sms/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/        # 13 API route modules
│   │   ├── core/              # Config, database, JWT security
│   │   ├── models/            # 10 SQLAlchemy models
│   │   ├── schemas/           # Pydantic v2 validation
│   │   ├── services/
│   │   │   ├── core/          # User, Task, Org, Analytics
│   │   │   ├── messaging/     # SMS, Email, WhatsApp, Telegram, Notifications
│   │   │   └── integrations/  # DataSource, Scraper, Webhooks
│   │   └── workers/           # APScheduler (tasks + monitors + retry)
│   ├── alembic/               # 4 DB migrations
│   ├── tests/                 # 46 test cases across 8 modules
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/             # 16 route pages
│       ├── components/ui/     # Layout, Modal, ThemeToggle, etc.
│       ├── hooks/             # useStats, useTasks, useNotifications
│       ├── services/          # Axios API client
│       └── store/             # Zustand: auth + theme
├── Dockerfile                 # Single-service image (Railway / any container host)
├── railway.toml               # Railway config-as-code (healthcheck, preDeploy, volume)
├── docker-compose.yml         # Two-service Compose stack (nginx + uvicorn)
├── .env.example
└── README.md
```

---

## SMS Providers

### Africa's Talking (recommended for Kenya/Africa)
1. Sign up at [africastalking.com](https://africastalking.com)
2. Use `sandbox` username + sandbox API key for free testing
3. Set `DEFAULT_SMS_PROVIDER=africastalking`

### Twilio
1. Sign up at [twilio.com](https://twilio.com)
2. Get a phone number from the console
3. For WhatsApp: join the sandbox — send `join <word>` to `+14155238886`

### GSM Modem
1. Connect modem via USB
2. Set `GSM_PORT=/dev/ttyUSB0` (Linux) or `COM3` (Windows)
3. Set `DEFAULT_SMS_PROVIDER=gsm`

---

## Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the token into `TELEGRAM_BOT_TOKEN`
4. Users must send `/start` to the bot before it can message them
5. Use chat IDs (numeric) for users/groups or `@channel_username` for public channels

---

## License

MIT
