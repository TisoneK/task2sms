from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class SMSResult:
    def __init__(self, success: bool, message_id: Optional[str] = None,
                 response: Optional[Dict] = None, error: Optional[str] = None,
                 status_code: Optional[int] = None):
        self.success = success
        self.message_id = message_id
        self.response = response or {}
        self.error = error
        self.status_code = status_code  # raw AT statusCode, passed to frontend


class SMSProvider(ABC):
    @abstractmethod
    async def send(self, to: str, message: str) -> SMSResult:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass


# Africa's Talking statusCode reference (from official API docs):
# SUCCESS — message was accepted and will be / has been delivered:
#   100 = Waiting to be delivered (queued — counts as SENT)
#   101 = Sent to carrier
# FAILURE — message was rejected:
#   102 = Invalid phone number
#   103 = Low account balance
#   104 = Unsupported number type
#   105 = Invalid Sender ID / Unable to process request
#   106 = Invalid number
#   401 = Risk Hold
#   402 = Invalid senderId for this account
#   403 = Invalid phone number
#   404 = Subscriber absent
#   405 = Insufficient balance
#   406 = User In Blacklist (DND)
#   407 = Could Not Route
#   409 = Do Not Disturb
#   500 = Internal Server Error
#   501 = Rejected

AT_SUCCESS_CODES = {100, 101}

AT_STATUS_MAP = {
    100: {"label": "Queued",                  "success": True,  "solution": None},
    101: {"label": "Sent",                     "success": True,  "solution": None},
    102: {"label": "Invalid Phone Number",     "success": False, "solution": "Check the number is in international format, e.g. +254712345678."},
    103: {"label": "Low Account Balance",      "success": False, "solution": "Top up your Africa's Talking account at account.africastalking.com."},
    104: {"label": "Unsupported Number Type",  "success": False, "solution": "This number type cannot receive SMS via this route."},
    105: {"label": "Invalid Sender ID",        "success": False, "solution": "Your Sender ID may not be approved. Try sending without a Sender ID."},
    106: {"label": "Invalid Number",           "success": False, "solution": "Check the phone number and try again."},
    401: {"label": "Risk Hold",                "success": False, "solution": "Your account has been flagged for review. Contact Africa's Talking support."},
    402: {"label": "Invalid Sender ID",        "success": False, "solution": "This Sender ID is not approved for your account."},
    403: {"label": "Invalid Phone Number",     "success": False, "solution": "The number could not be validated. Check the format."},
    404: {"label": "Subscriber Absent",        "success": False, "solution": "The subscriber's phone is off or out of coverage. Try again later."},
    405: {"label": "Insufficient Balance",     "success": False, "solution": "Top up your Africa's Talking account at account.africastalking.com."},
    406: {"label": "Number Blacklisted / DND", "success": False, "solution": "Recipient opted out of SMS. Safaricom: dial *456*9*5*1#. Airtel: dial *321#. Telkom: dial *456#."},
    407: {"label": "Could Not Route",          "success": False, "solution": "Message could not be routed. Try again or contact Africa's Talking support."},
    409: {"label": "Do Not Disturb",           "success": False, "solution": "Recipient is on the DND registry. Safaricom: dial *456*9*5*1#. Airtel: dial *321#."},
    500: {"label": "Internal Server Error",    "success": False, "solution": "Africa's Talking internal error. Try again in a few minutes."},
    501: {"label": "Rejected",                 "success": False, "solution": "Message was rejected. Contact Africa's Talking support if this persists."},
}


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

            logger.info(f"AT SMS → {to} | sender={kwargs.get('senderId', 'none')} | user={settings.AT_USERNAME}")

            response = await loop.run_in_executor(None, lambda: self._sms.send(**kwargs))

            logger.info(f"AT raw response: {response}")

            recipients = response.get("SMSMessageData", {}).get("Recipients", [])
            if not recipients:
                logger.error(f"AT: no recipients in response for {to}")
                return SMSResult(False, error="No recipients in response", response=response)

            r = recipients[0]
            status_code = r.get("statusCode")   # integer from AT SDK
            status_text = r.get("status", "")   # human string from AT SDK
            message_id  = r.get("messageId")

            info = AT_STATUS_MAP.get(status_code)

            if info:
                is_success = info["success"]
                label      = info["label"]
                solution   = info["solution"]
            else:
                # Unknown code — fall back to the text status field
                is_success = status_text.lower() in ("success", "sent", "waiting to be delivered")
                label      = status_text or f"Unknown (code {status_code})"
                solution   = None

            logger.info(f"AT result for {to}: code={status_code} text='{status_text}' success={is_success}")

            if is_success:
                return SMSResult(True, message_id=message_id, response=response, status_code=status_code)
            else:
                error_msg = label
                if solution:
                    error_msg = f"{label}: {solution}"
                return SMSResult(False, error=error_msg, response=response, status_code=status_code)

        except Exception as e:
            logger.error(f"AT exception for {to}: {e}")
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
