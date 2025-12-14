# Cloudflare MCP API Token Scopes

## Required Permissions

For the Cloudflare MCP server to work with your `kickdashboard.com` project, create an API token with the following minimum scopes:

### Account Permissions

These are required for managing Workers and R2 resources:

- **Workers Scripts**: `Edit`
  - Needed to deploy and manage the CDN worker (`kickdashboard`)
  
- **Workers Routes**: `Edit`
  - Needed to configure routes for `cdn.kickdashboard.com/*`
  
- **R2**: `Edit`
  - Needed to read/write objects in the `sweetflips-media` bucket
  - Required for media uploads and CDN worker operations

### Zone Permissions

These are required for DNS management on `kickdashboard.com`:

- **DNS**: `Edit`
  - Needed to manage DNS records (`www`, `@`, `cdn` CNAMEs)
  - Required for worker route configuration

## Creating the Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use **Edit Cloudflare Workers** template as a base, then customize:
   - Add **R2** permissions (Account level)
   - Add **DNS** permissions (Zone level, select `kickdashboard.com`)
4. Set **Account Resources** to include your account
5. Set **Zone Resources** to include `kickdashboard.com`
6. Click **Continue to summary** then **Create Token**
7. **Copy the token immediately** - you won't see it again

## Setting the Token

After creating the token, set it as a Windows environment variable:

```powershell
[System.Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'your_token_here', [System.EnvironmentVariableTarget]::User)
```

Then restart Cursor for the MCP server to pick it up.

## Account ID

Your Cloudflare Account ID is: `5ccd33097e8392aae2f801dea6fec575`

This is already configured in `mcp.json` and matches your `R2_ACCOUNT_ID` in the project docs.

## Security Notes

- **Rotate tokens periodically** (every 90 days recommended)
- **Never commit tokens to git**
- **Use minimum required permissions** (the scopes above)
- If a token is exposed, revoke it immediately and create a new one


