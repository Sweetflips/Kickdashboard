# Railway Environment Variables Setup Guide

## Quick Setup

1. **Go to Railway Dashboard** → Your Project → Variables tab

2. **Add each variable** from `.env.production` file

3. **Important Variables to Set:**

### Required Variables:
```
DATABASE_URL          - Already set by Railway PostgreSQL service (copy from service)
KICK_CLIENT_ID        - Your Kick OAuth client ID
KICK_CLIENT_SECRET    - Your Kick OAuth client secret
NEXT_PUBLIC_APP_URL   - https://kickdashboard.com
NEXT_PUBLIC_PUSHER_KEY - Your Pusher app key
NEXT_PUBLIC_PUSHER_CLUSTER - us2 (or your cluster)
NEXT_PUBLIC_PUSHER_WS_HOST - ws-us2.pusher.com (or your host)
```

### Optional Variables:
```
EXTERNAL_WEBHOOK_URL       - For webhook forwarding
DISCORD_CLIENT_ID          - Discord OAuth (if using)
DISCORD_CLIENT_SECRET      - Discord OAuth secret
DISCORD_REDIRECT_URI       - Discord callback URL
TELEGRAM_BOT_TOKEN         - Telegram bot token
TELEGRAM_BOT_USERNAME      - Telegram bot username
PUSHER_APP_ID             - Server-side Pusher (if needed)
PUSHER_SECRET             - Server-side Pusher secret
```

## How to Upload .env.production to Railway

### Option 1: Manual Entry (Recommended)
1. Copy contents from `.env.production`
2. Go to Railway → Variables tab
3. Add each variable manually
4. Click "Add" for each

### Option 2: Railway CLI
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link project
railway link

# Load variables from file
railway variables --file .env.production
```

## After Setting Variables

1. **Restart your Railway service** (Railway will auto-restart on variable changes)
2. **Run database migrations**:
   ```bash
   railway run npx prisma migrate deploy
   ```
3. **Verify deployment** by checking logs

## Notes

- `DATABASE_URL` is automatically provided by Railway PostgreSQL service
- All variables are case-sensitive
- Never commit `.env.production` with real credentials to git
- Use Railway's built-in secrets management for security
