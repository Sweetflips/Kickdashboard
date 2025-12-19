# Connected Accounts Implementation

## Overview
A new "Connected Accounts" tab has been added to the profile page, allowing users to connect Discord, Telegram, Twitter, Instagram and view their Kick account connection status.

## Database Schema Changes

The following fields have been added to the `User` model:
- `discord_user_id` (String, nullable)
- `discord_username` (String, nullable)
- `discord_access_token_hash` (String, nullable)
- `telegram_user_id` (String, nullable)
- `telegram_username` (String, nullable)
- `telegram_access_token_hash` (String, nullable)
- `twitter_user_id` (String, nullable)
- `twitter_username` (String, nullable)
- `twitter_access_token_hash` (String, nullable)
- `twitter_connected` (Boolean, default: false)
- `instagram_user_id` (String, nullable)
- `instagram_username` (String, nullable)
- `instagram_access_token_hash` (String, nullable)
- `instagram_connected` (Boolean, default: false)
- `kick_connected` (Boolean, default: true)
- `discord_connected` (Boolean, default: false)
- `telegram_connected` (Boolean, default: false)

## Required Environment Variables

### Discord OAuth
Add these to your `.env.local` file:

```
DISCORD_CLIENT_ID=1416857158640865340
DISCORD_CLIENT_SECRET=fqW5kionWqu-nZ0QTvq_Ykh43ZyorWjx
DISCORD_REDIRECT_URI=http://localhost:3000/api/oauth/discord/callback
```

**Important:** Make sure to add the redirect URI in your Discord application settings:
1. Go to https://discord.com/developers/applications
2. Select your application (Client ID: 1416857158640865340)
3. Go to "OAuth2" → "Redirects"
4. Add: `http://localhost:3000/api/oauth/discord/callback`
5. For production, also add: `https://yourdomain.com/api/oauth/discord/callback`

### Telegram OAuth
Add these to your `.env.local` file:

```
TELEGRAM_BOT_TOKEN=8043621475:AAEsKYIfU1MeN4xikV794z-UXSQLWV2FhsY
TELEGRAM_BOT_USERNAME=Sweetflipskickauthbot
```

**Note:** Telegram uses bot-based authentication. Users will need to interact with your bot to complete the connection.

### Twitter/X OAuth 2.0
Add these to your `.env.local` file:

```
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
TWITTER_REDIRECT_URI=http://localhost:3000/api/oauth/twitter/callback
```

**Setup instructions:**
1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new project and app (or use an existing one)
3. Go to "User authentication settings"
4. Enable OAuth 2.0
5. Set App permissions to "Read" (for `users.read` scope)
6. Set Type of App to "Web App, Automated App or Bot"
7. Add Callback URLs:
   - Development: `http://localhost:3000/api/oauth/twitter/callback`
   - Production: `https://yourdomain.com/api/oauth/twitter/callback`
8. Add Website URL (your app's URL)
9. Copy Client ID and Client Secret to your `.env`

**Note:** Twitter OAuth 2.0 uses PKCE (Proof Key for Code Exchange) for security. The implementation handles this automatically.

### Instagram OAuth
Add these to your `.env.local` file:

```
INSTAGRAM_CLIENT_ID=your_instagram_client_id
INSTAGRAM_CLIENT_SECRET=your_instagram_client_secret
INSTAGRAM_REDIRECT_URI=http://localhost:3000/api/oauth/instagram/callback
```

**Setup instructions:**
1. Go to https://developers.facebook.com/apps/
2. Create a new app (type: Consumer or Business)
3. Add Instagram Basic Display product
4. Configure redirect URIs
5. Copy App ID and App Secret

## API Endpoints Created

1. **GET `/api/connected-accounts`**: Fetch connected accounts for a user
   - Query param: `kick_user_id`

2. **POST `/api/connected-accounts/disconnect`**: Disconnect an account
   - Body: `{ kick_user_id, provider }`
   - Provider can be: `'discord'`, `'telegram'`, `'twitter'`, or `'instagram'`

3. **POST `/api/oauth/discord/connect`**: Initiate Discord OAuth flow
   - Body: `{ kick_user_id }`
   - Returns: `{ authUrl }`

4. **GET `/api/oauth/discord/callback`**: Discord OAuth callback handler
   - Handles the OAuth callback and saves Discord connection

5. **POST `/api/oauth/telegram/connect`**: Initiate Telegram connection
   - Body: `{ kick_user_id }`
   - Returns: `{ authUrl, botUsername }`

6. **GET/POST `/api/oauth/twitter/connect`**: Initiate Twitter OAuth 2.0 flow
   - GET: Reads `kick_user_id` from auth session or query param (allows direct link redirects)
   - POST Body: `{ kick_user_id }`
   - Returns: `{ authUrl }` (POST) or redirects directly (GET)

7. **GET `/api/oauth/twitter/callback`**: Twitter OAuth callback handler
   - Handles OAuth callback with PKCE verification
   - Saves Twitter connection data

8. **POST `/api/oauth/instagram/connect`**: Initiate Instagram OAuth flow
   - Body: `{ kick_user_id }`
   - Returns: `{ authUrl }`

9. **GET `/api/oauth/instagram/callback`**: Instagram OAuth callback handler
   - Handles the OAuth callback and saves Instagram connection

## Database Migration

Run the migration to add the new fields:
```bash
# If using Prisma directly
npx prisma migrate dev --name add_connected_accounts

# Or run the SQL migration directly
psql your_database < prisma/migrations/add_connected_accounts/migration.sql
```

## UI Features

- **Connected Accounts Tab**: New tab in profile settings
- **Account Cards**: Shows Kick (always connected), Discord, and Telegram
- **Connect/Disconnect Buttons**: Per account action buttons
- **Status Badges**: Visual indicators for connection status
- **Error Handling**: Success/error messages for OAuth flows
- **Logo Display**: Uses provided logos with fallback text

## Next Steps

1. **Set up Discord OAuth**:
   - Create Discord application
   - Add credentials to `.env`
   - Test the connection flow

2. **Set up Telegram OAuth**:
   - Create Telegram bot via @BotFather
   - Add bot token and username to `.env`
   - Optionally create a webhook handler for bot updates

3. **Run Database Migration**:
   - Apply the schema changes to your database

4. **Test the Flow**:
   - Navigate to Profile → Connected Accounts
   - Try connecting Discord account
   - Verify data is saved correctly

## Security Notes

- Access tokens are hashed before storage (SHA-256)
- OAuth state parameter prevents CSRF attacks
- User confirmation required for disconnection
- Kick account cannot be disconnected
