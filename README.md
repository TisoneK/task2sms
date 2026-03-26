# Task2SMS

A full-stack platform for automated multi-channel messaging — SMS, WhatsApp, and Email — driven by scheduled tasks, conditional rules, and live data sources.

---

## Features

### Core
- **Task Management** — Create, edit, pause, and delete automated messaging tasks
- **Flexible Scheduling** — Cron expressions, intervals (every X min/hr/day), or one-time
- **Conditional Sending** — Send only when a field meets a rule (e.g. `score < 50`)
- **Message Templates** — `{variable}` placeholders rendered from context at runtime

### Channels
- **SMS** — Africa's Talking, Twilio, GSM modem, with automatic retry and fallback mock
- **WhatsApp** — Twilio WhatsApp sandbox / Business API
- **Email** — Async SMTP with HTML templates (Gmail, SendGrid, any SMTP)

### Platform
- **Multi-user & RBAC** — Organizations with Admin / Member / Viewer roles, invite by email
- **Advanced Analytics** — 7/30/90-day breakdowns, delivery rates, provider stats, Excel export
- **Webhooks** — HMAC-signed HTTP callbacks on every event (SMS sent/failed, task run, email sent)
- **Data Sources** — Connect REST APIs or CSV URLs; results used as task context for conditional logic
- **Offline Queue & Retry** — Failed messages retry with exponential backoff automatically
- **Notification History** — Full log across all channels with status, error, and retry info

### Developer
- Full OpenAPI docs at `/docs`
- 45+ pytest test cases
- Docker + Docker Compose for one-command deploy
- Alembic database migrations

---

## Quick Start (Local Dev)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # fill in provider keys
uvicorn main:app --reload
```

API runs at **http://localhost:8000**  
Interactive docs at **http://localhost:8000/docs**

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard at **http://localhost:5173**

---

## Docker (Production)

```bash
cp .env.example .env    # edit values
docker-compose up -d
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

---

## Configuration

All settings in `backend/.env`:

| Variable | Description |
|---|---|
| `SECRET_KEY` | JWT signing secret — **change in production** |
| `DATABASE_URL` | SQLite (default) or PostgreSQL URL |
| `DEFAULT_SMS_PROVIDER` | `africastalking` \| `twilio` \| `gsm` |
| `AT_USERNAME` | Africa's Talking username (`sandbox` for testing) |
| `AT_API_KEY` | Africa's Talking API key |
| `AT_SENDER_ID` | Optional sender ID |
| `TWILIO_ACCOUNT_SID` | Twilio SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio phone number e.g. `+1234567890` |
| `WHATSAPP_FROM` | WhatsApp sender e.g. `whatsapp:+14155238886` |
| `SMTP_HOST` | SMTP server e.g. `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port (587 for TLS) |
| `SMTP_USERNAME` | SMTP login |
| `SMTP_PASSWORD` | SMTP password / app password |
| `SMTP_FROM_EMAIL` | From address |
| `WEBHOOK_SECRET` | HMAC signing secret for outbound webhooks |

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/auth/me` | Current user |

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks` | List (paginated) |
| POST | `/api/tasks` | Create |
| GET | `/api/tasks/{id}` | Get |
| PATCH | `/api/tasks/{id}` | Update |
| DELETE | `/api/tasks/{id}` | Delete |
| POST | `/api/tasks/{id}/run` | Run now |
| PATCH | `/api/tasks/{id}/toggle` | Pause / activate |

### Messaging
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sms/send` | Send SMS immediately |
| GET | `/api/notifications` | SMS history |
| POST | `/api/whatsapp/send` | Send WhatsApp |
| GET | `/api/whatsapp/history` | WhatsApp history |
| POST | `/api/email/send` | Send email |
| GET | `/api/email/history` | Email history |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics?days=30` | Full analytics |
| GET | `/api/analytics/export/notifications.xlsx` | Excel export |
| GET | `/api/stats` | Quick dashboard stats |

### Organizations
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/orgs` | My organizations |
| POST | `/api/orgs` | Create org |
| GET | `/api/orgs/{id}/members` | List members |
| POST | `/api/orgs/{id}/members` | Invite member |
| PATCH | `/api/orgs/{id}/members/{uid}` | Change role |
| DELETE | `/api/orgs/{id}/members/{uid}` | Remove member |

### Webhooks
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/webhooks` | List webhooks |
| POST | `/api/webhooks` | Create |
| PATCH | `/api/webhooks/{id}` | Update |
| DELETE | `/api/webhooks/{id}` | Delete |
| GET | `/api/webhooks/{id}/deliveries` | Delivery log |
| GET | `/api/webhooks/events/list` | All event types |

### Data Sources
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/datasources` | List |
| POST | `/api/datasources` | Create |
| PATCH | `/api/datasources/{id}` | Update |
| DELETE | `/api/datasources/{id}` | Delete |
| POST | `/api/datasources/{id}/fetch` | Fetch now |

### Settings
| Method | Endpoint | Description |
|---|---|---|
| PATCH | `/api/settings/profile` | Update profile |
| POST | `/api/settings/change-password` | Change password |

---

## Webhook Events

| Event | Fired When |
|---|---|
| `sms.sent` | SMS delivered successfully |
| `sms.failed` | SMS delivery failed |
| `task.run` | Task executed (all SMS sent) |
| `task.failed` | Task executed with failures |
| `email.sent` | Email delivered |
| `whatsapp.sent` | WhatsApp message sent |

**Signature verification** — every delivery includes `X-Task2SMS-Signature: sha256=<hmac>`.

Verify in your endpoint:
```python
import hmac, hashlib
expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
assert hmac.compare_digest(expected, request.headers["X-Task2SMS-Signature"])
```

---

## Data Sources

Connect a REST API or CSV URL and use its response as task context:

```
Data Source fetch → {"score": 43, "student": "Alice"}
              ↓
Task condition:  score < 50  → TRUE
              ↓
Message: "Hi {student}, your score {score} needs improvement."
              ↓
SMS sent: "Hi Alice, your score 43 needs improvement."
```

---

## Running Tests

```bash
cd backend
pip install -r requirements.txt
pytest -v
```

Test coverage:
- `test_auth.py` — register, login, token, protected routes
- `test_tasks.py` — CRUD, toggle, run, cron, conditional tasks
- `test_sms.py` — send, bulk, history
- `test_webhooks.py` — create, update, delete, event validation
- `test_organizations.py` — create, invite, RBAC enforcement
- `test_analytics.py` — stats, periods, Excel export
- `test_datasources.py` — CRUD
- `test_settings.py` — profile update, password change

---

## Project Structure

```
task2sms/
├── backend/
│   ├── app/
│   │   ├── api/           # Route handlers (11 modules)
│   │   ├── core/          # Config, DB, JWT security
│   │   ├── models/        # SQLAlchemy models (9 tables)
│   │   ├── schemas/       # Pydantic v2 validation
│   │   ├── services/      # Business logic (10 services)
│   │   └── workers/       # APScheduler task runner
│   ├── alembic/           # DB migrations
│   ├── tests/             # 8 test modules
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/         # 14 route pages
│       ├── components/ui/ # Shared components
│       ├── hooks/         # Custom React hooks
│       ├── services/      # Axios API client
│       └── store/         # Zustand auth state
├── docker-compose.yml
└── .env.example
```

---

## SMS Providers

### Africa's Talking (recommended for Kenya/Africa)
1. Sign up at [africastalking.com](https://africastalking.com)
2. Use `sandbox` + sandbox API key for testing (free)
3. Set `DEFAULT_SMS_PROVIDER=africastalking`

### Twilio
1. Sign up at [twilio.com](https://twilio.com)
2. Get a phone number
3. For WhatsApp: join the sandbox at `wa.me/+14155238886`

### GSM Modem
1. Connect modem via USB
2. Set `GSM_PORT=/dev/ttyUSB0` (Linux) or `COM3` (Windows)
3. Set `DEFAULT_SMS_PROVIDER=gsm`

---

## License

MIT
