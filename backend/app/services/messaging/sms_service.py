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
            if settings.AT_SENDER_ID and settings.AT_SENDER_ID.strip():
                kwargs["senderId"] = settings.AT_SENDER_ID
            
            # Enhanced logging - Request details
            logger.info(f"🔄 Africa's Talking API Request:")
            logger.info(f"   Recipient: {to}")
            logger.info(f"   Message: {message}")
            logger.info(f"   Sender ID: {kwargs.get('senderId', 'None')}")
            logger.info(f"   Username: {settings.AT_USERNAME}")
            
            response = await loop.run_in_executor(None, lambda: self._sms.send(**kwargs))
            
            # Enhanced logging - Full response
            logger.info(f"📥 Africa's Talking API Response:")
            logger.info(f"   Full Response: {response}")
            
            recipients = response.get("SMSMessageData", {}).get("Recipients", [])
            if recipients:
                r = recipients[0]
                status_code = r.get("statusCode")
                status = r.get("status")
                message_id = r.get("messageId")
                
                # Enhanced logging - Recipient details
                logger.info(f"📊 Recipient Details:")
                logger.info(f"   Status Code: {status_code}")
                logger.info(f"   Status: {status}")
                logger.info(f"   Message ID: {message_id}")
                
                # Enhanced status code interpretation with user-friendly messages
                status_meanings = {
                    101: {"status": "Success", "message": "Message sent successfully"},
                    100: {"status": "Pending", "message": "Message queued for delivery"},
                    102: {"status": "Invalid Number", "message": "Invalid phone number format"},
                    103: {"status": "Insufficient Balance", "message": "Account balance too low"},
                    104: {"status": "Invalid Sender ID", "message": "Sender ID not approved"},
                    105: {"status": "Generic Error", "message": "Contact support"},
                    106: {"status": "Service Unavailable", "message": "Service temporarily unavailable"},
                    406: {"status": "Blacklisted/DND", "message": "Number in DND registry - dial *456*9*5*1# to enable"}
                }
                
                if status_code in status_meanings:
                    status_info = status_meanings[status_code]
                    logger.info(f"   Status: {status_info['status']}")
                    logger.info(f"   Message: {status_info['message']}")
                
                if status_code == 101:
                    logger.info(f"✅ SMS sent successfully to {to}")
                    return SMSResult(True, message_id=message_id, response=response)
                else:
                    # Get user-friendly error message
                    error_message = status_meanings.get(status_code, {}).get('message', f"Unknown error (code: {status_code})")
                    status_label = status_meanings.get(status_code, {}).get('status', 'Unknown')
                    logger.error(f"❌ SMS failed to {to} - {status_label}: {error_message}")
                    return SMSResult(False, error=f"{status_label}: {error_message}", response=response)
            
            logger.error(f"❌ No recipients in response for {to}")
            return SMSResult(False, error="No recipients in response", response=response)
            
        except Exception as e:
            logger.error(f"💥 Africa's Talking exception for {to}: {e}")
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
