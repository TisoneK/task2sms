#!/usr/bin/env python3
"""
SMS Debug Script for Task2SMS
Tests Africa's Talking SMS service with detailed logging and error analysis
"""

import asyncio
import sys
import os
import logging
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('sms_debug.log', mode='w')
    ]
)

logger = logging.getLogger(__name__)

async def main():
    """Main debug function for SMS service testing"""
    
    print("=" * 60)
    print("TASK2SMS - AFRICA'S TALKING SMS DEBUG SCRIPT")
    print("=" * 60)
    
    try:
        # Import after path setup
        from app.core.config import settings
        from app.services.messaging.sms_service import get_provider, AfricasTalkingProvider
        
        # 1. Configuration Validation
        print("\n🔍 CONFIGURATION VALIDATION")
        print("-" * 30)
        
        print(f"AT_USERNAME: {settings.AT_USERNAME}")
        print(f"AT_API_KEY: {'*' * len(settings.AT_API_KEY) if settings.AT_API_KEY else 'NOT SET'}")
        print(f"AT_SENDER_ID: {settings.AT_SENDER_ID}")
        print(f"DEFAULT_SMS_PROVIDER: {settings.DEFAULT_SMS_PROVIDER}")
        
        if not settings.AT_API_KEY:
            print("❌ ERROR: AT_API_KEY is not configured!")
            return
        
        # 2. Provider Initialization Test
        print("\n🔧 PROVIDER INITIALIZATION")
        print("-" * 30)
        
        try:
            provider = AfricasTalkingProvider()
            print("✅ Africa's Talking provider initialized successfully")
        except Exception as e:
            print(f"❌ ERROR initializing Africa's Talking provider: {e}")
            return
        
        # 3. Phone Number Validation & DND Check
        print("\n📱 PHONE NUMBER VALIDATION")
        print("-" * 30)
        
        test_phone = "+254741651008"  # The failing number
        validation = validate_kenyan_phone_number(test_phone)
        
        if validation["valid"]:
            print(f"   ✅ Valid Kenyan number")
            print(f"   📡 Carrier: {validation['carrier']}")
            print(f"   📝 Format: {validation['format']}")
            print(f"   🔄 Normalized: {validation['normalized']}")
            
            # DND check
            dnd_info = check_dnd_status(test_phone)
            print(f"   🚫 DND Instructions: {dnd_info['dnd_instructions']}")
        else:
            print(f"   ❌ Invalid: {validation['error']}")
            print(f"   💡 Suggestion: {validation['suggestion']}")
        
        # 4. Test Scenarios
        print("\n📱 TEST SCENARIOS")
        print("-" * 30)
        
        # Test data from the screenshot
        test_cases = [
            {
                "name": "Original Failed Scenario",
                "phone": "+254741651008",
                "message": "Task2SMS Live Test: Hello from Africa's Talking!"
            },
            {
                "name": "Alternative Format",
                "phone": "254741651008",  # Without +
                "message": "Task2SMS Test: Alternative format"
            },
            {
                "name": "With Sender ID",
                "phone": "+254741651008",
                "message": "Task2SMS Test: With sender ID"
            }
        ]
        
        for i, test_case in enumerate(test_cases, 1):
            print(f"\n🧪 Test {i}: {test_case['name']}")
            print(f"   Phone: {test_case['phone']}")
            print(f"   Message: {test_case['message']}")
            
            # Test the send method with enhanced logging
            result = await test_send_sms(provider, test_case['phone'], test_case['message'])
            
            if result.success:
                print(f"   ✅ SUCCESS - Message ID: {result.message_id}")
            else:
                print(f"   ❌ FAILED - Error: {result.error}")
                print(f"   📄 Full Response: {result.response}")
        
        # 4. Database Check
        print("\n💾 DATABASE CHECK")
        print("-" * 30)
        await check_database_records()
        
        print("\n" + "=" * 60)
        print("DEBUG COMPLETE - Check sms_debug.log for detailed logs")
        print("=" * 60)
        
    except Exception as e:
        logger.error(f"Unexpected error in main: {e}")
        print(f"❌ CRITICAL ERROR: {e}")

async def test_send_sms(provider, phone, message):
    """Test SMS sending with enhanced logging"""
    
    print(f"   🔄 Sending SMS...")
    
    try:
        # Add detailed logging before sending
        logger.info(f"Attempting to send SMS to {phone}")
        logger.info(f"Message: {message}")
        logger.info(f"Provider: {provider.name}")
        
        # Call the send method
        result = await provider.send(phone, message)
        
        # Log the result details
        logger.info(f"SMS Result - Success: {result.success}")
        logger.info(f"Message ID: {result.message_id}")
        logger.info(f"Error: {result.error}")
        logger.info(f"Full Response: {result.response}")
        
        # Analyze Africa's Talking specific response
        if result.response and 'SMSMessageData' in result.response:
            sms_data = result.response['SMSMessageData']
            logger.info(f"SMS Message Data: {sms_data}")
            
            if 'Recipients' in sms_data and sms_data['Recipients']:
                recipient = sms_data['Recipients'][0]
                status_code = recipient.get('statusCode')
                status = recipient.get('status')
                message_id = recipient.get('messageId')
                
                logger.info(f"Status Code: {status_code}")
                logger.info(f"Status: {status}")
                logger.info(f"Message ID: {message_id}")
                
                # Provide status code interpretation
                status_meanings = {
                    101: {"status": "Success", "message": "Message sent successfully"},
                    100: {"status": "Pending", "message": "Message queued for delivery"},
                    102: {"status": "Invalid Number", "message": "Invalid phone number format"},
                    103: {"status": "Insufficient Balance", "message": "Account balance too low"},
                    104: {"status": "Invalid Sender ID", "message": "Sender ID not approved"},
                    105: {"status": "Generic Error", "message": "Contact support"},
                    106: {"status": "Service Unavailable", "message": "Service temporarily unavailable"},
                    406: {"status": "Blacklisted/DND", "message": "Number in DND registry"}
                }
                
                if status_code in status_meanings:
                    status_info = status_meanings[status_code]
                    print(f"   📊 Status {status_code}: {status_info['status']}")
                    print(f"   💬 {status_info['message']}")
                    
                    # Special handling for DND
                    if status_code == 406:
                        dnd_info = check_dnd_status(phone)
                        if dnd_info["valid"]:
                            print(f"   📡 Carrier: {dnd_info['carrier']}")
                            print(f"   🚫 DND Fix: {dnd_info['dnd_instructions']}")
                else:
                    print(f"   📊 Unknown Status Code: {status_code}")
        
        return result
        
    except Exception as e:
        logger.error(f"Exception during SMS send: {e}")
        print(f"   💥 EXCEPTION: {e}")
        # Return a failed result
        from app.services.messaging.sms_service import SMSResult
        return SMSResult(False, error=str(e))

async def check_database_records():
    """Check database for failed notification records"""
    
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.notification import Notification
        from sqlalchemy import select
        
        async with AsyncSessionLocal() as db:
            # Query recent failed notifications
            result = await db.execute(
                select(Notification)
                .where(Notification.status == 'failed')
                .order_by(Notification.created_at.desc())
                .limit(5)
            )
            
            failed_notifications = result.scalars().all()
            
            if failed_notifications:
                print(f"   📋 Found {len(failed_notifications)} recent failed notifications:")
                
                for notif in failed_notifications:
                    print(f"   📌 ID: {notif.id}")
                    print(f"      Phone: {notif.recipient}")
                    print(f"      Provider: {notif.provider}")
                    print(f"      Error: {notif.error_message}")
                    print(f"      Response: {notif.provider_response}")
                    print(f"      Created: {notif.created_at}")
                    print()
            else:
                print("   ✅ No failed notifications found in database")
                
    except Exception as e:
        logger.error(f"Error checking database: {e}")
        print(f"   ❌ Database check failed: {e}")

def validate_kenyan_phone_number(phone):
    """Validate Kenyan phone number format and provide carrier info"""
    
    import re
    
    # Remove any non-digit characters except +
    clean_phone = re.sub(r'[^\d+]', '', phone)
    
    # Kenyan phone number patterns
    patterns = {
        r'^\+2547[0-9]{8}$': "International format (Safaricom/Airtel/Telkom)",
        r'^2547[0-9]{8}$': "International format without +",
        r'^07[0-9]{8}$': "Local format",
        r'^7[0-9]{8}$': "Local format without leading 0"
    }
    
    for pattern, description in patterns.items():
        if re.match(pattern, clean_phone):
            # Determine carrier from prefix
            prefix = clean_phone[-9:-7] if len(clean_phone) >= 9 else ""
            carrier = get_kenyan_carrier(prefix)
            return {
                "valid": True,
                "format": description,
                "carrier": carrier,
                "normalized": "+254" + clean_phone[-9:] if not clean_phone.startswith('+254') else clean_phone
            }
    
    return {
        "valid": False,
        "error": "Invalid Kenyan phone number format",
        "suggestion": "Use format: +2547XXXXXXXX or 07XXXXXXXX"
    }

def get_kenyan_carrier(prefix):
    """Determine carrier from phone prefix"""
    
    carriers = {
        "10": "Safaricom",
        "11": "Safaricom", 
        "12": "Safaricom",
        "20": "Airtel",
        "21": "Airtel",
        "22": "Airtel",
        "30": "Telkom Kenya",
        "31": "Telkom Kenya",
        "70": "Safaricom",
        "71": "Safaricom",
        "72": "Safaricom",
        "73": "Airtel",
        "74": "Airtel",
        "75": "Telkom Kenya",
        "76": "Safaricom",
        "77": "Safaricom",
        "78": "Airtel",
        "79": "Safaricom"
    }
    
    return carriers.get(prefix, "Unknown")

def check_dnd_status(phone):
    """Provide DND checking guidance for Kenyan numbers"""
    
    validation = validate_kenyan_phone_number(phone)
    
    if not validation["valid"]:
        return validation
    
    carrier = validation["carrier"]
    
    dnd_instructions = {
        "Safaricom": "Dial *456*9*5*1# to check/enable promotional messages",
        "Airtel": "Dial *321# to check DND status",
        "Telkom Kenya": "Dial *456# to manage DND settings"
    }
    
    return {
        "valid": True,
        "carrier": carrier,
        "dnd_instructions": dnd_instructions.get(carrier, "Contact your carrier to check DND status"),
        "normalized": validation["normalized"]
    }

def print_status_code_guide():
    """Print a guide for Africa's Talking status codes"""
    
    print("\n📖 AFRICA'S TALKING STATUS CODE GUIDE")
    print("-" * 40)
    print("101: Success - Message sent successfully")
    print("100: Pending - Message queued for delivery")
    print("102: Invalid phone number format")
    print("103: Insufficient account balance")
    print("104: Invalid or unapproved sender ID")
    print("105: Generic error - contact support")
    print("106: Service temporarily unavailable")
    print("406: UserInBlacklist/DND - Number in DND registry")
    print("\n📱 KENYAN DND INSTRUCTIONS")
    print("-" * 40)
    print("Safaricom: Dial *456*9*5*1# to enable promotional messages")
    print("Airtel: Dial *321# to check DND status")
    print("Telkom: Dial *456# to manage DND settings")
    print()

if __name__ == "__main__":
    print_status_code_guide()
    asyncio.run(main())
