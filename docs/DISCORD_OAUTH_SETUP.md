# Quick Setup Guide - Discord OAuth

## Add to `.env.local`

Add these lines to your `.env.local` file:

```env
DISCORD_CLIENT_ID=1416857158640865340
DISCORD_CLIENT_SECRET=fqW5kionWqu-nZ0QTvq_Ykh43ZyorWjx
DISCORD_REDIRECT_URI=http://localhost:3000/api/oauth/discord/callback
```

## Configure Discord Application

1. Go to https://discord.com/developers/applications
2. Select your application (Client ID: 1416857158640865340)
3. Navigate to **OAuth2** → **Redirects**
4. Click **Add Redirect**
5. Add: `http://localhost:3000/api/oauth/discord/callback`
6. For production, add: `https://yourdomain.com/api/oauth/discord/callback`
7. Save changes

## Required Scopes

Make sure your Discord application has these OAuth2 scopes enabled:
- `identify` - Get user's username and ID
- `email` - Get user's email (optional)

## Test Connection

1. Restart your development server after adding env variables
2. Navigate to Profile → Connected Accounts
3. Click "Connect" on Discord
4. Authorize the application
5. You should be redirected back and see Discord as connected
