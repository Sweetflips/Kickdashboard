# Cloudflare Setup Guide

This guide covers the complete Cloudflare configuration for `kickdashboard.com`, including DNS, SSL, and CDN worker setup.

## Architecture Overview

```
User Request
    ↓
Cloudflare DNS (www.kickdashboard.com)
    ↓
Cloudflare Proxy (SSL Termination)
    ↓
Railway Origin Server ([service].up.railway.app)
    ↓
Next.js Application
```

## Components

### 1. Main Domain (www.kickdashboard.com)
- **Purpose**: Serves the Next.js application
- **DNS**: CNAME to Railway domain, proxied through Cloudflare
- **SSL**: Full mode (Cloudflare → Railway)
- **Origin**: Railway Next.js service

### 2. CDN Worker (cdn.kickdashboard.com)
- **Purpose**: Serves media files from R2 bucket
- **DNS**: Separate CNAME, proxied through Cloudflare
- **Worker**: Cloudflare Worker (`cloudflare/cdn-worker/`)
- **Storage**: R2 bucket (`sweetflips-media`)

## Quick Setup Checklist

### Railway Configuration
- [ ] Add `www.kickdashboard.com` as custom domain in Railway
- [ ] Add `kickdashboard.com` as custom domain (for redirects)
- [ ] Wait for SSL certificate provisioning (5-30 minutes)
- [ ] Verify domain status shows "Active"

### Cloudflare DNS Configuration
- [ ] Add CNAME record: `www` → `[service].up.railway.app` (proxied)
- [ ] Add CNAME/A record: `@` → Railway domain/IP (proxied)
- [ ] Verify proxy is enabled (orange cloud icon)

### Cloudflare SSL Configuration
- [ ] Set SSL/TLS encryption mode to **"Full"**
- [ ] Do NOT use "Full Strict" (Railway uses Let's Encrypt)
- [ ] Verify SSL certificate is active

### CDN Worker Setup (Optional)
- [ ] Deploy CDN worker: `cd cloudflare/cdn-worker && wrangler deploy`
- [ ] Set signing secret: `wrangler secret put SIGNING_SECRET`
- [ ] Add custom domain: `cdn.kickdashboard.com` in Cloudflare Workers dashboard
- [ ] Configure DNS: CNAME `cdn` → Worker route

## Troubleshooting

### 502 Bad Gateway Errors

**Symptoms:** All requests return 502 from Cloudflare

**Most Common Cause:** Railway custom domain not configured

**Fix:**
1. Run diagnostic: `npm run diagnose:cloudflare`
2. Check Railway custom domain configuration
3. Verify SSL certificate is provisioned
4. See `docs/CLOUDFLARE_502_FIX.md` for detailed steps

### SSL Certificate Issues

**Symptoms:** 502 errors, SSL warnings

**Fix:**
1. Ensure custom domain is added in Railway
2. Wait for SSL provisioning (up to 1 hour)
3. Verify DNS propagation: `dig www.kickdashboard.com`
4. Check Cloudflare SSL mode is "Full" (not "Full Strict")

### CDN Worker Errors

**Symptoms:** Media files not loading, 500 errors from CDN

**Fix:**
1. Check worker logs in Cloudflare dashboard
2. Verify `SIGNING_SECRET` is set: `wrangler secret list`
3. Verify R2 bucket binding in `wrangler.toml`
4. See `docs/R2_SETUP.md` for detailed troubleshooting

## Diagnostic Tools

### Run Cloudflare 502 Diagnostic
```bash
npm run diagnose:cloudflare
```

This script tests:
- Health endpoint via Cloudflare
- Failing API endpoints
- Direct Railway access (if domain provided)
- Provides specific fix recommendations

### Manual Testing
```bash
# Test health endpoint
curl -I https://www.kickdashboard.com/api/health

# Test API endpoint
curl -X POST https://www.kickdashboard.com/api/chat/sweet-coins \
  -H "Content-Type: application/json" \
  -d '{"messageIds":["test"]}'

# Check DNS resolution
dig www.kickdashboard.com

# Check SSL certificate
openssl s_client -connect www.kickdashboard.com:443 \
  -servername www.kickdashboard.com
```

## Environment Variables

### Railway (Next.js App)
```bash
NEXT_PUBLIC_APP_URL=https://www.kickdashboard.com
ALLOWED_MEDIA_DOMAINS=https://www.kickdashboard.com,https://kickdashboard.com
MEDIA_CDN_BASE_URL=https://cdn.kickdashboard.com  # Optional
MEDIA_CDN_SIGNING_SECRET=<secret>  # Optional, must match worker secret
```

### Cloudflare Worker
Set via `wrangler secret put`:
```bash
SIGNING_SECRET=<base64-encoded-secret>
```

Configured in `wrangler.toml`:
```toml
PUBLIC_HOST=cdn.kickdashboard.com
[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "sweetflips-media"
```

## Related Documentation

- `docs/CLOUDFLARE_502_FIX.md` - Detailed 502 troubleshooting
- `docs/CLOUDFLARE_502_QUICK_CHECKLIST.md` - Quick fix checklist
- `docs/R2_SETUP.md` - R2 and CDN worker setup
- `docs/HTTPS_TROUBLESHOOTING.md` - General HTTPS issues

## Support

If issues persist:
1. Check Railway logs: Dashboard → Service → Deployments → Latest → Logs
2. Check Cloudflare logs: Dashboard → Analytics & Logs → HTTP Requests
3. Run diagnostic script: `npm run diagnose:cloudflare`
4. Review relevant troubleshooting docs above
