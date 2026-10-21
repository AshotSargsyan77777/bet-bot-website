# Goalking Web (React + Django)

Веб-версия логики Telegram-бота [`index.js`](index.js): чеки из n8n, оплата по карте, промо, VIP, матчи (API-Football, форма L5), конструктор комбинаций по целевому коэффициенту.

## Быстрый старт (локально)

**Важно:** фронтенд один не работает — нужен Django на порту **8000**. Иначе будет `Bad Gateway` при входе/регистрации.

### Один командой (рекомендуется)

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
cd ..
npm install
cd frontend && npm install && cd ..
npm run dev:all
```

Откройте http://localhost:5173

### Или два терминала

**Терминал 1 — API:**

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

**Терминал 2 — UI:**

```bash
cd frontend
npm install
npm run dev
```

Проверка API: http://127.0.0.1:8000/health/ → `OK`

### Docker (PostgreSQL + Redis)

```bash
docker compose up --build
```

## n8n

Перенаправьте webhook с Express-бота на Django:

- **Было:** `POST https://<bot-host>/internal/packages`
- **Стало:** `POST https://<api-host>/api/internal/packages/`
- Заголовок: `X-Internal-Key: <N8N_INTERNAL_KEY>`
- Тело: `{ "packages": [ ... ] }` (без изменений)

## Admin

Пользователь считается админом, если `is_staff` / `is_superuser` или email в `ADMIN_EMAILS`.

Панель: `/admin` (Django) и `/admin` в SPA (очередь платежей, промо, статистика).

## API (кратко)

| Endpoint | Описание |
|----------|----------|
| `GET /api/checks/catalog/` | Пакеты и цены |
| `POST /api/internal/packages/` | n8n webhook |
| `GET /api/games/` | Матчи + L5 фильтры |
| `POST /api/combinator/search/` | Поиск комбинаций |

## Celery (опционально)

```bash
cd backend
celery -A config worker -l info
celery -A config beat -l info
```

Задача `sync_fixtures_for_date` обновляет кэш матчей (нужен `API_FOOTBALL_KEY`).
