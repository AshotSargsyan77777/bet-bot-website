import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, "1" if default else "0").strip().lower() in ("1", "true", "yes", "on")


def env_list(name: str, default: str = "") -> list[str]:
    return [x.strip() for x in os.environ.get(name, default).split(",") if x.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG=0")
    SECRET_KEY = "dev-insecure-change-me"

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "")

# Railway: its public domain and health checker are trusted automatically.
RAILWAY_PUBLIC_DOMAIN = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
if RAILWAY_PUBLIC_DOMAIN:
    ALLOWED_HOSTS += [RAILWAY_PUBLIC_DOMAIN]
    CSRF_TRUSTED_ORIGINS += [f"https://{RAILWAY_PUBLIC_DOMAIN}"]
if os.environ.get("RAILWAY_ENVIRONMENT"):
    ALLOWED_HOSTS += ["healthcheck.railway.app"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "apps.accounts",
    "apps.checks",
    "apps.commerce",
    "apps.games",
    "apps.combinator",
    "apps.support",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# PostgreSQL is the default database. USE_SQLITE=1 is a convenience for quick local experiments only.
# DATABASE_URL (e.g. provided by Railway) takes precedence over the POSTGRES_* variables.
DATABASE_URL = os.environ.get("DATABASE_URL", "")
if DATABASE_URL:
    from urllib.parse import unquote, urlparse

    _db = urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _db.path.lstrip("/"),
            "USER": unquote(_db.username or ""),
            "PASSWORD": unquote(_db.password or ""),
            "HOST": _db.hostname or "",
            "PORT": str(_db.port or 5432),
            "CONN_MAX_AGE": int(os.environ.get("POSTGRES_CONN_MAX_AGE", "60")),
        }
    }
elif env_bool("USE_SQLITE", False):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "goalking"),
            "USER": os.environ.get("POSTGRES_USER", "goalking"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": int(os.environ.get("POSTGRES_CONN_MAX_AGE", "60")),
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Yerevan"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
# Built React app (frontend/dist). When present, Django serves it at "/" (single-service deployment).
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", BASE_DIR / "frontend_dist"))
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.is_dir() else None
MEDIA_URL = "media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BASE_DIR / "media"))

# Payment receipts are private: they are only served to admins through the API.
RECEIPT_MAX_BYTES = int(os.environ.get("RECEIPT_MAX_MB", "5")) * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = RECEIPT_MAX_BYTES + 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2_621_440

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env_list("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
CORS_ALLOW_CREDENTIALS = False

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("THROTTLE_ANON", "600/hour"),
        "user": os.environ.get("THROTTLE_USER", "3000/hour"),
        "auth": os.environ.get("THROTTLE_AUTH", "20/minute"),
        "promo": os.environ.get("THROTTLE_PROMO", "10/minute"),
        "support": os.environ.get("THROTTLE_SUPPORT", "20/hour"),
        "combinator": os.environ.get("THROTTLE_COMBINATOR", "30/hour"),
    },
}
if DEBUG:
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] += ("rest_framework.renderers.BrowsableAPIRenderer",)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", "14"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_TIMEZONE = TIME_ZONE

if env_bool("USE_LOCMEM_CACHE", False):
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": os.environ.get("REDIS_URL", "redis://localhost:6379/1"),
        }
    }

# Production hardening (only when DEBUG is off)
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SECURE_REDIRECT_EXEMPT = [r"^health/$"]
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    X_FRAME_OPTIONS = "DENY"

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "default"},
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}

# Goalking business config
N8N_INTERNAL_KEY = os.environ.get("N8N_INTERNAL_KEY", "")
CARD_NUMBER = os.environ.get("CARD_NUMBER", "")
VIP_CHANNEL_LINK = os.environ.get("VIP_CHANNEL_LINK", "")
PROMO_FROM_3X = env_bool("PROMO_FROM_3X", False)
PROMOS_PER_UPDATE = max(0, int(os.environ.get("PROMOS_PER_UPDATE", "1")))
API_FOOTBALL_KEY = os.environ.get("API_FOOTBALL_KEY", "")
# Telegram (same bot as index.js): Login Widget + notifications
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.environ.get("TELEGRAM_BOT_USERNAME", "").lstrip("@")
TELEGRAM_ASYNC = env_bool("TELEGRAM_ASYNC", True)
SITE_URL = os.environ.get("SITE_URL", "") or (f"https://{RAILWAY_PUBLIC_DOMAIN}" if RAILWAY_PUBLIC_DOMAIN else "")
# Leagues shown on the site (same as the bot / n8n workflow): top 5, UCL, UEL, UECL, World Cup, Euro, Nations League.
# Order = order in the league filter. Empty = all leagues.
GAMES_LEAGUE_IDS = [int(x) for x in env_list("GAMES_LEAGUE_IDS", "39,140,135,78,61,2,3,848,1,4,5")]
# How long computed team form (last N matches) is reused before re-fetching from API-Football.
FORM_STATS_TTL_MINUTES = int(os.environ.get("FORM_STATS_TTL_MINUTES", "360"))
# How often today's fixtures (live scores, statuses) are re-fetched when someone opens the games page
FIXTURE_REFRESH_MINUTES = int(os.environ.get("FIXTURE_REFRESH_MINUTES", "30"))

CELERY_BEAT_SCHEDULE = {
    "sync-today-fixtures": {
        "task": "apps.games.tasks.sync_fixtures_for_date",
        "schedule": float(os.environ.get("FIXTURE_SYNC_SECONDS", "300")),
    },
    "compute-today-form": {
        "task": "apps.games.tasks.compute_form_for_date",
        "schedule": float(os.environ.get("FORM_COMPUTE_SECONDS", "900")),
        "kwargs": {"limit": int(os.environ.get("FORM_COMPUTE_LIMIT", "40"))},
    },
}

DISCLAIMER = (
    "\n\n⚠️ Ուշադրություն. Մենք պատասխանատվություն չենք կրում չեկերի արդյունքների համար: "
    "Խաղադրույք կատարեք սեփական պատասխանատվությամբ:"
)
