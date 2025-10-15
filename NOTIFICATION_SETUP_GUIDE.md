# Notification System Setup Guide

## Overview
This guide explains how to configure all notification channels (Email and WhatsApp) for the Ronak Motor Garage application.

## Required Environment Variables

### Critical - Email Verification
```bash
APP_URL=https://workspace.mtgpjs.replit.dev
# Or use BASE_URL instead:
# BASE_URL=https://workspace.mtgpjs.replit.dev
```
**⚠️ IMPORTANT**: Without APP_URL or BASE_URL, email verification links will not work correctly!

### Email Service (SendGrid)
```bash
SENDGRID_API_KEY=your_sendgrid_api_key_here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

**How to get SendGrid credentials:**
1. Sign up at [SendGrid](https://sendgrid.com/)
2. Verify your sender email address
3. Generate API key from Settings > API Keys
4. Copy the API key (shown only once)

### WhatsApp Service (Twilio)
```bash
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

**How to get Twilio credentials:**
1. Sign up at [Twilio Console](https://console.twilio.com/)
2. Get Account SID and Auth Token from dashboard
3. Enable WhatsApp on your Twilio number
4. Format: `whatsapp:+{country_code}{phone_number}`

## Notification Flows

### 1. Email Verification (Registration)
**Flow:**
1. User registers with email/password
2. System sends verification email with unique link
3. User clicks link to verify email
4. User is automatically logged in

**Endpoint:** Automatic on registration
**Link Format:** `https://your-domain.com/verify-email?token={token}&email={email}`

### 2. Promotional Messages (Admin Only)

#### Single WhatsApp Promotion
**Endpoint:** `POST /api/admin/promotions/whatsapp`

**Request:**
```json
{
  "phone": "9876543210",
  "countryCode": "+91",
  "message": "Special 20% discount on all services this week!",
  "customerName": "John Doe"
}
```

#### Single Email Promotion
**Endpoint:** `POST /api/admin/promotions/email`

**Request:**
```json
{
  "email": "customer@example.com",
  "subject": "Special Discount - 20% Off",
  "message": "Get 20% off on all services this week!",
  "customerName": "John Doe"
}
```

#### Bulk Promotions
**Endpoint:** `POST /api/admin/promotions/bulk`

**Request:**
```json
{
  "channel": "both",
  "subject": "Weekend Special Offer",
  "message": "Visit us this weekend for special discounts!",
  "recipients": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "countryCode": "+91"
    },
    {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "phone": "9876543211",
      "countryCode": "+91"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 2,
    "sent": 2,
    "failed": 0,
    "errors": []
  },
  "message": "Bulk promotional messages processed: 2 sent, 0 failed"
}
```

## Security Features

### Email Verification Security
- Token hashed with crypto.randomBytes
- 24-hour expiry for email verification
- 1-hour expiry for password reset
- One-time use tokens (marked as consumed)
- Rate limiting on verification endpoints

### Input Sanitization
All user inputs are sanitized:
- `sanitizeEmail()` - Email validation and cleaning
- `sanitizePhone()` - Phone number formatting
- `sanitizeUsername()` - Name sanitization
- `sanitizeMessage()` - Message content cleaning

## Troubleshooting

### Email Verification Links Not Working
**Problem:** Links don't work or redirect incorrectly
**Solution:** 
1. Check if `APP_URL` or `BASE_URL` is set in environment variables
2. Verify the URL matches your actual Replit domain
3. Current Replit domain: `https://workspace.mtgpjs.replit.dev`

### SendGrid Errors
**Problem:** "Sender verification required" or 403 errors
**Solution:**
1. Go to SendGrid dashboard
2. Navigate to Settings > Sender Authentication
3. Verify your sender email address
4. Update `SENDGRID_FROM_EMAIL` to match verified email

### Twilio WhatsApp Not Working
**Problem:** WhatsApp messages not being delivered
**Solution:**
1. Verify Twilio credentials are correct
2. Check WhatsApp number is enabled in Twilio console
3. Ensure number format includes `whatsapp:` prefix
4. Test with Twilio sandbox first (for development)

## Testing

### Test Email Verification
1. Register new user with email/password
2. Check console logs for verification URL
3. Click verification link
4. Confirm user is verified and logged in

### Test Promotional Messages (Admin)
1. Login as admin user
2. POST to `/api/admin/promotions/whatsapp` or `/api/admin/promotions/email`
3. Verify message received
4. Check admin audit logs

## Rate Limits

- **Email Verification:** Rate limited by Express middleware
- **Password Reset:** Strict rate limiting
- **Promotional Messages:** Admin-only, moderate limits
- **Auth Endpoints:** Configured rate limiting per endpoint type

## Best Practices

1. **Always set APP_URL** in production for correct email links
2. **Test bulk promotions** with small batches first
3. **Monitor SendGrid and Twilio** usage and quotas
4. **Use verified sender emails** for better deliverability
5. **Sanitize all inputs** before sending (already implemented)

## API Reference

### Promotional Endpoints (Admin Only)
- `POST /api/admin/promotions/whatsapp` - Send WhatsApp promotion
- `POST /api/admin/promotions/email` - Send email promotion
- `POST /api/admin/promotions/bulk` - Send bulk promotions

### Email Verification
- `POST /api/auth/register` - Triggers verification email
- `GET /verify-email?token={token}&email={email}` - Verify email

### Password Reset
- `POST /api/auth/password-reset` - Request reset email
- `POST /api/auth/password-reset/verify` - Reset password with token
