"""Ticket 28: production SMTP transport.

The seam is `send_email` talking to an SMTP server. The fake server below
models the one rule that matters: it only accepts credentials after TLS has
been negotiated, and it rejects authentication on a plaintext connection.
"""

import smtplib
import ssl
from email import message_from_bytes, policy

import pytest

from app.core import mail as mail_module
from app.core.config import Settings

SUBJECT = "تفعيل حساب مجلس"
BODY = "السلام عليكم ورحمة الله وبركاته،\nفعّل حسابك عبر هذا الرابط:\n\n\nhttps://majlis.elsaeed.dev/verify?token=abc\n"


class RecordingSMTP:
    """An SMTP server that refuses credentials until STARTTLS succeeded."""

    def __init__(self, host: str, port: int, timeout: float | None = None, context=None):  # noqa: ANN001
        self.host = host
        self.port = port
        self.timeout = timeout
        self.context = context
        self.tls_context: ssl.SSLContext | None = None
        self.auth: tuple[str, str] | None = None
        self.sent = None
        self.closed = False
        self.starttls_error: Exception | None = None
        self.send_error: Exception | None = None

    def __enter__(self) -> RecordingSMTP:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.closed = True

    def starttls(self, context=None) -> None:  # noqa: ANN001
        if self.starttls_error is not None:
            raise self.starttls_error
        self.tls_context = context

    def login(self, username: str, password: str) -> None:
        # Mirrors a real relay: AUTH before TLS is a protocol error, not a
        # quiet downgrade. If the client tries it, the test must fail.
        if self.tls_context is None:
            raise AssertionError("credentials offered on a plaintext connection")
        self.auth = (username, password)

    def send_message(self, msg) -> None:  # noqa: ANN001
        if self.send_error is not None:
            raise self.send_error
        self.sent = msg


class RecordingSMTPSSL(RecordingSMTP):
    """Implicit TLS: the transport is protected before the first command."""

    def __init__(self, host: str, port: int, timeout: float | None = None, context=None):  # noqa: ANN001
        super().__init__(host, port, timeout=timeout, context=context)
        self.tls_context = context


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "SMTP_HOST": "smtp.resend.com",
        "SMTP_PORT": 587,
        "SMTP_FROM": "Majlis <no-reply@majlis.elsaeed.dev>",
        "SMTP_TLS": "starttls",
        "SMTP_USERNAME": "resend",
        "SMTP_PASSWORD": "re_key",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def smtp(monkeypatch: pytest.MonkeyPatch) -> list[RecordingSMTP]:
    """Capture every connection the transport opens, plain or implicit TLS."""
    created: list[RecordingSMTP] = []

    def plain(host: str, port: int, timeout: float | None = None, context=None):  # noqa: ANN001
        client = RecordingSMTP(host, port, timeout=timeout, context=context)
        created.append(client)
        return client

    def implicit(host: str, port: int, timeout: float | None = None, context=None):  # noqa: ANN001
        client = RecordingSMTPSSL(host, port, timeout=timeout, context=context)
        created.append(client)
        return client

    monkeypatch.setattr(mail_module.smtplib, "SMTP", plain)
    monkeypatch.setattr(mail_module.smtplib, "SMTP_SSL", implicit)
    monkeypatch.setattr(mail_module, "settings", _settings())
    return created


def test_starttls_authenticates_before_sending(smtp: list[RecordingSMTP]) -> None:
    mail_module.send_email("student@example.com", SUBJECT, BODY)

    client = smtp[0]
    assert client.auth == ("resend", "re_key")
    assert client.sent is not None
    assert client.closed
    assert client.tls_context is not None
    assert client.tls_context.verify_mode == ssl.CERT_REQUIRED
    assert client.tls_context.check_hostname is True


def test_credentials_without_tls_are_refused_before_connecting(
    smtp: list[RecordingSMTP], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(mail_module, "settings", _settings(SMTP_TLS="none"))

    with pytest.raises(RuntimeError, match="plaintext"):
        mail_module.send_email("student@example.com", SUBJECT, BODY)

    assert smtp == []


def test_implicit_tls_authenticates_from_the_first_packet(
    smtp: list[RecordingSMTP], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(mail_module, "settings", _settings(SMTP_TLS="ssl", SMTP_PORT=465))

    mail_module.send_email("student@example.com", SUBJECT, BODY)

    client = smtp[0]
    assert isinstance(client, RecordingSMTPSSL)
    assert client.auth == ("resend", "re_key")
    assert client.tls_context is not None
    assert client.tls_context.verify_mode == ssl.CERT_REQUIRED
    assert client.sent is not None


def test_starttls_failure_never_offers_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = RecordingSMTP("smtp.resend.com", 587)
    client.starttls_error = smtplib.SMTPNotSupportedError("STARTTLS not advertised")
    monkeypatch.setattr(mail_module.smtplib, "SMTP", lambda *_args, **_kwargs: client)
    monkeypatch.setattr(mail_module, "settings", _settings())

    with pytest.raises(smtplib.SMTPNotSupportedError):
        mail_module.send_email("student@example.com", SUBJECT, BODY)

    assert client.auth is None
    assert client.sent is None


def test_smtp_failure_propagates_to_the_caller(monkeypatch: pytest.MonkeyPatch) -> None:
    client = RecordingSMTP("smtp.resend.com", 587)
    client.send_error = smtplib.SMTPDataError(550, "message rejected")
    monkeypatch.setattr(mail_module.smtplib, "SMTP", lambda *_args, **_kwargs: client)
    monkeypatch.setattr(mail_module, "settings", _settings())

    with pytest.raises(smtplib.SMTPDataError):
        mail_module.send_email("student@example.com", SUBJECT, BODY)


def test_local_mailpit_sends_without_tls_or_auth(
    smtp: list[RecordingSMTP], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        mail_module,
        "settings",
        _settings(
            SMTP_HOST="localhost",
            SMTP_PORT=1025,
            SMTP_FROM="Majlis <no-reply@majlis.local>",
            SMTP_TLS="none",
            SMTP_USERNAME=None,
            SMTP_PASSWORD=None,
        ),
    )

    mail_module.send_email("student@example.com", SUBJECT, BODY)

    client = smtp[0]
    assert (client.host, client.port) == ("localhost", 1025)
    assert client.tls_context is None
    assert client.auth is None
    assert client.sent is not None


def test_message_carries_arabic_subject_and_body_from_the_verified_sender(
    smtp: list[RecordingSMTP],
) -> None:
    mail_module.send_email("student@example.com", SUBJECT, BODY)

    raw = smtp[0].sent.as_bytes(policy=policy.SMTP)
    parsed = message_from_bytes(raw, policy=policy.default)
    assert str(parsed["From"]) == "Majlis <no-reply@majlis.elsaeed.dev>"
    assert parsed["To"] == "student@example.com"
    assert str(parsed["Subject"]) == SUBJECT
    assert parsed.get_content_type() == "text/plain"
    assert parsed.get_content_charset() == "utf-8"
    assert parsed.get_content() == BODY
    assert b"=?utf-8?" in raw
    assert "@majlis.elsaeed.dev>" in str(parsed["Message-ID"])
