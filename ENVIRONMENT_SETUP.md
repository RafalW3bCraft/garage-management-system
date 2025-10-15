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
- WhatsApp notifications (Twilio)

---

## 🔑 Required API Keys

### WhatsApp Notifications (Twilio)

**What it does:** Sends WhatsApp messages for appointment confirmations and updates

**Required variables:**
```bash
TWILIO_ACCOUNT_SID="your_twilio_account_sid"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"  # Optional: uses default if not set
```

**Optional configuration (Advanced):**
```bash
# Retry configuration
WHATSAPP_MAX_RETRIES="3"                    # Maximum retry attempts (default: 3)
WHATSAPP_RETRY_DELAY="1000"                 # Initial retry delay in ms (default: 1000)
WHATSAPP_MAX_RETRY_DELAY="60000"           # Max retry delay in ms (default: 60000)
WHATSAPP_BACKOFF_MULTIPLIER="2"            # Exponential backoff multiplier (default: 2)

# Circuit breaker configuration
WHATSAPP_CIRCUIT_THRESHOLD="5"              # Failures before opening circuit (default: 5)
WHATSAPP_CIRCUIT_RECOVERY_MIN="5"          # Minutes before retry after circuit opens (default: 5)

# Fallback configuration
WHATSAPP_ENABLE_EMAIL_FALLBACK="true"      # Enable email fallback (default: true)
```

**Circuit Breaker & Fallback Features:**
- **Circuit Breaker**: Automatically detects sustained WhatsApp failures and prevents wasted retry attempts
- **Email Fallback**: If WhatsApp fails, attempts to send via email (requires SendGrid)
- **Simplified Retry**: Exponential backoff without database overhead during retries

**How to get Twilio credentials:**
1. Sign up at [Twilio](https://www.twilio.com/)
2. Go to Console Dashboard
3. Find your Account SID and Auth Token
4. **For quick testing (Sandbox):**
   - Go to WhatsApp Sandbox in Twilio Console
   - Enable the sandbox
   - Send the join code to your WhatsApp number (e.g., "join [code]")
   - Use the sandbox number for TWILIO_WHATSAPP_NUMBER
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
# WhatsApp Service (Twilio)
TWILIO_ACCOUNT_SID="your_account_sid_here"
TWILIO_AUTH_TOKEN="your_auth_token_here"
TWILIO_WHATSAPP_NUMBER="whatsapp:+your_whatsapp_number"
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
- WhatsApp messages are logged to console instead of sent
- Perfect for testing without spending credits

**Production Mode:**
- Real WhatsApp messages are sent
- Requires actual API credentials
- Set NODE_ENV=production for full functionality

---

## 📞 Support

If you need help getting API keys or have questions:

1. **Twilio Support:** Their WhatsApp Business API has detailed guides
2. **Application Issues:** Check the console logs for specific error messages

Your application is fully functional - these API keys just enable the external messaging features!