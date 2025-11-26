# Railway Worker Service Setup

## Current Status
✅ Web service (Kickdashboard) configured with:
- `ENABLE_POINT_WORKER=false`
- `CHAT_SAVE_VERBOSE_LOGS=false`
- `POINT_QUEUE_VERBOSE_LOGS=false`
- `VERBOSE_TOKEN_REFRESH_LOGS=false`

## Create Worker Service

### Option 1: Via Railway Dashboard (Recommended)

1. Go to your Railway project: https://railway.app/project/7539ef05-fad8-4337-8d0c-c57af25ee99c
2. Click **"+ New"** → **"GitHub Repo"** (or **"Empty Service"**)
3. If using GitHub:
   - Select the same repository
   - Railway will detect it's the same repo
   - Name it: **"point-worker"** or **"kick-worker"**
4. Configure the service:
   - **Root Directory**: `/` (same as web service)
   - **Build Command**: `npm run build`
   - **Start Command**: `node scripts/start-worker.js`
   - **Healthcheck Path**: `/` (or disable healthcheck)
5. Set Environment Variables:
   ```
   ENABLE_POINT_WORKER=true (optional, not needed since worker script doesn't check this)
   POINT_WORKER_BATCH_SIZE=50
   POINT_WORKER_CONCURRENCY=10
   POINT_WORKER_POLL_INTERVAL_MS=500
   POINT_QUEUE_VERBOSE_LOGS=false
   DATABASE_URL=<same as web service>
   KICK_CLIENT_ID=<same as web service>
   KICK_CLIENT_SECRET=<same as web service>
   NEXT_PUBLIC_APP_URL=<same as web service>
   TOKEN_ENCRYPTION_KEY=<same as web service>
   ```
6. **Important**: Set service to **scale to 1 instance only** (to prevent multiple workers)
   - Go to service settings → **Scaling** → Set to **1**

### Option 2: Via Railway CLI

```bash
# Link to the project (if not already linked)
cd "D:\kick chat"
railway link

# Create a new service (this will prompt you)
railway service create point-worker

# Set the start command
railway variables set START_COMMAND="node scripts/start-worker.js"

# Set worker-specific variables
railway variables set POINT_WORKER_BATCH_SIZE=50
railway variables set POINT_WORKER_CONCURRENCY=10
railway variables set POINT_WORKER_POLL_INTERVAL_MS=500
railway variables set POINT_QUEUE_VERBOSE_LOGS=false

# Copy all other variables from web service (DATABASE_URL, KICK_CLIENT_ID, etc.)
# You can do this via the dashboard or by setting them one by one
```

### Option 3: Use railway-worker.json (if Railway supports it)

The `railway-worker.json` file has been created. Railway may auto-detect it if you:
1. Create a new service in the dashboard
2. Point it to the same repo
3. Railway should use `railway-worker.json` for configuration

## Verify Setup

1. **Web Service**: Should NOT start the worker (check logs for "⏸️ Point worker disabled")
2. **Worker Service**: Should start and acquire advisory lock (check logs for "✅ Advisory lock acquired")
3. **Queue Stats**: Visit `/api/admin/points/queue-stats` to monitor queue

## Monitoring

- Worker logs should show: `[point-worker] Queue stats: pending=X, processing=Y, completed=Z`
- If you see "Failed to acquire advisory lock", another worker instance is running
- Check queue stats endpoint for real-time monitoring

## Troubleshooting

- **Multiple workers running**: Check scaling settings, ensure only 1 instance
- **Worker not processing**: Check advisory lock acquisition in logs
- **Queue backing up**: Increase `POINT_WORKER_BATCH_SIZE` or `POINT_WORKER_CONCURRENCY`
- **High CPU**: Decrease `POINT_WORKER_CONCURRENCY` or increase `POINT_WORKER_POLL_INTERVAL_MS`



