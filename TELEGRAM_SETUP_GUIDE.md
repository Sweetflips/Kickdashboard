# Telegram Bot Setup Guide

## Prerequisites

1. ✅ Bot Token: Already configured in `.env.local`
2. ✅ Bot Username: Already configured in `.env.local`
3. ❌ Webhook URL: **NEEDS TO BE SET UP**

## Step 1: Expose Your Local Server (For Development)

Telegram needs to send webhook updates to your server. Since you're running locally, you need to expose it publicly.

### Option A: Using ngrok (Recommended)

1. Install ngrok: https://ngrok.com/download
2. Start your Next.js dev server: `npm run dev`
3. In another terminal, expose port 3000:
   ```bash
   ngrok http 3000
   ```
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Option B: Using Cloudflare Tunnel or similar

Use any tunnel service to expose your localhost.

## Step 2: Set Up the Webhook

Once you have a public URL, set up the webhook using one of these methods:

### Method 1: Using the Setup Script

Run this PowerShell command (replace YOUR_PUBLIC_URL with your ngrok URL):

```powershell
$botToken = "8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY"
$webhookUrl = "https://YOUR_PUBLIC_URL.ngrok.io/api/telegram/webhook"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/setWebhook?url=$webhookUrl" -Method Post
```

### Method 2: Using curl

```bash
curl -X POST "https://api.telegram.org/bot8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY/setWebhook?url=https://YOUR_PUBLIC_URL.ngrok.io/api/telegram/webhook"
```

### Method 3: Using Browser

Visit this URL in your browser (replace YOUR_PUBLIC_URL):
```
https://api.telegram.org/bot8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY/setWebhook?url=https://YOUR_PUBLIC_URL.ngrok.io/api/telegram/webhook
```

## Step 3: Verify Webhook Setup

Check if webhook is set correctly:

```bash
curl "https://api.telegram.org/bot8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY/getWebhookInfo"
```

Or visit in browser:
```
https://api.telegram.org/bot8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY/getWebhookInfo
```

## Step 4: Test the Connection

1. Go to your profile page → Connected Accounts
2. Click "Connect Telegram"
3. Click "Open Telegram" button
4. Telegram should open with your bot
5. Click "START" or send `/start` command
6. The bot should connect your account

## Troubleshooting

### Webhook Not Receiving Updates

1. **Check webhook URL is correct**: Run `getWebhookInfo` to see current webhook
2. **Verify your server is accessible**: Make sure ngrok/tunnel is running
3. **Check server logs**: Look for incoming requests to `/api/telegram/webhook`
4. **Verify bot token**: Make sure it's correct in `.env.local`

### Bot Not Responding

1. **Check webhook URL**: Must be HTTPS (not HTTP)
2. **Verify endpoint exists**: Should be `/api/telegram/webhook`
3. **Check logs**: Look for errors in your Next.js console

### Connection Not Saving

1. **Check database migration**: Make sure connected accounts migration ran
2. **Check user ID**: Verify `kick_user_id` is being passed correctly
3. **Check server logs**: Look for database errors

## Production Setup

For production, use your actual domain:

```bash
curl -X POST "https://api.telegram.org/bot8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY/setWebhook?url=https://yourdomain.com/api/telegram/webhook"
```

## Important Notes

- The webhook URL **must be HTTPS** (Telegram requires SSL)
- Your server must be publicly accessible (use ngrok for local dev)
- Each time you restart ngrok, you'll get a new URL and need to update the webhook
- For production, use a stable domain















