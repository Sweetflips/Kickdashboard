# Railway 404 Error Diagnosis

## Your Current Issue

Direct Railway domain returns **404 Not Found** with `X-Railway-Fallback: true`:
```bash
curl -I https://vz6sndp9.up.railway.app/api/health
# Returns: HTTP/1.1 404 Not Found
# Headers: X-Railway-Fallback: true
```

## What This Means

The `X-Railway-Fallback: true` header indicates Railway's edge network is responding, but:
1. The service might not be running/deployed
2. Railway might be routing to the wrong service
3. The custom domain might be pointing to a worker service instead of the web service

## Diagnosis Steps

### Step 1: Check Which Service the Domain Points To

1. Go to Railway Dashboard → Your Service → Settings → Networking
2. Look at the custom domains section
3. Check which **service** each domain is assigned to
4. Verify `www.kickdashboard.com` points to your **Next.js web service** (not worker service)

### Step 2: Verify Service is Deployed

1. Railway Dashboard → Your Service → Deployments
2. Check latest deployment status:
   - Should show **"Active"** (green)
   - Should show **"Deployed"** status
   - Check deployment logs for errors

### Step 3: Check Service Logs

1. Railway Dashboard → Your Service → Deployments → Latest → Logs
2. Look for:
   - `🚀 Starting Next.js on port...`
   - `✅ Health check server listening...`
   - Any error messages
   - Port number (should match Railway's port 8080)

### Step 4: Verify Service Configuration

Check `railway.json` matches Railway settings:

1. Railway Dashboard → Your Service → Settings
2. **Build Section:**
   - Builder should be: **Dockerfile**
   - Dockerfile path: **Dockerfile**
3. **Deploy Section:**
   - Start Command: `node scripts/start.js`
   - Healthcheck Path: `/api/health`
   - Healthcheck Timeout: `5000`

## Common Causes

### Cause 1: Domain Points to Wrong Service

**Symptom:** Domain configured but pointing to worker service instead of web service

**Fix:**
1. Railway Dashboard → Settings → Networking → Custom Domains
2. Click **Edit** on `www.kickdashboard.com`
3. Verify it's assigned to your **Next.js web service** (not worker)
4. If wrong, change to correct service
5. Save and wait 2-3 minutes

### Cause 2: Service Not Deployed

**Symptom:** No active deployment or deployment failed

**Fix:**
1. Railway Dashboard → Your Service → Deployments
2. If no deployment or failed:
   - Click **"Deploy"** → **"Redeploy"**
   - Or trigger via Git push
3. Wait for deployment to complete
4. Check logs for errors

### Cause 3: Service Not Running

**Symptom:** Deployment succeeded but service isn't responding

**Fix:**
1. Check Railway logs for startup errors
2. Verify PORT environment variable matches Railway's port (8080)
3. Check if health check is failing:
   - Railway Dashboard → Service → Settings → Health Checks
   - Should show `/api/health` endpoint

### Cause 4: Multiple Services with Same Domain

**Symptom:** Multiple services trying to use the same domain

**Fix:**
1. Railway Dashboard → All Services
2. Check each service's custom domains
3. Ensure only **one** service has `www.kickdashboard.com`
4. Remove domain from other services

## Quick Fix Checklist

- [ ] Domain points to correct service (Next.js web service, not worker)
- [ ] Service has active deployment
- [ ] Service logs show Next.js starting successfully
- [ ] PORT environment variable matches Railway port (8080)
- [ ] Health check path is `/api/health`
- [ ] Only one service has the domain configured

## Testing After Fix

```bash
# Test direct Railway domain (should return 200, not 404)
curl -I https://vz6sndp9.up.railway.app/api/health

# Expected response:
# HTTP/1.1 200 OK
# Content-Type: application/json
# Server: railway-edge (or your app server)

# Test via Cloudflare (should work after Railway is fixed)
curl -I https://www.kickdashboard.com/api/health
```

## If Still Getting 404

1. **Check Railway Logs:**
   - Look for startup errors
   - Verify Next.js is actually running
   - Check if port conflicts exist

2. **Verify Service Type:**
   - Ensure it's the **web service** (not worker)
   - Worker services don't serve Next.js routes

3. **Check Build Output:**
   - Railway Dashboard → Deployments → Latest → Build Logs
   - Verify build completed successfully
   - Check for any build errors

4. **Test Health Check Directly:**
   - Railway Dashboard → Service → Settings → Health Checks
   - Check if health check is passing
   - If failing, check logs for why

5. **Contact Railway Support:**
   - If service is deployed but still 404
   - Provide Railway request ID from headers
   - Example: `X-Railway-Request-Id: fh9ipBHiTwqFREl6m3z_FQ`

## Related Issues

- **502 Bad Gateway:** See `docs/CLOUDFLARE_502_FIX.md`
- **Service Not Starting:** Check Railway logs and Dockerfile
- **Port Mismatch:** Verify PORT env var matches Railway port
