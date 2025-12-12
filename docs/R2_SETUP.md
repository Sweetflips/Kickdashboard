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

## Next Steps

- Monitor R2 usage in Cloudflare dashboard
- Set up R2 lifecycle rules if needed (auto-delete old avatars)
- Consider adding image optimization/compression
- Add CDN caching if needed (Cloudflare CDN can cache R2 objects)
