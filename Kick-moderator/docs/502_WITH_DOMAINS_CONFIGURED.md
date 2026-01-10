# 502 Error When Domains Are Already Configured

## Your Current Status

✅ **DNS:** Correctly configured in Cloudflare  
✅ **Railway Domains:** Both `www.kickdashboard.com` and `kickdashboard.com` are added  
✅ **Port:** Railway shows Port 8080 (app should use `PORT` env var automatically)

## Most Likely Causes

### 1. SSL Certificate Not Yet Provisioned

Railway needs time to provision SSL certificates via Let's Encrypt.

**Check in Railway:**
- Go to your service → Settings → Networking → Custom Domains
- Look at the SSL status for each domain
- Should show "Valid" (not "Pending" or "Error")

**If SSL is "Pending":**
- Wait 10-30 minutes (can take up to 1 hour)
- Verify DNS propagation: `dig www.kickdashboard.com`
- Ensure Cloudflare proxy is enabled (orange cloud)

### 2. Cloudflare SSL Mode Mismatch

Cloudflare SSL mode must match Railway's SSL setup.

**Fix:**
1. Go to Cloudflare Dashboard → SSL/TLS → Overview
2. Set encryption mode to **"Full"** (not "Full Strict")
3. Save changes
4. Wait 2-3 minutes for changes to propagate

**Why "Full" not "Full Strict":**
- Railway uses Let's Encrypt certificates
- "Full Strict" requires certificates from specific CAs
- "Full" works with any valid SSL certificate

### 3. Port Configuration Issue

Railway shows Port 8080, but verify the app is actually listening on that port.

**Check Railway Logs:**
Look for this line in startup logs:
```
🚀 Starting Next.js on port 8080...
```

If it shows a different port, Railway's PORT env var might not be set correctly.

**Verify PORT Environment Variable:**
1. Railway Dashboard → Your Service → Variables
2. Check if `PORT` is explicitly set
3. If set to something other than 8080, either:
   - Remove it (let Railway auto-set it)
   - Or update Railway domain to match the port

### 4. Railway Service Health

Verify the service is actually running and healthy.

**Check:**
1. Railway Dashboard → Your Service → Deployments
2. Latest deployment should show "Active"
3. Check logs for any startup errors
4. Verify health check is passing: `/api/health`

**Test Direct Railway Domain:**
```bash
curl -I https://vz6sndp9.up.railway.app/api/health
```

If this works but `www.kickdashboard.com` doesn't, it's a custom domain/SSL issue.

## Step-by-Step Fix

### Step 1: Verify SSL Status in Railway

1. Railway Dashboard → Service → Settings → Networking
2. Check SSL status for both domains
3. If "Pending", wait up to 1 hour
4. If "Error", see troubleshooting below

### Step 2: Set Cloudflare SSL to "Full"

1. Cloudflare Dashboard → SSL/TLS → Overview
2. Change encryption mode to **"Full"**
3. Save
4. Wait 2-3 minutes

### Step 3: Clear Cloudflare Cache

1. Cloudflare Dashboard → Caching → Configuration
2. Click "Purge Everything"
3. Wait 1-2 minutes

### Step 4: Test Again

```bash
# Test direct Railway domain (should always work)
curl -I https://vz6sndp9.up.railway.app/api/health

# Test via Cloudflare (should work after SSL is provisioned)
curl -I https://www.kickdashboard.com/api/health

# Run diagnostic
npm run diagnose:cloudflare
```

## Troubleshooting SSL Errors

### SSL Shows "Error" in Railway

1. **Remove and Re-add Domain:**
   - Delete the domain in Railway
   - Wait 5 minutes
   - Re-add the domain
   - Wait for verification

2. **Verify DNS:**
   ```bash
   dig www.kickdashboard.com
   ```
   Should show Railway's IP or CNAME

3. **Check DNS Propagation:**
   - Use https://dnschecker.org
   - Check `www.kickdashboard.com` globally
   - All locations should resolve correctly

### SSL Stuck on "Pending" > 1 Hour

1. Verify domain is "Active" (not "Pending")
2. Check Railway logs for SSL provisioning errors
3. Verify DNS is correctly configured
4. Try removing and re-adding domain
5. Contact Railway support if still stuck

## Quick Diagnostic Checklist

- [ ] Railway domains show "Active" status
- [ ] Railway SSL shows "Valid" (not "Pending" or "Error")
- [ ] Cloudflare SSL mode is set to "Full"
- [ ] Cloudflare DNS shows proxy enabled (orange cloud)
- [ ] Direct Railway domain works: `curl https://vz6sndp9.up.railway.app/api/health`
- [ ] Railway logs show app starting on correct port
- [ ] Health check endpoint responds: `/api/health`

## Expected Timeline

- **DNS Propagation:** Already done ✅
- **Railway Domain Verification:** Already done ✅
- **SSL Provisioning:** 5-30 minutes (can take up to 1 hour)
- **Cloudflare SSL Changes:** 2-3 minutes
- **Cache Clearing:** 1-2 minutes

## Still Not Working?

If all the above is correct and you still get 502:

1. **Check Railway Logs:**
   - Look for SSL/certificate errors
   - Check if app is actually listening on port 8080
   - Verify health checks are passing

2. **Check Cloudflare Logs:**
   - Analytics & Logs → HTTP Requests
   - Filter for 502 errors
   - Check "Origin Response" column for details

3. **Test Direct Connection:**
   ```bash
   # Bypass Cloudflare (temporarily disable proxy)
   # In Cloudflare DNS, change www from "Proxied" to "DNS only"
   # Wait 5 minutes, then test
   curl -I https://www.kickdashboard.com/api/health
   ```
   If this works, the issue is Cloudflare SSL configuration.

4. **Contact Support:**
   - Railway Support: support@railway.app
   - Cloudflare Support: Available in dashboard

## Common Solutions Summary

| Issue | Solution |
|-------|----------|
| SSL "Pending" | Wait 10-30 minutes |
| SSL "Error" | Remove and re-add domain |
| Cloudflare SSL mode wrong | Set to "Full" |
| Port mismatch | Verify PORT env var matches Railway port |
| Service not healthy | Check Railway logs and health checks |
