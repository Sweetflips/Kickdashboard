# Railway Point-Worker Service Configuration

## Quick Fix - Use Config-as-Code (Recommended)

The `railway-worker.json` file is already configured correctly. You just need to tell Railway to use it:

### Steps:

1. **Login to Railway CLI** (opens browser):
   ```bash
   npx @railway/cli login
   ```

2. **Link to your project**:
   ```bash
   npx @railway/cli link
   ```
   Select your project when prompted.

3. **Go to Railway Dashboard**:
   - Navigate to: https://railway.app/project/[your-project-id]
   - Click on the **point-worker** service
   - Scroll down to **"Config-as-code"** section
   - Click **"Add File Path"**
   - Enter: `railway-worker.json`
   - Click **"Update"**

4. **Trigger a new deployment**:
   - Railway will automatically use the config file
   - Or manually trigger: Click "Deploy" → "Redeploy"

## Alternative: Manual Dashboard Update

If you prefer to update manually:

1. Go to Railway Dashboard → point-worker service
2. **Build Section**:
   - Change **Builder** from `Nixpacks` to `Dockerfile`
   - Remove any **Custom Build Command** (leave empty)
3. **Deploy Section**:
   - **Start Command**: `node scripts/start-worker.js` (should already be set)
   - **Healthcheck Path**: Change from `/` to `/health`
   - **Healthcheck Timeout**: Set to `5000`
4. Click **"Update"** at the bottom

## What This Fixes

✅ Switches from Nixpacks (deprecated) to Dockerfile builder  
✅ Avoids cache mount conflicts (`EBUSY` errors)  
✅ Uses the same Dockerfile as main service  
✅ Proper healthcheck configuration  

## Verify It Works

After deployment, check the build logs:
- Should see "Building Dockerfile" instead of "Using Nixpacks"
- No `EBUSY` errors
- Build completes successfully


