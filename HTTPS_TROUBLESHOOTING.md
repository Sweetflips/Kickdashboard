# HTTPS Troubleshooting Guide for Railway

## Common HTTPS Issues and Solutions

### 1. **Custom Domain Not Configured**

Railway provides HTTPS automatically for their `.up.railway.app` domains. For custom domains like `kickdashboard.com`, you need to:

1. **Add Custom Domain in Railway:**
   - Go to Railway Dashboard → Your Service → Settings → Domains
   - Click "Add Domain" or "Custom Domain"
   - Enter: `kickdashboard.com`
   - Railway will provide DNS records to configure

2. **Configure DNS Records:**
   - Railway will show you CNAME or A records to add
   - Add these records in your domain registrar (where you bought kickdashboard.com)
   - Wait for DNS propagation (can take up to 48 hours, usually 5-30 minutes)

3. **Wait for SSL Certificate:**
   - Railway automatically provisions SSL certificates via Let's Encrypt
   - This happens automatically after DNS is configured correctly
   - Check Railway dashboard → Domains → SSL status

### 2. **Environment Variables Using HTTP Instead of HTTPS**

Check your Railway environment variables:

```bash
# Should be HTTPS, not HTTP
NEXT_PUBLIC_APP_URL=https://kickdashboard.com  # ✅ Correct
NEXT_PUBLIC_APP_URL=http://kickdashboard.com   # ❌ Wrong

EXTERNAL_WEBHOOK_URL=https://kickdashboard.com/api/webhooks/kick  # ✅ Correct
DISCORD_REDIRECT_URI=https://kickdashboard.com/api/oauth/discord/callback  # ✅ Correct
```

### 3. **Using Railway Auto-Generated Domain**

If you haven't set up the custom domain yet, Railway provides an HTTPS domain automatically:

- Format: `https://[service-name]-[environment].up.railway.app`
- Example: `https://kickdashboard-production.up.railway.app`
- This domain has HTTPS enabled by default

### 4. **DNS Not Propagated**

If DNS isn't configured correctly:

1. Check DNS records:
   ```bash
   # Check if domain points to Railway
   dig kickdashboard.com
   nslookup kickdashboard.com
   ```

2. Verify Railway domain settings:
   - Railway Dashboard → Service → Settings → Domains
   - Should show "Active" status
   - SSL certificate should show "Valid" or "Provisioning"

### 5. **SSL Certificate Issues**

If SSL certificate isn't working:

1. **Check Certificate Status:**
   - Railway Dashboard → Service → Settings → Domains
   - Look for SSL certificate status
   - Should show "Valid" or "Provisioning"

2. **Common Issues:**
   - DNS not pointing to Railway → Fix DNS records
   - Domain verification failed → Re-verify domain in Railway
   - Certificate expired → Railway auto-renews, but check status

### 6. **Next.js Configuration**

Your `next.config.js` looks correct. No changes needed for HTTPS.

### 7. **Force HTTPS Redirect (Optional)**

If you want to force HTTPS redirects, you can add middleware. However, Railway handles this automatically, so it's usually not needed.

## Quick Checklist

- [ ] Custom domain added in Railway Dashboard
- [ ] DNS records configured correctly
- [ ] DNS propagated (check with `dig` or `nslookup`)
- [ ] SSL certificate shows "Valid" in Railway
- [ ] `NEXT_PUBLIC_APP_URL` uses `https://` not `http://`
- [ ] All environment variables use HTTPS URLs
- [ ] Railway service is deployed and running

## Testing HTTPS

1. **Test Railway auto-domain:**
   ```bash
   curl -I https://kickdashboard-production.up.railway.app
   # Should return 200 OK with HTTPS
   ```

2. **Test custom domain:**
   ```bash
   curl -I https://kickdashboard.com
   # Should return 200 OK with HTTPS
   ```

3. **Check SSL certificate:**
   ```bash
   openssl s_client -connect kickdashboard.com:443 -servername kickdashboard.com
   # Should show valid certificate
   ```

## Still Not Working?

1. **Check Railway Logs:**
   - Railway Dashboard → Service → Deployments → Latest → Logs
   - Look for SSL/certificate errors

2. **Verify Domain Configuration:**
   - Railway Dashboard → Service → Settings → Domains
   - Check domain status and SSL certificate status

3. **Contact Railway Support:**
   - If DNS is correct but SSL isn't provisioning
   - Railway support: support@railway.app
