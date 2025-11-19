# Telegram Webhook Setup Script

This script helps you set up the Telegram bot webhook.

## Usage

### PowerShell (Windows)

```powershell
# Get your public URL (from ngrok or your domain)
$publicUrl = "https://your-ngrok-url.ngrok.io"  # Replace with your actual URL

# Set the webhook
$botToken = "8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY"
$webhookUrl = "$publicUrl/api/telegram/webhook"

Write-Host "Setting Telegram webhook to: $webhookUrl"

try {
    $response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/setWebhook?url=$webhookUrl" -Method Post
    Write-Host "✅ Webhook set successfully!"
    Write-Host "Response: $($response | ConvertTo-Json)"
} catch {
    Write-Host "❌ Error setting webhook: $_"
}

# Verify webhook
Write-Host "`nVerifying webhook..."
try {
    $info = Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/getWebhookInfo" -Method Get
    Write-Host "Current webhook URL: $($info.result.url)"
    Write-Host "Pending updates: $($info.result.pending_update_count)"
} catch {
    Write-Host "❌ Error getting webhook info: $_"
}
```

### Bash (Linux/Mac)

```bash
#!/bin/bash

# Get your public URL (from ngrok or your domain)
PUBLIC_URL="https://your-ngrok-url.ngrok.io"  # Replace with your actual URL

BOT_TOKEN="8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY"
WEBHOOK_URL="${PUBLIC_URL}/api/telegram/webhook"

echo "Setting Telegram webhook to: $WEBHOOK_URL"

# Set webhook
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}"

echo ""
echo "Verifying webhook..."
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

## Quick Setup Steps

1. **Start ngrok** (if developing locally):
   ```bash
   ngrok http 3000
   ```

2. **Copy the HTTPS URL** from ngrok (e.g., `https://abc123.ngrok.io`)

3. **Run the script** with your ngrok URL

4. **Test**: Send a message to your bot on Telegram, then check your server logs
















