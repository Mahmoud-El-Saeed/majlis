"""Dev SMTP via Mailpit (ticket 01). Production SMTP lands in ticket 13."""

import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

settings = get_settings()

# In-memory outbox for tests (fake at seam boundary).
OUTBOX: list[dict] = []


def send_email(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=5) as s:
        s.send_message(msg)


def queue_email(to: str, subject: str, body: str) -> None:
    """Test seam: record instead of sending."""
    OUTBOX.append({"to": to, "subject": subject, "body": body})
