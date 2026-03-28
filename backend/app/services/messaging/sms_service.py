from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class SMSResult:
    def __init__(self, success: bool, message_id: Optional[str] = None,
                 response: Optional[Dict] = None, error: Optional[str] = None):
        self.success = success
        self.message_id = message_id
        self.response = response or {}
        self.error = error


class SMSProvider(ABC):
    @abstractmethod
    async def send(self, to: str, message: str) -> SMSResult:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass


class AfricasTalkingProvider(SMSProvider):
    def __init__(self):
        import africastalking
        africastalking.initialize(settings.AT_USERNAME, settings.AT_API_KEY)
        self._sms = africastalking.SMS

    @property
    def name(self) -> str:
        return "africastalking"

    async def send(self, to: str, message: str) -> SMSResult:
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            kwargs = {"message": message, "recipients": [to]}
            if settings.AT_SENDER_ID:
                kwargs["senderId"] = settings.AT_SENDER_ID
            response = await loop.run_in_executor(None, lambda: self._sms.send(**kwargs))
            recipients = response.get("SMSMessageData", {}).get("Recipients", [])
            if recipients:
                r = recipients[0]
                if r.get("statusCode") == 101:
                    return SMSResult(True, message_id=r.get("messageId"), response=response)
                return SMSResult(False, error=r.get("status"), response=response)
            return SMSResult(False, error="No recipients in response", response=response)
        except Exception as e:
            logger.error(f"Africa's Talking error: {e}")
            return SMSResult(False, error=str(e))


class TwilioProvider(SMSProvider):
    def __init__(self):
        from twilio.rest import Client
        self._client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    @property
    def name(self) -> str:
        return "twilio"

    async def send(self, to: str, message: str) -> SMSResult:
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            msg = await loop.run_in_executor(
                None,
                lambda: self._client.messages.create(
                    body=message, from_=settings.TWILIO_FROM_NUMBER, to=to
                )
            )
            success = msg.status not in ("failed", "undelivered")
            return SMSResult(success, message_id=msg.sid,
                             response={"status": msg.status, "sid": msg.sid},
                             error=msg.error_message if not success else None)
        except Exception as e:
            logger.error(f"Twilio error: {e}")
            return SMSResult(False, error=str(e))


class GSMModemProvider(SMSProvider):
    def __init__(self):
        import serial
        self._port = settings.GSM_PORT
        self._baudrate = settings.GSM_BAUDRATE

    @property
    def name(self) -> str:
        return "gsm"

    async def send(self, to: str, message: str) -> SMSResult:
        try:
            import asyncio, serial
            loop = asyncio.get_event_loop()

            def _send():
                with serial.Serial(self._port, self._baudrate, timeout=10) as ser:
                    ser.write(b'AT\r')
                    import time; time.sleep(0.5)
                    ser.write(b'AT+CMGF=1\r')
                    time.sleep(0.5)
                    ser.write(f'AT+CMGS="{to}"\r'.encode())
                    time.sleep(0.5)
                    ser.write(message.encode() + b'\x1A')
                    time.sleep(3)
                    return ser.read(ser.in_waiting).decode(errors='ignore')

            response = await loop.run_in_executor(None, _send)
            success = "+CMGS" in response
            return SMSResult(success, response={"raw": response},
                             error=None if success else "Modem did not confirm send")
        except Exception as e:
            logger.error(f"GSM Modem error: {e}")
            return SMSResult(False, error=str(e))


class MockProvider(SMSProvider):
    """Used in tests / sandbox mode"""
    @property
    def name(self) -> str:
        return "mock"

    async def send(self, to: str, message: str) -> SMSResult:
        logger.info(f"[MOCK SMS] To: {to} | Message: {message}")
        return SMSResult(True, message_id=f"mock-{to}-{id(message)}",
                         response={"status": "delivered"})


def get_provider(provider_name: Optional[str] = None) -> SMSProvider:
    name = (provider_name or settings.DEFAULT_SMS_PROVIDER).lower()
    try:
        if name == "africastalking":
            return AfricasTalkingProvider()
        elif name == "twilio":
            return TwilioProvider()
        elif name == "gsm":
            return GSMModemProvider()
        else:
            logger.warning(f"Unknown provider '{name}', falling back to mock")
            return MockProvider()
    except Exception as e:
        logger.error(f"Failed to init provider '{name}': {e}. Falling back to mock.")
        return MockProvider()
