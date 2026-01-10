# Cloudflare 502 Bad Gateway Fix Guide

## Quick Diagnosis

Run the diagnostic script:
```bash
node scripts/diagnose-cloudflare-502.js
```

This will test connectivity and identify where the connection fails.

## Root Cause

A 502 Bad Gateway error means Cloudflare cannot establish a valid HTTPS connection to your Railway origin server. This is usually caused by:

1. **Railway custom domain not configured** (most common)
2. **SSL certificate not yet provisioned** (if domains are already added)
3. **Cloudflare SSL mode mismatch** (needs to be "Full")

> **If you already have domains configured in Railway**, see [`docs/502_WITH_DOMAINS_CONFIGURED.md`](502_WITH_DOMAINS_CONFIGURED.md) for specific troubleshooting.

## Step-by-Step Fix

### Step 1: Verify Railway Custom Domain Configuration

**Critical:** Railway must know about your custom domain, even if DNS is correctly configured.

1. Go to [Railway Dashboard](https://railway.app)
2. Select your project → Your service
3. Go to **Settings** → **Networking** → **Custom Domains**
4. Check if `www.kickdashboard.com` is listed
5. If **NOT listed**, click **"Add Domain"** or **"Custom Domain"**
6. Enter: `www.kickdashboard.com`
7. Railway will verify the domain and provision an SSL certificate
8. Wait for status to show **"Active"** and SSL to show **"Valid"**

**Also add:** `kickdashboard.com` (without www) for redirect handling

### Step 2: Verify Cloudflare DNS Configuration

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select `kickdashboard.com` domain
3. Go to **DNS** → **Records**
4. Verify you have:
   ```
   Type: CNAME
   Name: www
   Target: [your-service].up.railway.app
   Proxy: Enabled (orange cloud)
   ```
5. Also verify:
   ```
   Type: CNAME (or A)
   Name: @
   Target: [your-service].up.railway.app (or Railway IP)
   Proxy: Enabled (orange cloud)
   ```

**Important:** The CNAME target should be Railway's `.up.railway.app` domain, NOT an IP address.

### Step 3: Verify Cloudflare SSL/TLS Settings

1. In Cloudflare Dashboard → `kickdashboard.com`
2. Go to **SSL/TLS** → **Overview**
3. Set encryption mode to **"Full"** (not "Full Strict")
   - Railway uses Let's Encrypt certificates
   - "Full Strict" requires a certificate from a trusted CA, which Railway provides
   - But "Full" is safer initially to avoid certificate chain issues

### Step 4: Test Direct Railway Access

Test if Railway's direct domain works:

```bash
# Replace [your-service] with your actual Railway domain
curl -I https://[your-service].up.railway.app/api/health
```

If this works but `www.kickdashboard.com` doesn't, the issue is custom domain configuration.

### Step 5: Check for Cloudflare Rules Conflicts

1. Go to Cloudflare Dashboard → **Rules**
2. Check **Page Rules**, **Transform Rules**, and **Origin Rules**
3. Look for any rules affecting `www.kickdashboard.com`
4. Temporarily disable suspicious rules to test

### Step 6: Verify Railway Service Health

1. Go to Railway Dashboard → Your Service
2. Check **Deployments** → Latest deployment
3. View **Logs** for any errors
4. Verify the service shows **"Active"** status
5. Check that health checks are passing:
   - Railway Dashboard → Service → Settings → Health Checks
   - Should show `/api/health` endpoint is responding

## Common Issues and Solutions

### Issue: Railway Custom Domain Not Verified

**Symptoms:**
- 502 errors on all requests
- Railway dashboard shows domain as "Pending" or "Failed"

**Solution:**
1. Remove the domain from Railway
2. Wait 5 minutes
3. Re-add the domain
4. Ensure DNS CNAME is correctly configured
5. Wait for Railway to verify (can take 10-30 minutes)

### Issue: SSL Certificate Not Provisioned

**Symptoms:**
- 502 errors
- Railway shows domain as "Active" but SSL as "Pending"

**Solution:**
1. Verify DNS is correctly pointing to Railway
2. Check DNS propagation: `dig www.kickdashboard.com`
3. Wait up to 1 hour for Let's Encrypt certificate provisioning
4. If still pending after 1 hour, contact Railway support

### Issue: Cloudflare SSL Mode Mismatch

**Symptoms:**
- 502 errors
- Railway domain works directly but not through Cloudflare

**Solution:**
1. Temporarily set Cloudflare SSL to **"Flexible"** to test
2. If requests work, the issue is SSL certificate validation
3. Switch back to **"Full"** once Railway SSL is provisioned
4. Ensure Railway custom domain is verified

### Issue: DNS Propagation Delay

**Symptoms:**
- Intermittent 502 errors
- Some regions work, others don't

**Solution:**
1. Check DNS propagation: `dig www.kickdashboard.com @8.8.8.8`
2. Wait for full propagation (can take up to 48 hours, usually 5-30 minutes)
3. Clear Cloudflare cache: Dashboard → Caching → Purge Everything

## Verification Checklist

After applying fixes, verify:

- [ ] Railway Dashboard shows `www.kickdashboard.com` as "Active"
- [ ] Railway Dashboard shows SSL certificate as "Valid"
- [ ] Cloudflare DNS shows CNAME with proxy enabled (orange cloud)
- [ ] Cloudflare SSL/TLS mode is set to "Full"
- [ ] Direct Railway domain works: `curl https://[service].up.railway.app/api/health`
- [ ] Cloudflare domain works: `curl https://www.kickdashboard.com/api/health`
- [ ] No 502 errors in browser network tab

## Testing Commands

```bash
# Test health endpoint
curl -I https://www.kickdashboard.com/api/health

# Test failing endpoint
curl -X POST https://www.kickdashboard.com/api/chat/sweet-coins \
  -H "Content-Type: application/json" \
  -d '{"messageIds":["test"]}'

# Check DNS resolution
dig www.kickdashboard.com
nslookup www.kickdashboard.com

# Check SSL certificate
openssl s_client -connect www.kickdashboard.com:443 -servername www.kickdashboard.com
```

## Still Not Working?

1. **Check Railway Logs:**
   - Railway Dashboard → Service → Deployments → Latest → Logs
   - Look for connection errors or SSL issues

2. **Check Cloudflare Logs:**
   - Cloudflare Dashboard → Analytics & Logs → HTTP Requests
   - Filter for 502 errors and check origin response

3. **Contact Support:**
   - Railway Support: support@railway.app
   - Cloudflare Support: Available in dashboard

## Prevention

To avoid this issue in the future:

1. **Always add custom domains in Railway first** before configuring DNS
2. **Wait for Railway SSL provisioning** before switching Cloudflare SSL to "Full"
3. **Use Railway's provided domain** as CNAME target (not IP addresses)
4. **Keep Cloudflare proxy enabled** for DDoS protection and caching
