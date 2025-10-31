# Telegram Bot Webhook Handler

This endpoint handles Telegram bot updates when users interact with your bot.

## Setup Instructions

1. Set up your Telegram bot webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY/setWebhook?url=https://yourdomain.com/api/telegram/webhook"
   ```

2. Or use the Telegram Bot API to set webhook programmatically

## Bot Flow

1. User clicks "Connect" on Telegram in the Connected Accounts page
2. User is redirected to `https://t.me/Sweetflipskickauthbot?start={auth_token}`
3. User starts conversation with bot
4. Bot receives `/start {auth_token}` command
5. Bot validates token and connects user's Telegram account
6. Bot sends confirmation message

## Implementation

You'll need to implement the webhook handler that:
- Receives updates from Telegram
- Parses `/start` commands
- Extracts the auth token
- Validates and saves the connection
- Sends confirmation to user
