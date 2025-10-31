# Connected Accounts Implementation

## Overview
A new "Connected Accounts" tab has been added to the profile page, allowing users to connect Discord, Telegram, and view their Kick account connection status.

## Database Schema Changes

The following fields have been added to the `User` model:
- `discord_user_id` (String, nullable)
- `discord_username` (String, nullable)
- `discord_access_token_hash` (String, nullable)
- `telegram_user_id` (String, nullable)
- `telegram_username` (String, nullable)
- `telegram_access_token_hash` (String, nullable)
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

## API Endpoints Created

1. **GET `/api/connected-accounts`**: Fetch connected accounts for a user
   - Query param: `kick_user_id`

2. **POST `/api/connected-accounts/disconnect`**: Disconnect an account
   - Body: `{ kick_user_id, provider }`
   - Provider can be: `'discord'` or `'telegram'`

3. **POST `/api/oauth/discord/connect`**: Initiate Discord OAuth flow
   - Body: `{ kick_user_id }`
   - Returns: `{ authUrl }`

4. **GET `/api/oauth/discord/callback`**: Discord OAuth callback handler
   - Handles the OAuth callback and saves Discord connection

5. **POST `/api/oauth/telegram/connect`**: Initiate Telegram connection
   - Body: `{ kick_user_id }`
   - Returns: `{ authUrl, botUsername }`

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
