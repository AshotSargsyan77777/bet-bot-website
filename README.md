# Goalking Web (React + Django + PostgreSQL)

Web version of the Telegram bot (`index.js`): daily checks from n8n, card payments with admin approval,
promo codes, VIP channel, live fixtures with last-5 form (API-Football), and a VIP combination builder.

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, TypeScript, TanStack Query (`frontend/`) |
| Backend | Django 5, Django REST Framework, SimpleJWT (`backend/`) |
| Database | PostgreSQL 16 (migrations in `backend/apps/*/migrations`) |
| Background jobs | Celery + Redis (fixture sync, form stats) |
| Bot | Node.js Telegram bot (`index.js`, separate service with its own storage) |

## Local development

Requirements: Python 3.12+, Node 22+, PostgreSQL 16 (Redis optional).

```bash
# 1. configuration
cp .env.example .env            # set POSTGRES_PASSWORD, N8N_INTERNAL_KEY, CARD_NUMBER, ...

# 2. database
createuser -P goalking          # password = POSTGRES_PASSWORD
createdb -O goalking goalking

# 3. backend
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # admin account (or: python manage.py make_admin <username>)
cd ..

# 4. frontend + run both
npm install
(cd frontend && npm install)
npm run dev:all                     # API on :8000, UI on http://localhost:5173
```

Alternatively, `docker compose up --build` starts PostgreSQL, Redis, Django, Celery worker/beat and Vite.

Background jobs (needs Redis, `USE_LOCMEM_CACHE=0`):

```bash
cd backend
celery -A config worker -l info
celery -A config beat -l info
```

## Tests

```bash
cd backend && python manage.py test        # needs a PostgreSQL user with CREATEDB
cd frontend && npm run lint && npm run build
```

## Admins

Admin rights come only from Django's `is_staff` / `is_superuser` flags:

```bash
python manage.py createsuperuser
python manage.py make_admin <username>            # grant
python manage.py make_admin <username> --revoke   # revoke
```

Admin UI: `/admin` in the SPA (payments with receipts, support replies, check editor, promo codes,
combinator candidates, stats) and Django admin at `/admin/` on the API host.

## n8n webhook

- `POST https://<api-host>/api/internal/packages/`
- Header `X-Internal-Key: <N8N_INTERNAL_KEY>`
- Body `{ "packages": [ ... ] }` (same format as the bot)

## API overview

All errors use `{"error": "...", "code": "...", "fields": {...}}`. Lists are paginated:
`{"count", "page", "page_size", "total_pages", "results"}` (`?page=`, `?page_size=` ≤ 100).

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/register/`, `/api/auth/token/`, `/api/auth/token/refresh/`, `/api/auth/logout/` | public (throttled) |
| GET/PATCH | `/api/me/` · POST `/api/auth/password/` | user |
| GET | `/api/summary/`, `/api/checks/catalog/`, `/api/games/`, `/api/games/<id>/`, `/api/vip/status/` | public |
| GET | `/api/checks/mine/`, `/api/status/` | user |
| GET/POST | `/api/payments/` (multipart: `package_key`, `receipt`) | user |
| POST | `/api/promo/redeem/` | user |
| GET/POST | `/api/support/` | user |
| GET | `/api/combinator/pool/` · POST `/api/combinator/search/` | VIP |
| POST | `/api/internal/packages/` | n8n key |
| GET/POST | `/api/admin/payments/` (`?status=pending|approved|rejected|all`), GET `/api/admin/payments/<id>/receipt/` | admin |
| GET/POST | `/api/admin/promo/` · GET `/api/admin/stats/` · GET/PATCH `/api/admin/checks/` | admin |
| GET/POST, GET/PATCH/DELETE | `/api/admin/candidates/`, `/api/admin/candidates/<id>/` | admin |
| GET, GET/PATCH | `/api/admin/support/` (`?state=unread|unanswered`), `/api/admin/support/<id>/` | admin |

`/api/games/` filters: `date`, `q`, `league`, `status=live|upcoming|finished`, `min_win_pct`, `sort=kickoff|form_diff`.

## Production deployment

```bash
cp .env.example .env
# set: DJANGO_DEBUG=0, DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS=<domain>, CSRF_TRUSTED_ORIGINS=https://<domain>,
#      POSTGRES_PASSWORD, N8N_INTERNAL_KEY, CARD_NUMBER, VIP_CHANNEL_LINK, API_FOOTBALL_KEY
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

The `web` service (nginx, port 80) serves the built SPA and proxies `/api`, `/admin`, `/health` to gunicorn.
Terminate TLS in front of it (load balancer / Caddy / Traefik) and forward `X-Forwarded-Proto: https`.
Uploaded receipts live in the `media` volume and are never publicly served; back up `pgdata` and `media`.
