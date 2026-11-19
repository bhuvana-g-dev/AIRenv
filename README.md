# AIRenv · The Intelligence Behind Every Breath

AIRenv is an AI-powered environmental intelligence network for families, schools, residential communities and local organisations dealing with winter smog and urban air pollution. It monitors conditions in the background, reads community context that groups choose to share, and turns both into specific, explained recommendations. Nobody has to check in or log activities.

| Engine | What it does |
| --- | --- |
| **Ambient Environmental Intelligence** | Scheduled collection of PM2.5, PM10, NO₂, SO₂, CO, O₃, weather, mixing height and forecasts. Computes the Indian NAQI (CPCB breakpoints and averaging periods), trends, forecast outlook, dispersion and data confidence. Stores history. |
| **Conversation Intelligence** (optional) | A Telegram bot in opted-in groups extracts planned outdoor activities and open-burning discussions, checks them against the forecast and drafts advisories that an admin approves. Raw messages are never stored. |
| **AI Decision Intelligence** | Rules choose recommendations and compute every number. Gemini rewrites them for the audience and language. Its output is schema-validated and number-checked, with a rule-based fallback. |

## Architecture

```
frontend/  React 19 + TypeScript + Vite + Tailwind v4 + Motion + Recharts + Leaflet
backend/   FastAPI (Python 3.12)
  app/services/
    environmental_data.py    Open-Meteo CAMS, CPCB (data.gov.in), OpenAQ v3, Sensor.Community, hotspot detection
    weather_service.py       Open-Meteo weather + boundary-layer height
    location_service.py      Open-Meteo geocoding, OSM Nominatim reverse geocoding
    pollution_analyzer.py    NAQI sub-indices, categories, trends, dispersion, best windows (deterministic)
    ambient_intelligence.py  Builds the validated bundle: freshness, confidence, station cross-check, caching
    risk_detection.py        Alert signals and live-feed events (rules only)
    ai_engine.py             Gemini REST client, JSON schema, numeric-claim guard
    recommendation_engine.py Six-part recommendations + AI briefing
    assistant_service.py     Grounded Q&A with intent fallback
    event_detection.py       Activity/date/time/burning extraction + PII redaction
    conversation_processor.py Opt-in pipeline, event risk assessment, advisory text
    impact_calculator.py     Inhaled dose, transport/energy CO₂e with uncertainty
    notification_service.py  Priority, dedup, cooldowns, quiet hours, daily cap, Telegram delivery
    telegram_integration.py  Bot commands, opt-in, account linking, webhook/polling
    community_service.py     Communities, events, verified initiatives, statistics
    historical_analytics.py  Hourly records, comparisons, retention
  app/scheduler.py           Background refresh → history → feed → alerts → community event re-assessment
  app/db/store.py            Firestore, or SQLite with the same interface when Firebase isn't configured
```

**Real-time updates** use Server-Sent Events (`/api/stream`). The scheduler publishes `snapshot.updated`, `feed.created` and per-user `notification.created`, and the frontend updates the affected React Query caches in place. EventSource cannot send auth headers, so clients exchange their token for a 60-second, single-use ticket. SSE was chosen over Firestore listeners so that live updates also work in local SQLite mode and no Firestore access has to be opened to clients.

## Running locally

Prerequisites: Python 3.12 and Node 20 or newer.

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env      # optional: add keys
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :8000)
```

With no keys at all you get live CAMS model data, weather, forecasts, the full UI, rule-based intelligence and local single-user auth (`AUTH_MODE=local`).

## Configuration

Secrets are read from environment variables only and never reach the frontend.

| Variable | Purpose | Without it |
| --- | --- | --- |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI briefings, assistant answers, multilingual output | Rule-based text, labelled "Rule engine" |
| `DATA_GOV_IN_API_KEY` | CPCB real-time station data ([data.gov.in](https://data.gov.in), free registration) | Map shows "not configured" for CPCB |
| `OPENAQ_API_KEY` | OpenAQ v3 stations ([explore.openaq.org](https://explore.openaq.org) → account → API key) | Map shows "not configured" for OpenAQ |
| `TELEGRAM_BOT_TOKEN` | Bot from @BotFather | Telegram features show setup instructions |
| `TELEGRAM_MODE` | `polling` (local) / `webhook` (production) / `disabled` | |
| `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` | Webhook verification and URL (HTTPS) | |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CREDENTIALS` | Firestore + token verification (service-account JSON path or content) | SQLite at `SQLITE_PATH` |
| `AUTH_MODE` | `auto` / `local` / `firebase` | `auto` → `firebase` when credentials exist |
| `ADMIN_EMAILS` | Comma-separated e-mails granted the admin role | |
| `CORS_ORIGINS` | Allowed frontend origins | localhost only |
| `REFRESH_INTERVAL_MINUTES` | Scheduler interval (default 15) | |
| `SNAPSHOT_RETENTION_DAYS`, `EVENT_RETENTION_DAYS` | Data retention | 90 / 30 days |

Frontend (`frontend/.env`): `VITE_API_BASE_URL`, and optionally `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` to turn on the sign-in screen (Google or e-mail/password).

### Telegram setup

1. Create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN`.
2. **Personal alerts:** Settings → Telegram → *Generate link*, then open the deep link (`/start <code>`).
3. **Groups:** add the bot, then a group admin sends `/optin`. Until then every message is discarded unparsed. `/setlocation Noida` sets the area. Enter the code the bot returns under Community → Participating groups.
4. For the bot to see ordinary group messages (not only commands), turn off privacy mode in BotFather (`/setprivacy`). Only do this for groups that have opted in.
5. Advisories default to *admin approval*. Groups can switch to *auto-reply*, which is limited to one reply per event and a 30-minute group cooldown.

## Deployment

- **Backend → Render:** `render.yaml` (root dir `backend`). Paste the Firebase service-account JSON into `FIREBASE_CREDENTIALS`. Render's free tier sleeps when idle, which pauses the scheduler. Use a paid instance, or an external cron that calls `/api/health` every 10 minutes. Rate limiting, SSE fan-out and stream tickets are in-process, so run a single instance (or move them to Redis before scaling out).
- **Frontend → Vercel:** root `frontend`; `vercel.json` handles SPA rewrites. Set `VITE_API_BASE_URL` to the Render URL and add the Vercel origin to `CORS_ORIGINS`.
- **Firebase:** enable Authentication (Google, e-mail) and Firestore; deploy `firebase/firestore.rules` and `firebase/firestore.indexes.json`. The rules deny all client writes, and clients may read only their own profile and notifications.

## Data integrity and responsible AI

- **No invented readings.** Each value carries its source, observation time (with UTC offset), units and freshness. CAMS values are labelled *model estimate, not a monitor reading*. When providers fail, the last stored reading is shown with a stale banner. Sample data appears only when the user explicitly chooses it, and every view marks it as sample data.
- **NAQI method.** CPCB breakpoints with 24-h means (PM2.5, PM10, NO₂, SO₂) and 8-h means (CO, O₃) computed from hourly data. The result is labelled an estimate, not an official bulletin. The US AQI from the provider is shown for reference.
- **Confidence.** Confidence drops for stale data, model-only sources, incomplete NAQI and long forecast horizons. It rises when a reference monitor within 10 km agrees within 35%.
- **The AI only explains.** Every number in Gemini output must appear in the supplied context (±2%). Otherwise the response is rejected and the rule text is used. Health framing follows CPCB NAQI statements: no diagnosis, no safety guarantees, and a doctor referral for symptoms. Indoor air is never claimed as measured.
- **Impact honesty.** Exposure (inhaled dose = concentration × EPA inhalation rate × time), emissions (DESNZ-based factors, Indian grid 0.716 kg/kWh, ±25%) and community participation (admin-verified counts) are kept separate. None of them is presented as a change in local AQI.
- **Privacy.** Groups opt in at group level. Phone numbers, e-mails, mentions and links are redacted before any processing. Only structured fields are stored, with automatic expiry. `/optout` or revoking a group deletes its extracted events. Users can export or delete their data. Assistant history stays in the browser.
- **No notification spam.** 12-hour deduplication keys, per-category cooldowns that only an escalation can break, quiet hours (critical alerts still go through) and a daily cap.
- **Security.** Firebase ID-token verification, roles (`member`, `community_admin`, `admin`) checked on every community action, Pydantic validation of all inputs, per-IP rate limits (stricter for AI endpoints), a Telegram webhook secret, restricted CORS and deny-by-default Firestore rules.

## Tests

```powershell
cd backend;  .\.venv\Scripts\python -m pytest -q     # NAQI, trends, extraction, redaction, dedup/cooldowns, impact, API flows
cd frontend; npm run typecheck; npm test; npm run build
```

## Data sources and attribution

Open-Meteo Air Quality & Weather APIs (CC BY 4.0; CAMS data © ECMWF) · CPCB via data.gov.in · OpenAQ · Sensor.Community · © OpenStreetMap contributors (Leaflet) · US EPA Exposure Factors Handbook (2011) · UK DESNZ GHG conversion factors · CEA CO₂ Baseline Database v19 · IPCC 2006 Guidelines.
