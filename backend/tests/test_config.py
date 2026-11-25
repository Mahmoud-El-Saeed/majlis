"""Ticket 25: production (Heroku) URL, CORS and pool configuration.

Heroku hands the app a bare `postgres://` URL with `sslmode`, a `rediss://`
Key-Value Store with a self-signed certificate, and no reverse proxy of its
own. asyncpg rejects `sslmode` (it wants `ssl=`), psycopg/Alembic wants the
opposite spelling, and redis-py verifies certificates by default. These
tests pin the translation layer in one place — Settings — so app and
migrations cannot drift apart.
"""

import pytest
from pydantic import ValidationError
from sqlalchemy.engine import make_url

from app.core.config import Settings


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)


def test_production_defaults_keep_compose_and_dev_unchanged() -> None:
    settings = _settings()

    assert settings.RATE_LIMIT_CLIENT_IP_SOURCE == "peer"
    assert settings.DATABASE_SSL_REQUIRED is False
    assert settings.REDIS_SSL_CERT_REQS == "required"
    assert settings.DB_POOL_SIZE == 4
    assert settings.DB_MAX_OVERFLOW == 2


def test_cors_origins_include_frontend_and_extras_deduplicated() -> None:
    settings = _settings(
        FRONTEND_URL="https://majlis.elsaeed.dev/",
        CORS_ORIGINS=" https://majlis-elsaeed.pages.dev/ , https://majlis.elsaeed.dev,,",
    )

    assert settings.cors_origins() == [
        "https://majlis.elsaeed.dev",
        "https://majlis-elsaeed.pages.dev",
    ]


def test_cors_origins_default_to_frontend_only() -> None:
    settings = _settings(FRONTEND_URL="http://localhost:8080")

    assert settings.cors_origins() == ["http://localhost:8080"]


def test_database_url_is_unchanged_without_heroku_ssl() -> None:
    settings = _settings(DATABASE_URL="postgresql+asyncpg://majlis:majlis@postgres:5432/majlis")

    assert settings.database_url() == "postgresql+asyncpg://majlis:majlis@postgres:5432/majlis"


def test_database_url_upgrades_heroku_scheme_and_translates_sslmode() -> None:
    settings = _settings(
        DATABASE_URL="postgres://user:pass@ec2-1-2-3-4.compute-1.amazonaws.com:5432/db?sslmode=require",
        DATABASE_SSL_REQUIRED=True,
    )

    url = make_url(settings.database_url())

    assert url.drivername == "postgresql+asyncpg"
    assert url.query["ssl"] == "require"
    assert "sslmode" not in url.query


def test_database_url_translates_sslmode_even_without_the_flag() -> None:
    """A hand-written `?sslmode=require` must not reach asyncpg as a kwarg."""
    settings = _settings(
        DATABASE_URL="postgresql+asyncpg://u:p@localhost/db?sslmode=require",
        DATABASE_SSL_REQUIRED=False,
    )

    url = make_url(settings.database_url())

    assert url.query["ssl"] == "require"
    assert "sslmode" not in url.query


def test_database_url_forces_ssl_when_flag_is_set_without_query() -> None:
    settings = _settings(
        DATABASE_URL="postgresql+asyncpg://u:p@localhost/db",
        DATABASE_SSL_REQUIRED=True,
    )

    assert make_url(settings.database_url()).query["ssl"] == "require"


def test_sync_database_url_targets_psycopg_and_keeps_sslmode() -> None:
    settings = _settings(
        DATABASE_URL="postgres://u:p@h:5432/db",
        DATABASE_SSL_REQUIRED=True,
    )

    url = make_url(settings.sync_database_url())

    assert url.drivername == "postgresql+psycopg"
    assert url.query["sslmode"] == "require"
    assert "ssl" not in url.query


def test_sync_database_url_leaves_non_ssl_urls_alone() -> None:
    settings = _settings(DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/majlis")

    assert settings.sync_database_url() == "postgresql+psycopg://u:p@localhost:5432/majlis"


def test_redis_kwargs_are_plain_without_tls() -> None:
    settings = _settings(REDIS_URL="redis://localhost:6379/0")

    kwargs = settings.redis_kwargs()

    assert kwargs == {"socket_connect_timeout": 0.5, "socket_timeout": 0.5}


def test_redis_kwargs_verify_tls_by_default() -> None:
    settings = _settings(REDIS_URL="rediss://user:pass@host:6379")

    kwargs = settings.redis_kwargs()

    assert kwargs["ssl_cert_reqs"] == "required"
    assert kwargs["ssl_check_hostname"] is True


def test_redis_kwargs_can_accept_heroku_self_signed_certificate() -> None:
    settings = _settings(REDIS_URL="rediss://user:pass@host:6379", REDIS_SSL_CERT_REQS="none")

    kwargs = settings.redis_kwargs()

    assert kwargs["ssl_cert_reqs"] == "none"
    assert kwargs["ssl_check_hostname"] is False


def test_database_engine_pool_fits_the_essential_zero_connection_ceiling() -> None:
    from app.core.database import build_engine

    engine = build_engine("postgresql+asyncpg://u:p@localhost:5432/db")

    assert engine.pool.size() == 4
    assert engine.pool._max_overflow == 2


def test_mail_defaults_keep_local_development_on_mailpit() -> None:
    settings = _settings()

    assert settings.SMTP_HOST == "localhost"
    assert settings.SMTP_PORT == 1025
    assert settings.SMTP_TLS == "none"
    assert settings.SMTP_FROM == "Majlis <no-reply@majlis.local>"
    assert settings.smtp_credentials() is None


def test_smtp_credentials_are_all_or_nothing() -> None:
    assert (
        _settings(SMTP_USERNAME="resend", SMTP_PASSWORD="re_key").smtp_credentials()
        == ("resend", "re_key")
    )
    with pytest.raises(ValueError, match="SMTP_USERNAME and SMTP_PASSWORD"):
        _settings(SMTP_USERNAME="resend").smtp_credentials()
    with pytest.raises(ValueError, match="SMTP_USERNAME and SMTP_PASSWORD"):
        _settings(SMTP_PASSWORD="re_key").smtp_credentials()


def test_smtp_tls_rejects_unknown_modes() -> None:
    with pytest.raises(ValidationError, match="SMTP_TLS"):
        _settings(SMTP_TLS="maybe")
