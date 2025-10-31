#!/bin/bash

# Telegram Webhook Setup Script
# Usage: ./setup-telegram-webhook.sh YOUR_PUBLIC_URL

PUBLIC_URL="${1:-}"
BOT_TOKEN="8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY"

if [ -z "$PUBLIC_URL" ]; then
    echo "❌ Error: Please provide your public URL"
    echo "Usage: ./setup-telegram-webhook.sh https://your-ngrok-url.ngrok.io"
    exit 1
fi

WEBHOOK_URL="${PUBLIC_URL}/api/telegram/webhook"

echo "🤖 Setting Telegram webhook..."
echo "URL: $WEBHOOK_URL"
echo ""

# Set webhook
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}")
echo "Response: $RESPONSE"
echo ""

# Verify webhook
echo "✅ Verifying webhook..."
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq '.'

echo ""
echo "✨ Done! Try sending a message to your bot on Telegram."
