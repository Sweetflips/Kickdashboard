# Railway Deployment Guide

## Prerequisites

1. Railway account at https://railway.app
2. PostgreSQL database (Railway provides this)
3. Domain configured: kickdashboard.com

## Environment Variables

Set these in Railway dashboard:

### Required
- `DATABASE_URL` - PostgreSQL connection string (provided by Railway PostgreSQL service)
- `KICK_CLIENT_ID` - Your Kick OAuth client ID
- `KICK_CLIENT_SECRET` - Your Kick OAuth client secret
- `NEXT_PUBLIC_APP_URL` - `https://kickdashboard.com`

### Optional
- `EXTERNAL_WEBHOOK_URL` - External webhook forwarding URL (defaults to APP_URL/api/webhooks/kick)
- `DISCORD_CLIENT_ID` - Discord OAuth client ID
- `DISCORD_CLIENT_SECRET` - Discord OAuth client secret
- `DISCORD_REDIRECT_URI` - Discord OAuth redirect URI
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_BOT_USERNAME` - Telegram bot username
- `WEBHOOK_TUNNEL_URL` - For local development with ngrok
- `NEXT_PUBLIC_WEBHOOK_TUNNEL_URL` - For local development with ngrok

## Deployment Steps

1. **Connect Repository**
   - Go to Railway dashboard
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Select your repository

2. **Add PostgreSQL Database**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Copy the `DATABASE_URL` connection string

3. **Set Environment Variables**
   - Go to project settings
   - Add all environment variables listed above
   - Make sure `NEXT_PUBLIC_APP_URL` is set to `https://kickdashboard.com`

4. **Run Database Migrations**
   - In Railway, go to your service
   - Open the "Shell" tab
   - Run: `npx prisma migrate deploy`
   - This will apply all migrations to your database

5. **Configure Domain**
   - In Railway, go to your service settings
   - Click "Generate Domain" or add custom domain
   - Add `kickdashboard.com` as custom domain
   - Configure DNS records as instructed by Railway

6. **Deploy**
   - Railway will automatically deploy on push to main branch
   - Or manually trigger deployment from dashboard

## Post-Deployment

1. **Verify Database Connection**
   - Check logs to ensure Prisma client generated successfully
   - Verify database migrations ran

2. **Test OAuth Flow**
   - Visit your domain
   - Test Kick login
   - Verify redirect URLs work correctly

3. **Test Webhooks**
   - Subscribe to webhooks
   - Verify webhook URL is accessible
   - Test receiving chat messages

## Troubleshooting

- If builds fail, check logs for Prisma errors
- Ensure `DATABASE_URL` is correctly formatted
- Verify `NEXT_PUBLIC_APP_URL` matches your domain
- Check Railway logs for any runtime errors
