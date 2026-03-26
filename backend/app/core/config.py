from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Task2SMS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    DATABASE_URL: str = "sqlite+aiosqlite:///./task2sms.db"

    # Africa's Talking
    AT_USERNAME: str = "sandbox"
    AT_API_KEY: str = ""
    AT_SENDER_ID: Optional[str] = None

    # Twilio (SMS + WhatsApp)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # WhatsApp
    WHATSAPP_PROVIDER: str = "twilio"
    WHATSAPP_FROM: str = "whatsapp:+14155238886"

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_DEFAULT_PARSE_MODE: str = "HTML"

    # GSM Modem
    GSM_PORT: str = "/dev/ttyUSB0"
    GSM_BAUDRATE: int = 115200

    DEFAULT_SMS_PROVIDER: str = "africastalking"
    FRONTEND_URL: str = "http://localhost:5173"

    # Email / SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@task2sms.com"
    SMTP_FROM_NAME: str = "Task2SMS"

    # Webhooks
    WEBHOOK_SECRET: str = "change-me-webhook-secret"

    DEFAULT_ROLE: str = "member"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
