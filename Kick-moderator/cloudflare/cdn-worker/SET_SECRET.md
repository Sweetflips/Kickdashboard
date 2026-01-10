# Setting SIGNING_SECRET for CDN Worker

## Quick Setup

1. **Generate a secret**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Copy the output.

2. **Set it in Cloudflare**:
   ```bash
   cd cloudflare/cdn-worker
   wrangler secret put SIGNING_SECRET
   ```
   When prompted, paste the secret.

3. **Add the same secret to your Next.js app** (Railway/production):
   ```
   MEDIA_CDN_SIGNING_SECRET=<paste the same secret here>
   ```

## Verify It's Set

After setting the secret, check the Worker logs. The 500 errors should change to more specific errors (like 404 if objects don't exist, or 403 if signatures don't match).

## Important

- The `SIGNING_SECRET` in the Worker must match `MEDIA_CDN_SIGNING_SECRET` in your Next.js app
- Secrets are encrypted and never shown in logs or dashboards
- You can update the secret anytime - just update both places
