# Cloudflare Setup Verification Checklist

Use this checklist to verify your Cloudflare configuration matches the project requirements.

## MCP Configuration ✅

- [x] `mcp.json` uses correct Cloudflare MCP server package: `@cloudflare/mcp-server-cloudflare`
- [x] Account ID matches: `5ccd33097e8392aae2f801dea6fec575`
- [x] Secrets removed from `mcp.json` (now use Windows environment variables)
- [ ] `CLOUDFLARE_API_TOKEN` set as Windows user environment variable
- [ ] Cursor restarted after setting environment variables

**See**: `c:\Users\Amor\.cursor\MCP_ENV_SETUP.md` for setup instructions

## API Token Scopes ✅

Your Cloudflare API token must have these permissions:

**Account Level:**
- [ ] Workers Scripts: Edit
- [ ] Workers Routes: Edit
- [ ] R2: Edit

**Zone Level (kickdashboard.com):**
- [ ] DNS: Edit

**See**: `docs/CLOUDFLARE_MCP_TOKEN_SCOPES.md` for detailed instructions

## Zone Configuration

- [ ] Zone `kickdashboard.com` exists in Cloudflare dashboard
- [ ] Zone is active and not paused

## DNS Records

Verify these DNS records exist in Cloudflare:

- [ ] `www` → CNAME → `[your-railway-service].up.railway.app` (Proxied ✅)
- [ ] `@` → CNAME/A → Railway domain/IP (Proxied ✅)
- [ ] `cdn` → CNAME → Worker route (handled automatically by Worker route)

**Note**: The `cdn` subdomain is handled by the Worker route configuration, not a direct DNS record.

## SSL/TLS Configuration

- [ ] SSL/TLS encryption mode set to **Full** (not Full Strict)
- [ ] Always Use HTTPS enabled
- [ ] Automatic HTTPS Rewrites enabled

**Important**: Use "Full" mode (not "Full Strict") because Railway uses Let's Encrypt certificates.

## R2 Bucket

- [ ] Bucket `sweetflips-media` exists
- [ ] Bucket is **private** (not public)
- [ ] R2 API token has read/write access to this bucket

## CDN Worker Configuration

### Worker Deployment

- [ ] Worker `kickdashboard` deployed to Cloudflare
- [ ] Worker route configured: `cdn.kickdashboard.com/*`
- [ ] Route zone: `kickdashboard.com`

### Worker Secrets

- [ ] `SIGNING_SECRET` set via `wrangler secret put SIGNING_SECRET`
- [ ] Secret is base64-encoded 32-byte value

**Verify**: Check Worker logs - should not see "SIGNING_SECRET missing" errors

### Worker Bindings

- [ ] R2 bucket binding `MEDIA_BUCKET` → `sweetflips-media`
- [ ] Variable `PUBLIC_HOST` = `cdn.kickdashboard.com`

**Check**: `cloudflare/cdn-worker/wrangler.toml` matches your Cloudflare dashboard

## Next.js App Environment Variables

Set these in Railway (or your hosting platform):

- [ ] `MEDIA_CDN_BASE_URL=https://cdn.kickdashboard.com` (optional, enables CDN)
- [ ] `MEDIA_CDN_SIGNING_SECRET=<same value as Worker SIGNING_SECRET>` (required if CDN enabled)
- [ ] `R2_ACCOUNT_ID=5ccd33097e8392aae2f801dea6fec575`
- [ ] `R2_ACCESS_KEY_ID=<your-r2-access-key>`
- [ ] `R2_SECRET_ACCESS_KEY=<your-r2-secret-key>`
- [ ] `R2_BUCKET=sweetflips-media`
- [ ] `ALLOWED_MEDIA_DOMAINS=https://www.kickdashboard.com,https://kickdashboard.com`

**Critical**: `MEDIA_CDN_SIGNING_SECRET` must exactly match the Worker's `SIGNING_SECRET`

## Testing

### Test CDN Worker

1. Upload a test image via your app
2. Check the image URL - should redirect to `cdn.kickdashboard.com` with signed query params
3. Verify image loads correctly
4. Check Worker logs for errors

### Test Direct R2 Access

1. Access `/api/media/avatars/[user-id]/[filename]` directly
2. Should serve from R2 if CDN not configured, or redirect to CDN if configured
3. Verify anti-hotlink protection works (403 from different origin)

### Run Diagnostic

```bash
npm run diagnose:cloudflare
```

This will test:
- Health endpoint via Cloudflare
- API endpoints
- Direct Railway access
- Provides specific recommendations

## Common Issues

### Worker Returns 500 "SIGNING_SECRET missing"
- **Fix**: Run `cd cloudflare/cdn-worker && wrangler secret put SIGNING_SECRET`

### Worker Returns 500 "MEDIA_BUCKET binding missing"
- **Fix**: Check `wrangler.toml` has `[[r2_buckets]]` section, then redeploy

### Images Return 403 "Forbidden"
- **Fix**: Check `MEDIA_CDN_SIGNING_SECRET` matches Worker's `SIGNING_SECRET`
- **Fix**: Verify `ALLOWED_MEDIA_DOMAINS` includes your domain

### MCP Server Not Working
- **Fix**: Verify `CLOUDFLARE_API_TOKEN` is set as Windows environment variable
- **Fix**: Restart Cursor after setting environment variables
- **Fix**: Verify token has required scopes (see token scopes doc)

## Related Documentation

- `docs/CLOUDFLARE_SETUP.md` - Main Cloudflare setup guide
- `docs/R2_SETUP.md` - R2 and CDN worker detailed setup
- `docs/CLOUDFLARE_MCP_TOKEN_SCOPES.md` - API token scopes
- `cloudflare/cdn-worker/SET_SECRET.md` - Worker secret setup
- `c:\Users\Amor\.cursor\MCP_ENV_SETUP.md` - MCP environment variables








