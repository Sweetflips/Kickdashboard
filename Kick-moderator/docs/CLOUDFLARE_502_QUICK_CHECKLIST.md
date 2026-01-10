# Cloudflare 502 Quick Fix Checklist

## ⚡ Quick Diagnosis

Run this command:
```bash
node scripts/diagnose-cloudflare-502.js
```

## ✅ Step-by-Step Fix (5 minutes)

### 1. Railway Custom Domain (MOST IMPORTANT)

- [ ] Go to Railway Dashboard → Your Service → Settings → Networking → Custom Domains
- [ ] Check if `www.kickdashboard.com` is listed
- [ ] If NOT listed:
  - [ ] Click "Add Domain" or "Custom Domain"
  - [ ] Enter: `www.kickdashboard.com`
  - [ ] Wait for status to show "Active" (5-30 minutes)
  - [ ] Verify SSL shows "Valid"
- [ ] Also add `kickdashboard.com` (without www) for redirects

### 2. Cloudflare DNS

- [ ] Go to Cloudflare Dashboard → DNS → Records
- [ ] Verify CNAME record:
  ```
  Type: CNAME
  Name: www
  Target: [your-service].up.railway.app
  Proxy: Enabled (orange cloud) ✅
  ```
- [ ] If missing or wrong, add/fix it

### 3. Cloudflare SSL/TLS

- [ ] Go to Cloudflare Dashboard → SSL/TLS → Overview
- [ ] Set encryption mode to: **"Full"** (not "Full Strict")
- [ ] Save changes

### 4. Test

```bash
# Test health endpoint
curl -I https://www.kickdashboard.com/api/health

# Should return 200 OK, not 502
```

### 5. If Still Failing

- [ ] Check Railway logs: Dashboard → Service → Deployments → Latest → Logs
- [ ] Check Cloudflare logs: Dashboard → Analytics & Logs → HTTP Requests
- [ ] Verify DNS propagation: `dig www.kickdashboard.com`
- [ ] Clear Cloudflare cache: Dashboard → Caching → Purge Everything

## 🎯 Most Common Issue

**Railway custom domain not configured** - Even if DNS points correctly, Railway must have the domain added in their dashboard.

## 📚 Full Documentation

See `docs/CLOUDFLARE_502_FIX.md` for detailed troubleshooting.
