# SSL Certificate Setup Guide for Railway

Railway **automatically provisions SSL certificates** via Let's Encrypt when you add a custom domain. No manual installation needed!

## Step-by-Step SSL Certificate Setup

### Step 1: Add Custom Domain in Railway

1. **Go to Railway Dashboard:**
   - Visit https://railway.app
   - Navigate to your project → **Kickdashboard** service

2. **Open Domain Settings:**
   - Click on **Settings** tab
   - Click on **Domains** section
   - Click **"Add Domain"** or **"Custom Domain"** button

3. **Enter Your Domain:**
   - Type: `kickdashboard.com`
   - Click **"Add"** or **"Save"**

4. **Railway Will Show DNS Records:**
   - Railway will display DNS records you need to configure
   - Usually a **CNAME** record pointing to Railway's domain
   - Example: `kickdashboard.com` → `kickdashboard-production.up.railway.app`

### Step 2: Configure DNS Records

1. **Go to Your Domain Registrar:**
   - Where you bought `kickdashboard.com` (e.g., Namecheap, GoDaddy, Cloudflare)
   - Log in to your account

2. **Find DNS Management:**
   - Look for "DNS Settings", "DNS Management", or "Name Servers"
   - Navigate to DNS records section

3. **Add the DNS Record Railway Provided:**
   - **Type:** CNAME (or A record if Railway specified)
   - **Name/Host:** `kickdashboard.com` or `@` (depends on registrar)
   - **Value/Target:** The Railway domain shown (e.g., `kickdashboard-production.up.railway.app`)
   - **TTL:** 3600 (or default)

4. **Save DNS Record:**
   - Click "Save" or "Add Record"
   - DNS propagation can take 5 minutes to 48 hours (usually 5-30 minutes)

### Step 3: Wait for SSL Certificate Provisioning

1. **Railway Automatically Provisions SSL:**
   - Once DNS is configured correctly, Railway detects it
   - Railway automatically requests SSL certificate from Let's Encrypt
   - This happens automatically - no action needed!

2. **Check SSL Status:**
   - Go back to Railway Dashboard → Service → Settings → Domains
   - You'll see SSL certificate status:
     - **"Provisioning"** - Certificate is being issued (wait 5-10 minutes)
     - **"Valid"** - SSL certificate is active ✅
     - **"Failed"** - Check DNS configuration

3. **Verify HTTPS Works:**
   ```bash
   # Test HTTPS connection
   curl -I https://kickdashboard.com

   # Should return: HTTP/2 200 (or similar)
   ```

### Step 4: Verify SSL Certificate

1. **Check Certificate Details:**
   ```bash
   openssl s_client -connect kickdashboard.com:443 -servername kickdashboard.com
   ```
   - Should show certificate details
   - Issued by: Let's Encrypt
   - Valid for: kickdashboard.com

2. **Test in Browser:**
   - Visit: `https://kickdashboard.com`
   - Should show padlock icon 🔒
   - No SSL warnings

## Troubleshooting

### SSL Certificate Stuck on "Provisioning"

**Possible Causes:**
1. **DNS not propagated yet:**
   ```bash
   # Check DNS
   dig kickdashboard.com
   nslookup kickdashboard.com
   ```
   - Should point to Railway's IP/domain
   - Wait longer if DNS just changed

2. **DNS records incorrect:**
   - Double-check DNS records match Railway's instructions
   - Ensure CNAME/A record is correct
   - Remove conflicting records

3. **Domain verification failed:**
   - Remove domain from Railway
   - Wait 5 minutes
   - Re-add domain
   - Railway will retry SSL provisioning

### SSL Certificate Shows "Failed"

1. **Check DNS Configuration:**
   - Verify DNS records are correct
   - Ensure domain points to Railway

2. **Check Domain Status:**
   - Railway Dashboard → Service → Settings → Domains
   - Look for error messages
   - Common: "DNS not configured" or "Domain verification failed"

3. **Re-provision Certificate:**
   - Remove domain from Railway
   - Wait 5 minutes
   - Re-add domain
   - Railway will retry SSL provisioning

### Certificate Expired (Rare)

Railway auto-renews certificates, but if expired:
1. Remove domain from Railway
2. Wait 5 minutes
3. Re-add domain
4. Railway will provision new certificate

## Important Notes

✅ **Railway Auto-Domains Have HTTPS:**
- `https://kickdashboard-production.up.railway.app` has HTTPS automatically
- No configuration needed for Railway domains

✅ **Custom Domains Need DNS Setup:**
- Must configure DNS records first
- SSL certificate provisions automatically after DNS is correct

✅ **No Manual Certificate Upload:**
- Railway handles everything automatically
- Uses Let's Encrypt (free SSL certificates)
- Auto-renews certificates

✅ **Environment Variables:**
- Ensure `NEXT_PUBLIC_APP_URL=https://kickdashboard.com` (with HTTPS)
- All URLs should use `https://` not `http://`

## Quick Checklist

- [ ] Domain added in Railway Dashboard
- [ ] DNS records configured correctly
- [ ] DNS propagated (check with `dig` or `nslookup`)
- [ ] SSL certificate shows "Valid" in Railway
- [ ] HTTPS works: `curl -I https://kickdashboard.com`
- [ ] Browser shows padlock icon 🔒
- [ ] Environment variables use HTTPS URLs

## Still Having Issues?

1. **Check Railway Logs:**
   - Dashboard → Service → Deployments → Latest → Logs
   - Look for SSL/certificate errors

2. **Contact Railway Support:**
   - If DNS is correct but SSL isn't provisioning
   - Email: support@railway.app
   - Include domain name and error messages

3. **Use Railway Auto-Domain Temporarily:**
   - `https://kickdashboard-production.up.railway.app`
   - Has HTTPS automatically
   - Use while fixing custom domain SSL


