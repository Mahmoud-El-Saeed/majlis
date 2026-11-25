from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url


def _with_driver(raw: str, driver: Literal["async", "sync"]) -> URL:
    """Retarget a URL at the driver family the caller needs.

    Heroku hands out bare `postgres://` URLs; dev/compose use explicit
    `postgresql+asyncpg://`. Migrations are sync (`psycopg`), the app is
    async (`asyncpg`), so each side asks for its own spelling.
    """
    url = make_url(raw)
    name = url.drivername
    if name == "postgres" or name.startswith("postgresql"):
        chosen = "asyncpg" if driver == "async" else "psycopg"
        return url.set(drivername=f"postgresql+{chosen}")
    if name.startswith("sqlite"):
        chosen = "aiosqlite" if driver == "async" else "pysqlite"
        return url.set(drivername=f"sqlite+{chosen}")
    return url


def _as_sslmode(value: str | tuple[str, ...]) -> str:
    """Translate SQLAlchemy's `ssl=true` spelling to a libpq sslmode.

    asyncpg treats `ssl=true` as `verify-full`; libpq has no boolean form.
    """
    raw = value[0] if isinstance(value, tuple) else value
    if not raw:
        return "require"
    mode = raw.lower()
    if mode in {"true", "1", "yes"}:
        return "verify-full"
    if mode in {"false", "0", "no"}:
        return "disable"
    return raw


def _with_tls(url: URL, *, key: str, other_key: str, required: bool) -> str:
    """Move the SSL query parameter to the spelling `key` names.

    asyncpg wants `ssl=`, psycopg wants `sslmode=`; neither accepts the
    other. `required` forces TLS when the URL is silent.
    """
    query = dict(url.query)
    other = query.pop(other_key, None)
    if other is not None and key not in query:
        query[key] = _as_sslmode(other)
    if required and key not in query:
        query[key] = "require"
    return url.set(query=query).render_as_string(hide_password=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Ticket 22 (ADR-0009): "prod" disables /docs, /redoc and /openapi.json —
    # the interactive route map is a development surface only. Compose sets
    # APP_ENV=prod; everything else (tests, local uvicorn) stays "dev".
    APP_ENV: Literal["dev", "prod"] = "dev"

    DATABASE_URL: str = "postgresql+asyncpg://majlis:majlis@localhost:5432/majlis"
    # Ticket 25: Heroku Postgres requires TLS. The URL may arrive as bare
    # `postgres://` with `sslmode=require`; database_url() rewrites both into
    # asyncpg's `ssl=require`, sync_database_url() keeps psycopg's spelling.
    DATABASE_SSL_REQUIRED: bool = False
    # Essential-0 caps the whole database at 20 connections; 4 + 2 overflow
    # per process leaves room for the release dyno and one-off runs.
    DB_POOL_SIZE: int = 4
    DB_MAX_OVERFLOW: int = 2
    DB_POOL_RECYCLE_SEC: int = 1800
    REDIS_URL: str = "redis://localhost:6379/0"
    # Ticket 25: Heroku Key-Value Store terminates TLS with a self-signed
    # certificate; redis-py verifies by default, so `none` is required there.
    REDIS_SSL_CERT_REQS: Literal["required", "none"] = "required"
    # Fail fast instead of hanging a login when the store is unreachable:
    # the limiter's memory fallback takes over after half a second.
    REDIS_CONNECT_TIMEOUT_SEC: float = 0.5
    REDIS_SOCKET_TIMEOUT_SEC: float = 0.5
    SECRET_KEY: str = "dev-only-insecure-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24
    RESET_TOKEN_EXPIRE_HOURS: int = 1
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_FROM: str = "Majlis <no-reply@majlis.local>"
    # Ticket 28: `none` keeps dev Mailpit plaintext; `starttls` upgrades a
    # plaintext connection before authentication (Resend on 587); `ssl` is
    # implicit TLS from the first packet (Resend on 465). Credentials are
    # refused unless a TLS mode is selected.
    SMTP_TLS: Literal["none", "starttls", "ssl"] = "none"
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    FRONTEND_URL: str = "http://localhost:8080"
    # Ticket 25: extra browser origins the API answers with CORS, comma
    # separated (Pages aliases, staging hosts). FRONTEND_URL is always
    # included; `cors_origins()` normalises trailing slashes and dedupes.
    CORS_ORIGINS: str = ""
    RATE_LIMIT_SIGNUP_PER_MIN: int = 10
    RATE_LIMIT_LOGIN_PER_MIN: int = 10
    RATE_LIMIT_RESET_PER_MIN: int = 5
    RATE_LIMIT_INVITE_PER_MIN: int = 10
    RATE_LIMIT_JOIN_PER_MIN: int = 10
    # Ticket 22/25: where the limiter reads the client address.
    #   peer             - raw TCP peer; direct dev access (legacy: with
    #                      RATE_LIMIT_TRUSTED_PROXIES > 0 it still walks XFF)
    #   xff_trusted_walk - drop the rightmost N trusted proxies (compose:
    #                      Cloudflare then nginx append on the right)
    #   xff_rightmost    - take the rightmost XFF entry (Heroku's router
    #                      appends the address it saw, client prefixes forged)
    RATE_LIMIT_CLIENT_IP_SOURCE: Literal["peer", "xff_trusted_walk", "xff_rightmost"] = "peer"
    # Ticket 22: number of trusted reverse proxies in front of the API.
    # 0 (default, dev/direct) = key buckets on the raw TCP peer. N > 0 = the
    # rightmost N entries of X-Forwarded-For are trusted proxies; the bucket
    # keys on the rightmost entry BEFORE them, so one client's exhausted
    # bucket never denies another client behind the same proxy.
    RATE_LIMIT_TRUSTED_PROXIES: int = 0
    INVITE_TOKEN_EXPIRE_HOURS: int = 72
    CODE_DEFAULT_LENGTH: int = 8
    CODE_DEFAULT_EXPIRE_DAYS: int = 7
    CODE_DEFAULT_MAX_USES: int = 50
    CODE_MAX_ACTIVE_PER_COURSE: int = 5
    S3_ENDPOINT_URL: str | None = None
    S3_REGION: str = "auto"
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    # The single R2 bucket shared by dev and production (ticket 25 created it
    # as `majlis`; ADR-0012 records the CORS policy applied to it).
    S3_BUCKET: str = "majlis"
    S3_UPLOAD_EXPIRE_SEC: int = 900
    S3_PLAY_EXPIRE_SEC: int = 3600
    # Ticket 16: per-file cap for attachments (lesson audio stays uncapped;
    # R2 budget is its cap). Enforced at confirm via HeadObject size.
    ATTACHMENT_MAX_FILE_BYTES: int = 100 * 1024 * 1024
    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None

    def smtp_credentials(self) -> tuple[str, str] | None:
        """Credentials for SMTP auth, or None when the relay is unauthenticated.

        Half a credential pair is a configuration error, not an anonymous
        connection: failing here keeps a half-set Resend key from silently
        sending nothing at all.
        """
        username = (self.SMTP_USERNAME or "").strip()
        password = self.SMTP_PASSWORD or ""
        if not username and not password:
            return None
        if not username or not password:
            raise ValueError("SMTP_USERNAME and SMTP_PASSWORD must be set together.")
        return username, password

    def cors_origins(self) -> list[str]:
        """Browser origins allowed by CORS; order preserved, duplicates gone."""
        raw = [self.FRONTEND_URL, *self.CORS_ORIGINS.split(",")]
        origins: list[str] = []
        for item in raw:
            origin = item.strip().rstrip("/")
            if origin and origin not in origins:
                origins.append(origin)
        return origins

    def database_url(self) -> str:
        """Async URL for the app: bare postgres:// works, sslmode -> ssl.

        SQLAlchemy passes query parameters straight to `asyncpg.connect`,
        which has no `sslmode` keyword and raises TypeError on it.
        """
        return _with_tls(
            _with_driver(self.DATABASE_URL, "async"),
            key="ssl",
            other_key="sslmode",
            required=self.DATABASE_SSL_REQUIRED,
        )

    def sync_database_url(self) -> str:
        """Sync URL for Alembic: psycopg wants `sslmode`, not asyncpg's `ssl`."""
        return _with_tls(
            _with_driver(self.DATABASE_URL, "sync"),
            key="sslmode",
            other_key="ssl",
            required=self.DATABASE_SSL_REQUIRED,
        )

    def redis_kwargs(self) -> dict[str, object]:
        """Keywords shared by every Redis client: fast failure + TLS policy."""
        kwargs: dict[str, object] = {
            "socket_connect_timeout": self.REDIS_CONNECT_TIMEOUT_SEC,
            "socket_timeout": self.REDIS_SOCKET_TIMEOUT_SEC,
        }
        if self.REDIS_URL.startswith("rediss://"):
            verify = self.REDIS_SSL_CERT_REQS != "none"
            kwargs["ssl_cert_reqs"] = self.REDIS_SSL_CERT_REQS
            kwargs["ssl_check_hostname"] = verify
        return kwargs


def get_settings() -> Settings:
    return Settings()
