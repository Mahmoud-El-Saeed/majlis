"""Dev SMTP via Mailpit (ticket 01). Production SMTP lands in ticket 13.

Blocking smtplib is offloaded with asyncio.to_thread at call sites so the
async event loop never blocks. Backend messages stay English; the frontend
localizes them (default Arabic).
"""

import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

settings = get_settings()


def send_email(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=5) as s:
        s.send_message(msg)
