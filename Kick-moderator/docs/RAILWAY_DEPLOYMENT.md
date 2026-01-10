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

## Preventing unnecessary worker rebuilds

To avoid the `point-worker` from rebuilding on unrelated changes (e.g., changes to frontend components), there are two recommended approaches:

1. Set Railway watch paths (recommended)
   - In the Railway dashboard, open the `point-worker` service and go to `Deploy` → `Watch Paths` (or similar setting for the service). Configure watch paths so the service only deploys when worker-related files change:
     - `scripts/point-worker*`, `scripts/chat-worker*`, `scripts/start-worker*`, `lib/point-queue*`, `lib/chat-queue*`, `lib/points*`, `prisma/**`, `package.json`, `tsconfig.json`
   - For the web service, configure its watch path to include `app/**`, `components/**`, `public/**`, etc. Include `prisma/**`, `package.json`, `tsconfig.json` in both if those files should cause both services to rebuild.

2. Gate build steps inside the repository (implemented)
   - The repository includes `scripts/build.worker.js` that checks which files changed in a push and short-circuits the worker build when no worker-related file changes are detected.
   - `railway-worker.json` points the worker `buildCommand` to `node scripts/build.worker.js` to avoid running the heavy build when it's not necessary.

Notes & caveats
- This script is a best-effort gate that verifies changed files via git diff; it works in most CI environments but can fall back to building if the repo is shallow/fetch is disabled.
- The most reliable option is to configure watch paths for each Railway service in the dashboard (option 1). The build gating script is a safe fallback when you cannot modify the Railway dashboard or prefer in-repo configuration that works in commit-based deployments.
- Changes to `package.json`, `prisma/`, or other shared artifacts will still trigger builds for both services by design if you include those paths in both watch lists.

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
