# 🔧 Environment Setup Guide

This guide helps you configure all external services for your Ronak Motor Garage application.

## 📋 Current Status

Your application is **fully functional** with the following services:

✅ **Working Services:**
- Database (PostgreSQL) - Connected and operational
- Google OAuth - Configured and enabled
- Email notifications (SendGrid) - Configured and ready
- Admin user - Create via provided script (see Admin Access Setup)
- Session management - Secure and working

⚠️ **Services needing API keys:**
- SMS/OTP verification (MessageCentral)
- WhatsApp notifications (Twilio)

---

## 🔑 Required API Keys

### 1. SMS/OTP Verification (MessageCentral)

**What it does:** Sends SMS verification codes for mobile phone registration

**Required variables:**
```bash
MESSAGECENTRAL_AUTH_TOKEN="your_messagecentral_auth_token"
MESSAGECENTRAL_CUSTOMER_ID="your_customer_id"
OTP_SECRET="your_secure_32_character_secret_minimum"
```

**How to get MessageCentral credentials:**
1. Sign up at [MessageCentral](https://cpaas.messagecentral.com/)
2. Go to your dashboard
3. Get your Auth Token (JWT token for API authentication)
4. Get your Customer ID (starts with C-)

**Generate OTP Secret:**
```bash
# Generate a secure 32+ character secret
openssl rand -base64 32
```

### 2. WhatsApp Notifications (Twilio)

**What it does:** Sends WhatsApp messages for appointment confirmations and updates

**Required variables:**
```bash
TWILIO_ACCOUNT_SID="your_twilio_account_sid"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"  # Optional: uses default if not set
```

**How to get Twilio credentials:**
1. Sign up at [Twilio](https://www.twilio.com/)
2. Go to Console Dashboard
3. Find your Account SID and Auth Token
4. **For quick testing (Sandbox):**
   - Go to WhatsApp Sandbox in Twilio Console
   - Enable the sandbox
   - Send the join code to your WhatsApp number (e.g., "join [code]")
   - Use the sandbox number for TWILIO_WHATSAPP_FROM
5. **For production:** Apply for WhatsApp Business API access

**Phone number format:** 
- Use E.164 format: +[country code][number] (e.g., +1234567890)
- WhatsApp numbers must include "whatsapp:" prefix (e.g., "whatsapp:+1234567890")
- Both sender and recipient numbers need this format for Twilio

---

## 🚀 Setup Instructions

### Step 1: Add Environment Variables

Add these to your Replit Secrets or `.env` file:

```bash
# SMS/OTP Service
MESSAGECENTRAL_API_KEY="your_actual_api_key_here"
OTP_SECRET="your_generated_32_character_secret"

# WhatsApp Service  
TWILIO_ACCOUNT_SID="your_account_sid_here"
TWILIO_AUTH_TOKEN="your_auth_token_here"
TWILIO_WHATSAPP_FROM="whatsapp:+your_whatsapp_number"
```

### Step 2: Restart Application

After adding the environment variables:
1. Restart your Replit application
2. Check the startup logs for service status
3. **With credentials configured, you should see:**
   - `- TWILIO_ACCOUNT_SID: ✓ Available`
   - `- TWILIO_AUTH_TOKEN: ✓ Available`
   - `- WhatsApp Service: ✓ Enabled`
4. **Without credentials, you'll see:**
   - `- TWILIO_ACCOUNT_SID: ⚠ Missing (WhatsApp disabled)`
   - `- TWILIO_AUTH_TOKEN: ⚠ Missing (WhatsApp disabled)`
   - `- WhatsApp Service: ⚠ Disabled (mock mode)`

### Step 3: Test the Services

**Test SMS/OTP:**
1. Try registering with a mobile phone number
2. Check if you receive the SMS verification code
3. Complete the verification process

**Test WhatsApp:**
1. Ensure phone numbers are in E.164 format with "whatsapp:" prefix
2. If using Twilio Sandbox, send the join code first
3. Create a test appointment
4. Check console logs for WhatsApp delivery status
5. Verify actual message delivery on WhatsApp

---

## 🔍 Service Details

### Current Working Features (No setup needed)

- **User Registration & Login** (Email + Google OAuth)
- **Admin Dashboard** (Create admin user using provided script)
- **Appointment Management** (Create, update, reschedule)
- **Service Management** (Admin can create, update, delete services)
- **Email Notifications** (Appointment confirmations via SendGrid)
- **Location Management** (Multiple garage locations)
- **Contact Form** (Customer inquiries)

### Features Requiring API Keys

- **Mobile Registration** (Needs MessageCentral for SMS)
- **WhatsApp Notifications** (Needs Twilio for messages)

---

## 🏃‍♂️ Admin Access Setup

**IMPORTANT:** For security, create your own admin user instead of using default credentials.

**Create Admin User:**
```bash
ADMIN_EMAIL="your_admin@yourcompany.com" \
ADMIN_PASSWORD="YourSecurePassword123!" \
ADMIN_NAME="Your Admin Name" \
node scripts/create-admin-user.js
```

**Admin Capabilities:**
- View all appointments
- Update appointment statuses  
- Manage services (create, update, delete)
- View user statistics
- Manage locations
- View contact form submissions

**Security Note:** Always use strong, unique passwords and rotate credentials regularly.

---

## 🔧 Development vs Production

**Development Mode (Current):**
- SMS codes are logged to console instead of sent
- WhatsApp messages are logged to console instead of sent
- Perfect for testing without spending credits

**Production Mode:**
- Real SMS and WhatsApp messages are sent
- Requires actual API credentials
- Set NODE_ENV=production for full functionality

---

## 📞 Support

If you need help getting API keys or have questions:

1. **MessageCentral Support:** Check their documentation for API setup
2. **Twilio Support:** Their WhatsApp Business API has detailed guides
3. **Application Issues:** Check the console logs for specific error messages

Your application is fully functional - these API keys just enable the external messaging features!