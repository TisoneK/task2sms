import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from jinja2 import Environment, BaseLoader
from typing import Optional, List
from app.core.config import settings
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.email_notification import EmailNotification, EmailStatus
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

# Inline Jinja2 env for rendering templates
_jinja = Environment(loader=BaseLoader())

BASE_HTML = """
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background:#f9fafb; margin:0; padding:24px; }
  .card { background:#fff; border-radius:12px; padding:32px; max-width:520px; margin:0 auto; border:1px solid #e5e7eb; }
  h2 { color:#111827; font-size:20px; margin:0 0 16px; }
  p  { color:#374151; font-size:15px; line-height:1.6; margin:0 0 12px; }
  .badge { display:inline-block; background:#eff6ff; color:#1d4ed8; border-radius:6px; padding:4px 10px; font-size:13px; font-weight:600; }
  .footer { text-align:center; margin-top:24px; color:#9ca3af; font-size:12px; }
</style></head>
<body>
  <div class="card">
    {{ content }}
    <div class="footer">Sent via Task2SMS</div>
  </div>
</body>
</html>
"""


def render_html(content: str) -> str:
    tmpl = _jinja.from_string(BASE_HTML)
    return tmpl.render(content=content)


def render_template(template: str, context: dict) -> str:
    try:
        return _jinja.from_string(template).render(**context)
    except Exception:
        return template


async def send_email(
    to_email: str,
    subject: str,
    body_html: str,
    body_text: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    """Send a single email. Returns (success, error)."""
    if not settings.SMTP_USERNAME:
        logger.warning("SMTP not configured — email not sent")
        return False, "SMTP not configured"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to_email

    if body_text:
        msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        return True, None
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return False, str(e)


async def send_and_log(
    db: AsyncSession,
    user_id: int,
    to_email: str,
    subject: str,
    body_html: str,
    body_text: Optional[str] = None,
    task_id: Optional[int] = None,
) -> EmailNotification:
    full_html = render_html(body_html)
    notif = EmailNotification(
        user_id=user_id,
        task_id=task_id,
        to_email=to_email,
        subject=subject,
        body_html=full_html,
        body_text=body_text,
        status=EmailStatus.PENDING,
    )
    db.add(notif)
    await db.flush()

    success, error = await send_email(to_email, subject, full_html, body_text)
    notif.status = EmailStatus.SENT if success else EmailStatus.FAILED
    notif.error_message = error
    if success:
        notif.sent_at = datetime.now(timezone.utc)

    await db.commit()
    return notif


async def send_task_notification_email(
    db: AsyncSession,
    user_id: int,
    to_emails: List[str],
    subject: str,
    message: str,
    task_id: Optional[int] = None,
):
    """Send email to multiple recipients for a task."""
    content = f"<h2>{subject}</h2><p>{message}</p>"
    for email in to_emails:
        await send_and_log(
            db, user_id, email, subject, content,
            body_text=message, task_id=task_id
        )
