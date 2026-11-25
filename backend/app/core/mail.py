"""Transactional SMTP: Mailpit in dev, Resend's SMTP relay in production (ticket 28).

Blocking smtplib is offloaded with asyncio.to_thread at call sites so the
async event loop never blocks. Backend messages stay English; the frontend
localizes them (default Arabic). Email bodies stay Arabic and are sent as
UTF-8 text; subjects are RFC 2047 encoded by the email package.

Credentials are only ever offered on a TLS-protected connection: an explicit
`starttls` upgrade (587) or implicit TLS (465). A credential pair with no TLS
mode is rejected before a socket is even opened.
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr

from app.core.config import get_settings

settings = get_settings()

# Bound the time a signup or invite request waits on a remote relay.
_TIMEOUT_SEC = 10

logger = logging.getLogger(__name__)


class MailTransportError(Exception):
    """The relay could not deliver a transactional email (internal signal)."""


def log_failure(kind: str, exc: BaseException) -> None:
    """Log a send failure without recipient addresses, tokens or message bodies.

    SMTP exceptions can carry the full recipient dict in their args, so the
    exception itself is never logged: only its (or its cause's) type name.
    """
    cause = exc.__cause__ or exc
    logger.error("Failed to send %s email: %s", kind, type(cause).__name__)


def _message(to: str, subject: str, body: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    _name, sender = parseaddr(settings.SMTP_FROM)
    msg["Message-ID"] = make_msgid(domain=sender.partition("@")[2] or None)
    # Arabic is non-ASCII: base64 keeps every byte intact through any relay.
    msg.set_content(body, cte="base64")
    return msg


def send_email(to: str, subject: str, body: str) -> None:
    creds = settings.smtp_credentials()
    if creds and settings.SMTP_TLS == "none":
        raise RuntimeError("Refusing to send SMTP credentials over a plaintext connection.")

    msg = _message(to, subject, body)
    context = ssl.create_default_context()
    if settings.SMTP_TLS == "ssl":
        client = smtplib.SMTP_SSL(
            settings.SMTP_HOST, settings.SMTP_PORT, timeout=_TIMEOUT_SEC, context=context
        )
    else:
        client = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=_TIMEOUT_SEC)
    with client as s:
        if settings.SMTP_TLS == "starttls":
            s.starttls(context=context)
        if creds:
            s.login(*creds)
        s.send_message(msg)
