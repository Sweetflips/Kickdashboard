# Railway Point Worker Health Check Fix

## Problem
Railway is using `Dockerfile` (main app) instead of `Dockerfile.worker`, causing health check failures because it's trying to start Next.js instead of the worker.

## Solution: Code Fix Applied ✅

**FIXED**: The `point-worker` branch now has `Dockerfile` replaced with the worker version. Railway will automatically use the correct Dockerfile when deploying from the `point-worker` branch.

### What Changed
- On `point-worker` branch: `Dockerfile` = worker version (no Next.js build)
- On `main` branch: `Dockerfile` = web app version (with Next.js build)

Railway auto-detects `Dockerfile`, so it will now use the worker version when deploying from `point-worker` branch.

## Alternative: Configure Railway Dashboard (if code fix doesn't work)

Railway's `railway.json` file is being ignored. You **MUST** configure the service in Railway dashboard:

### Step 1: Go to Railway Dashboard
1. Navigate to your Railway project
2. Find the **point-worker** service (or create it if it doesn't exist)

### Step 2: Configure Build Settings
1. Go to **Settings** → **Build**
2. Set **Builder** to: `DOCKERFILE`
3. Set **Dockerfile Path** to: `Dockerfile.worker` ⚠️ **CRITICAL**
4. Save changes

### Step 3: Configure Deploy Settings
1. Go to **Settings** → **Deploy**
2. Set **Start Command** to: `node scripts/start-worker.js`
3. Set **Healthcheck Path** to: `/health`
4. Set **Healthcheck Timeout** to: `30` (seconds)
5. Save changes

### Step 4: Verify Branch
1. Go to **Settings** → **Source**
2. Ensure the service is deploying from the **point-worker** branch
3. If not, change it to `point-worker` branch

### Step 5: Redeploy
1. Go to **Deployments**
2. Click **Redeploy** or push a new commit to `point-worker` branch
3. Watch the logs - you should see:
   - `🔧 Worker starting, PORT=8080`
   - `✅ Health check server listening on 0.0.0.0:8080`
   - NOT Next.js build logs

## Verification

After redeploying, check the build logs. You should see:
- ✅ `[deps 2/7] RUN npm install -g npm@latest` (from Dockerfile.worker)
- ✅ `[deps 7/7] RUN npm ci` (installing dependencies)
- ❌ NOT `[builder 3/3] RUN npm run build` (that's from main Dockerfile)

The health check should now pass because:
1. Worker starts HTTP server immediately
2. Server listens on `/health` endpoint
3. No Next.js build blocking startup

## Alternative: Use Railway CLI

If you have Railway CLI installed:

```bash
# Link to project
railway link

# Select the point-worker service
railway service

# Set Dockerfile path (this might require dashboard, but try):
railway variables set RAILWAY_DOCKERFILE_PATH="Dockerfile.worker"

# Set start command
railway variables set START_COMMAND="node scripts/start-worker.js"
```

## Why railway.json Isn't Working

Railway's `railway.json` file is only read if:
1. The service is configured to use it (some services ignore it)
2. Railway hasn't detected/configured a Dockerfile automatically
3. The service settings in dashboard don't override it

Since Railway auto-detected `Dockerfile`, it's ignoring `railway.json`. You must set it manually in the dashboard.
