# Cloudflare R2 Setup Guide

This guide walks you through setting up Cloudflare R2 for storing and serving user-uploaded images (avatars, etc.) with protection against hotlinking.

## Prerequisites

- Cloudflare account (free tier works)
- Access to your application's environment variables

## Step 1: Create R2 Bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** in the left sidebar
3. Click **Create bucket**
4. Enter a bucket name (e.g., `sweetflips-media` or `kickdashboard-images`)
5. Choose a location (select closest to your users)
6. Click **Create bucket**

**Important**: Keep the bucket **private** (default). Do not enable public access.

## Step 2: Create R2 API Token

1. In the R2 dashboard, click **Manage R2 API Tokens** (or go to **Workers & Pages** → **R2** → **Manage R2 API Tokens**)
2. Click **Create API Token**
3. Configure the token:
   - **Token name**: `sweetflips-r2-token` (or any name you prefer)
   - **Permissions**: Select **Object Read & Write**
   - **TTL**: Leave empty for no expiration, or set a date
   - **Buckets**: Select your bucket from Step 1
4. Click **Create API Token**
5. **IMPORTANT**: Copy the following values immediately (you won't see them again):
   - **Access Key ID**
   - **Secret Access Key**

## Step 3: Get Your Account ID

1. In Cloudflare Dashboard, select any domain
2. Scroll down to find **Account ID** in the right sidebar
3. Copy the Account ID (it's a long string of characters)

## Step 4: Set Environment Variables

Add these environment variables to your `.env.local` (development) or Railway/your hosting platform (production):

```bash
# Cloudflare R2 Configuration
R2_ACCOUNT_ID=5ccd33097e8392aae2f801dea6fec575
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET=sweetflips-media

# Optional: Comma-separated list of allowed domains for media hotlink protection
# If not set, defaults to your current domain
ALLOWED_MEDIA_DOMAINS=https://yourdomain.com,https://www.yourdomain.com
```

**Note**: You still need to create an API token (Step 2) to get `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.

### For Railway Deployment

1. Go to your Railway project dashboard
2. Click on your service
3. Go to **Variables** tab
4. Add each variable:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `ALLOWED_MEDIA_DOMAINS` (optional)

## Step 5: Install Dependencies

Make sure you have the AWS SDK installed:

```bash
npm install @aws-sdk/client-s3
```

If you haven't already, this should be in your `package.json` after the implementation.

## Step 6: Test the Setup

### Test Upload (via Profile Picture Upload)

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Log in to your app
3. Go to Profile Settings
4. Upload a profile picture
5. Check the console logs - you should see:
   ```
   ☁️  [R2 UPLOAD] Uploading to R2...
   └─ ✅ Successfully uploaded to R2
   ```

### Test Media Serving

1. After uploading, check that the image displays correctly
2. The image URL should look like: `/api/media/avatars/123/1234567890_abc123.webp`
3. Try accessing the URL directly - it should work from your domain
4. Try accessing it from a different domain - it should return `403 Forbidden`

## Step 7: Migrate Existing Avatars (Optional)

If you have existing users with base64 avatars stored in Postgres, run the migration script:

```bash
# Make sure your .env.local has the R2 credentials
tsx scripts/migrate-avatars-to-r2.ts
```

This will:
- Find all users with `data:image/...` avatars
- Process and upload them to R2
- Update the database with new `/api/media/...` URLs

**Note**: The script processes images one by one. For large numbers of users, this may take a while.

## Troubleshooting

### "R2_BUCKET not configured" warning

- Check that all environment variables are set correctly
- Restart your development server after adding env vars
- For production, ensure variables are set in your hosting platform

### "Forbidden: Hotlinking not allowed" error

- Check that `ALLOWED_MEDIA_DOMAINS` includes your domain
- Ensure requests include proper `Origin` or `Referer` headers
- In development, `localhost` is automatically allowed

### Images not displaying

1. Check browser console for errors
2. Verify the R2 key exists: check Cloudflare R2 dashboard
3. Check server logs for R2 fetch errors
4. Ensure the media route is accessible: `/api/media/...`

### Upload fails

1. Verify R2 credentials are correct
2. Check bucket name matches exactly
3. Ensure API token has **Object Read & Write** permissions
4. Check account ID is correct (no extra spaces)

## Security Notes

- **Never commit** R2 credentials to git
- Keep your `R2_SECRET_ACCESS_KEY` secure
- The bucket should remain **private** - images are served through your app
- Anti-hotlink protection prevents direct linking from other sites
- Consider rotating API tokens periodically

## Cost

Cloudflare R2 pricing (as of 2024):
- **Free tier**: 10 GB storage, 1M Class A operations (writes), 10M Class B operations (reads) per month
- **After free tier**: $0.015/GB storage, $4.50/million Class A, $0.36/million Class B

For most applications, the free tier is sufficient.

## Step 8: Deploy CDN Worker (Optional but Recommended)

The CDN worker serves media directly from R2 with signed URLs for better performance and caching.

### Prerequisites

- R2 bucket created (Step 1)
- Custom domain configured for R2 (e.g., `cdn.kickdashboard.com`)

### Deploy the Worker

1. **Install Wrangler CLI** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Generate a signing secret** (for URL signing):
   ```bash
   # Generate a random 32-byte secret (base64)
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Save this secret - you'll need it in the next steps.

4. **Set the signing secret in Cloudflare**:
   ```bash
   cd cloudflare/cdn-worker
   wrangler secret put SIGNING_SECRET
   ```
   When prompted, paste the secret you generated in step 3.

5. **Deploy the worker**:
   ```bash
   wrangler deploy
   ```

6. **Configure custom domain** (if not already done):
   - Go to Cloudflare Dashboard → Workers & Pages → kickdashboard
   - Go to **Triggers** → **Custom Domains**
   - Add custom domain: `cdn.kickdashboard.com`
   - Ensure DNS CNAME record points to the worker

### Configure Environment Variables

Add these to your Next.js app (Railway/production):

```bash
# CDN Configuration (optional - enables CDN serving)
MEDIA_CDN_BASE_URL=https://cdn.kickdashboard.com
MEDIA_CDN_SIGNING_SECRET=<same secret you set in step 4>
```

**Important**: The `MEDIA_CDN_SIGNING_SECRET` must match the `SIGNING_SECRET` you set in the Cloudflare Worker.

### Verify CDN Setup

1. Upload an avatar image
2. Check the image URL - it should redirect to `cdn.kickdashboard.com` with signed query params
3. The CDN URL should work and serve the image
4. Check Cloudflare Worker logs for any errors

### Troubleshooting CDN Worker

#### HTTP 500 Errors

**First, check the actual error message:**

1. **View Worker Logs**:
   - Go to Cloudflare Dashboard → Workers & Pages → kickdashboard
   - Click on **Logs** tab (or use the Observability section)
   - Look for recent invocations with errors
   - The error message will tell you exactly what's wrong

2. **Common Causes & Fixes**:

   **"Worker misconfigured: SIGNING_SECRET missing"**
   - Fix: Set the secret: `cd cloudflare/cdn-worker && wrangler secret put SIGNING_SECRET`
   
   **"Worker misconfigured: MEDIA_BUCKET binding missing"**
   - Fix: Check `wrangler.toml` has `[[r2_buckets]]` section with correct bucket name
   - Redeploy: `wrangler deploy`
   
   **"R2 fetch failed: ..."**
   - Check bucket name matches exactly (case-sensitive)
   - Verify bucket exists in your Cloudflare account
   - Check R2 bucket permissions
   
   **"Worker error: Unknown error"**
   - Check full error in Cloudflare dashboard logs
   - Verify all environment variables are set correctly

3. **Verify Configuration**:
   - Go to Workers & Pages → kickdashboard → Settings → Variables
   - Check that `SIGNING_SECRET` is set (it won't show the value, just that it exists)
   - Check that R2 bucket binding `MEDIA_BUCKET` exists

4. **Test Worker Directly**:
   ```bash
   # Test locally (requires wrangler dev setup)
   cd cloudflare/cdn-worker
   wrangler dev
   ```
   Then test a URL: `http://localhost:8787/avatars/123/1234567890_abc.webp?exp=9999999999&sig=...`

#### Common Issues

- **"Worker misconfigured: SIGNING_SECRET missing"**: Set the secret using `wrangler secret put SIGNING_SECRET`
- **"Worker misconfigured: MEDIA_BUCKET binding missing"**: Check `wrangler.toml` has the R2 bucket binding configured
- **"Not Found" errors**: The object doesn't exist in R2 - check the key path matches what was uploaded
- **"Forbidden" errors**: Signature verification failed - ensure `MEDIA_CDN_SIGNING_SECRET` matches the worker's `SIGNING_SECRET`

## Next Steps

- Monitor R2 usage in Cloudflare dashboard
- Set up R2 lifecycle rules if needed (auto-delete old avatars)
- Consider adding image optimization/compression
- Monitor CDN Worker performance and errors
