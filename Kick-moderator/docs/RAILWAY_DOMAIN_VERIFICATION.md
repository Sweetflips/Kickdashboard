# Railway Custom Domain Verification

## Your Current Setup

- **Railway Domain:** `vz6sndp9.up.railway.app`
- **Cloudflare DNS:** ✅ Correctly configured
  - `www.kickdashboard.com` → `vz6sndp9.up.railway.app` (Proxied)
  - `kickdashboard.com` → `vz6sndp9.up.railway.app` (Proxied)

## Critical Step: Add Custom Domain in Railway

Even though DNS is correctly configured, **Railway must have the custom domain added** in their dashboard.

### Step-by-Step Instructions

1. **Go to Railway Dashboard**
   - Navigate to: https://railway.app
   - Select your project
   - Click on your service (the one running Next.js)

2. **Navigate to Custom Domains**
   - Click **Settings** tab
   - Click **Networking** section
   - Look for **Custom Domains** or **Domains** section

3. **Add `www.kickdashboard.com`**
   - Click **"Add Domain"** or **"Custom Domain"** button
   - Enter: `www.kickdashboard.com`
   - Click **Add** or **Save**

4. **Add `kickdashboard.com` (root domain)**
   - Click **"Add Domain"** again
   - Enter: `kickdashboard.com` (without www)
   - Click **Add** or **Save**

5. **Wait for Verification**
   - Railway will verify the domain (checks DNS)
   - Status should change from "Pending" to "Active"
   - SSL certificate will be automatically provisioned (5-30 minutes)
   - Wait until SSL shows "Valid"

## What to Look For

### ✅ Correct Configuration
- Domain status: **"Active"**
- SSL status: **"Valid"**
- Domain listed in Railway dashboard

### ❌ Missing Configuration
- Domain not listed in Railway dashboard
- Domain shows "Pending" or "Failed"
- SSL shows "Pending" or "Error"

## Verification Commands

After adding the domain in Railway, test:

```bash
# Test direct Railway domain (should always work)
curl -I https://vz6sndp9.up.railway.app/api/health

# Test via Cloudflare (should work after Railway domain is added)
curl -I https://www.kickdashboard.com/api/health

# Run diagnostic
npm run diagnose:cloudflare
```

## Expected Timeline

- **DNS Propagation:** Already done (Cloudflare DNS is correct)
- **Railway Verification:** 1-5 minutes after adding domain
- **SSL Provisioning:** 5-30 minutes after verification
- **Total:** Usually 10-30 minutes from adding domain to working

## Troubleshooting

### Domain Shows "Pending" for > 30 minutes
1. Verify DNS records are correct (they are ✅)
2. Check Railway logs for domain verification errors
3. Try removing and re-adding the domain
4. Contact Railway support if still pending

### SSL Shows "Pending" for > 1 hour
1. Verify domain is "Active" (not "Pending")
2. Check DNS propagation: `dig www.kickdashboard.com`
3. Ensure Cloudflare SSL mode is "Full" (not "Full Strict")
4. Wait longer (Let's Encrypt can take up to 1 hour)

### Still Getting 502 After Adding Domain
1. Verify domain status is "Active" in Railway
2. Verify SSL status is "Valid" in Railway
3. Check Cloudflare SSL/TLS mode is "Full"
4. Clear Cloudflare cache: Dashboard → Caching → Purge Everything
5. Wait 5 minutes and test again

## Quick Checklist

- [ ] Added `www.kickdashboard.com` in Railway
- [ ] Added `kickdashboard.com` in Railway
- [ ] Domain status shows "Active"
- [ ] SSL status shows "Valid"
- [ ] Tested direct Railway domain: `curl https://vz6sndp9.up.railway.app/api/health`
- [ ] Tested via Cloudflare: `curl https://www.kickdashboard.com/api/health`
- [ ] No more 502 errors

## Related Documentation

- `docs/CLOUDFLARE_502_FIX.md` - Detailed troubleshooting
- `docs/CLOUDFLARE_502_QUICK_CHECKLIST.md` - Quick reference
- `docs/CLOUDFLARE_SETUP.md` - Complete setup guide
