# Profile Settings Panel - Complete Technical Documentation

This document provides a comprehensive breakdown of the Profile Settings panel in the Kick Dashboard, including all tabs, options, frontend components, API endpoints, and database tables.

## Overview

The Profile Settings panel is accessed at `/profile` (the `/settings` route redirects to `/profile`). It provides a tabbed interface with up to 6 tabs depending on user permissions:

1. **General** - Profile picture, account info, referral codes
2. **Preferences** - Theme, notifications
3. **Connected Accounts** - Social media connections
4. **Achievements** - View and claim achievements
5. **Security** - Authentication info, session management, disconnect
6. **Admin Tools** - (Only visible to admin users) User management

---

## Authentication System

### How Authentication Works

All authenticated API calls use the `getAuthenticatedUser()` function from `lib/auth.ts`.

**Token Sources (in priority order):**
1. `Authorization: Bearer <token>` header
2. `?access_token=<token>` query parameter
3. `kick_access_token` cookie

**Authentication Flow:**
1. Token is extracted from request
2. Token is validated against Kick API (`GET https://api.kick.com/public/v1/users`)
3. If 401, attempt token refresh using stored `refresh_token_encrypted`
4. User is looked up in database by `kick_user_id`
5. Returns `{ kickUserId: bigint, userId: bigint }` or `null`

**Database Table:** `platform_users` (mapped as `User` in Prisma)

---

## Tab 1: General

### 1.1 Profile Picture Section

**UI Elements:**
- Current profile picture display (100x100)
- "Change Picture" button (file input)
- "Remove" button (if custom picture exists)

**Allowed File Types:** `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/webp`
**Max File Size:** 2MB
**Output Format:** WebP, 256x256 pixels

#### API Endpoint: Upload Profile Picture

```
POST /api/profile/upload-picture
Content-Type: multipart/form-data
Authorization: Bearer <access_token>

FormData:
  - image: File
```

**Backend Process:**
1. Authenticate user via `getAuthenticatedUser()`
2. Validate file type and size
3. Process image with `sharp`: resize to 256x256, convert to WebP
4. Upload to Cloudflare R2: `avatars/<kickUserId>/<timestamp>_<random>.webp`
5. Store URL in database

**Database Update:**
```sql
UPDATE platform_users 
SET custom_profile_picture_url = '<r2_url>'
WHERE kick_user_id = <kick_user_id>
```

**Response:**
```json
{
  "success": true,
  "url": "https://cdn.example.com/media/avatars/...",
  "message": "Profile picture uploaded and saved successfully"
}
```

---

### 1.2 Account Overview

**UI Elements:**
- Username (read-only, from Kick)
- Email (read-only, from Kick)
- "Signed in with Kick" badge
- Quick stats: User ID, Account Type, Status

#### API Endpoint: Get User Data

```
GET /api/user?access_token=<token>
```

**Backend Process:**
1. Validate token with Kick API
2. Fetch user from Kick API: `GET https://api.kick.com/public/v1/users`
3. Update local database with latest info

**Database Update:**
```sql
UPDATE platform_users 
SET 
  username = '<username>',
  email = '<email>',
  profile_picture_url = '<kick_profile_picture>'
WHERE kick_user_id = <kick_user_id>
```

**Response:**
```json
{
  "id": 12345,
  "username": "example_user",
  "email": "user@example.com",
  "profile_picture": "https://...",
  "referral_code": "EXAMPLE_USER"
}
```

---

### 1.3 Account Information

**UI Elements:**
- Username (disabled input)
- Email Address (disabled input)
- Display Name (disabled input)
- Bio (disabled textarea, if available)

*Note: All fields are read-only as they are managed by Kick.*

---

### 1.4 Referral Code Section

**UI Elements:**
- Your Referral Code display + Copy button
- Your Referral Link display + Copy button
- Add Referral Code input (if eligible)
- Referrer info display (if referred)

**Referral Code Format:** Username in uppercase (e.g., `EXAMPLE_USER`)
**Referral Link Format:** `https://kickdashboard.com/signup?ref=<USERNAME>`

#### API Endpoint: Check Referral Status

```
GET /api/referrals/check
Authorization: Bearer <access_token>
```

**Backend Process:**
1. Authenticate user
2. Check if user has existing referral in `platform_referrals`
3. Check if account is within 24 hours of creation

**Database Query:**
```sql
SELECT r.*, ref.username as referrer_username
FROM platform_referrals r
JOIN platform_users ref ON r.referrer_user_id = ref.id
WHERE r.referee_user_id = <user_id>
```

**Response:**
```json
{
  "hasReferral": false,
  "canAddReferral": true,
  "accountAge": 3600000,
  "referrerUsername": null
}
```

#### API Endpoint: Add Referral Code

```
POST /api/referrals/set
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "referralCode": "REFERRER_USERNAME"
}
```

**Validation Rules:**
1. User must not already have a referral
2. Account must be < 24 hours old
3. Referrer username must exist
4. Cannot refer yourself

**Database Insert:**
```sql
INSERT INTO platform_referrals (referrer_user_id, referee_user_id, referral_code)
VALUES (<referrer_id>, <user_id>, '<CODE>')
```

**Database Tables:**
- `platform_referrals` - Stores referral relationships
- `platform_referral_rewards` - Stores referral rewards earned

---

## Tab 2: Preferences

### 2.1 Appearance

**UI Elements:**
- Theme toggle (Light/Dark mode)

*Note: Theme is stored in localStorage/cookies client-side via `ThemeProvider`*

---

### 2.2 Notifications

**UI Elements:**
- Push Notifications toggle
- Email Notifications toggle
- Save Settings button

#### API Endpoint: Get Preferences

```
GET /api/user/preferences
Authorization: Bearer <access_token>
```

**Database Query:**
```sql
SELECT 
  kick_user_id,
  username,
  profile_picture_url,
  custom_profile_picture_url,
  notifications_enabled,
  email_notifications_enabled,
  chat_font_size,
  chat_show_timestamps
FROM platform_users
WHERE kick_user_id = <kick_user_id>
```

**Response:**
```json
{
  "kick_user_id": "12345",
  "username": "example_user",
  "profile_picture_url": "https://...",
  "custom_profile_picture_url": null,
  "notifications_enabled": true,
  "email_notifications_enabled": false,
  "chat_font_size": "14px",
  "chat_show_timestamps": true
}
```

#### API Endpoint: Update Preferences

```
PATCH /api/user/preferences
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "notifications_enabled": true,
  "email_notifications_enabled": false,
  "custom_profile_picture_url": null,
  "chat_font_size": "14px",
  "chat_show_timestamps": true
}
```

**Database Update:**
```sql
UPDATE platform_users 
SET 
  notifications_enabled = <value>,
  email_notifications_enabled = <value>,
  custom_profile_picture_url = <value>,
  chat_font_size = <value>,
  chat_show_timestamps = <value>
WHERE kick_user_id = <kick_user_id>
```

**Response:**
```json
{
  "success": true,
  "preferences": {
    "kick_user_id": "12345",
    "custom_profile_picture_url": null,
    "notifications_enabled": true,
    "email_notifications_enabled": false,
    "chat_font_size": "14px",
    "chat_show_timestamps": true
  }
}
```

---

## Tab 3: Connected Accounts

### Available Providers

| Provider | Connection Method | Database Fields |
|----------|------------------|-----------------|
| Kick | Primary (always connected) | `kick_user_id`, `username`, `kick_connected` |
| Discord | OAuth 2.0 | `discord_user_id`, `discord_username`, `discord_connected`, `discord_access_token_hash` |
| Telegram | Widget callback | `telegram_user_id`, `telegram_username`, `telegram_connected`, `telegram_access_token_hash` |
| Twitter | OAuth 2.0 | `twitter_user_id`, `twitter_username`, `twitter_connected`, `twitter_access_token_hash` |
| Instagram | OAuth 2.0 | `instagram_user_id`, `instagram_username`, `instagram_connected`, `instagram_access_token_hash` |
| Razed | Chat verification | `razed_user_id`, `razed_username`, `razed_connected` |

---

### 3.1 Get Connected Accounts

```
GET /api/connected-accounts?kick_user_id=<id>
```

**Database Query:**
```sql
SELECT 
  kick_user_id, username, kick_connected,
  discord_connected, discord_username, discord_user_id,
  telegram_connected, telegram_username, telegram_user_id,
  twitter_connected, twitter_username, twitter_user_id,
  instagram_connected, instagram_username, instagram_user_id,
  razed_connected, razed_username, razed_user_id
FROM platform_users
WHERE kick_user_id = <kick_user_id>
```

**Response:**
```json
{
  "accounts": [
    { "provider": "kick", "connected": true, "username": "user", "userId": "12345" },
    { "provider": "discord", "connected": false },
    { "provider": "telegram", "connected": true, "username": "user_tg", "userId": "67890" },
    { "provider": "twitter", "connected": false },
    { "provider": "instagram", "connected": false },
    { "provider": "razed", "connected": false }
  ]
}
```

---

### 3.2 Connect Discord

**Step 1: Initiate Connection**
```
POST /api/oauth/discord/connect
Content-Type: application/json

{ "kick_user_id": 12345 }
```

**Response:**
```json
{
  "authUrl": "https://discord.com/api/oauth2/authorize?client_id=...&redirect_uri=...&state=..."
}
```

**Step 2: OAuth Callback**
```
GET /api/oauth/discord/callback?code=<code>&state=<base64_state>
```

**Callback Process:**
1. Decode state to get `kick_user_id`
2. Exchange code for access token with Discord
3. Fetch Discord user info
4. Update database
5. Trigger achievement evaluation

**Database Update:**
```sql
UPDATE platform_users 
SET 
  discord_connected = true,
  discord_user_id = '<discord_id>',
  discord_username = '<discord_username>',
  discord_access_token_hash = '<hashed_token>'
WHERE kick_user_id = <kick_user_id>
```

**Achievement Unlocked:** `DISCORD_CONNECTED` (+25 Sweet Coins)

---

### 3.3 Connect Telegram

**Step 1: Show Widget**
Frontend renders Telegram Login Widget with callback URL:
```
/api/tg-auth/callback?kick_user_id=<id>
```

**Step 2: Widget Callback**
```
GET /api/tg-auth/callback?
  id=<telegram_id>&
  username=<username>&
  first_name=<name>&
  auth_date=<timestamp>&
  hash=<hmac_signature>&
  kick_user_id=<kick_id>
```

**Callback Process:**
1. Verify HMAC-SHA256 signature with bot token
2. Extract Telegram user data
3. Update database

**Database Update:**
```sql
UPDATE platform_users 
SET 
  telegram_connected = true,
  telegram_user_id = '<telegram_id>',
  telegram_username = '<username>'
WHERE kick_user_id = <kick_user_id>
```

**Achievement Unlocked:** `TELEGRAM_CONNECTED` (+25 Sweet Coins)

---

### 3.4 Connect Twitter (X)

**Step 1: Initiate Connection**
```
POST /api/oauth/twitter/connect
Content-Type: application/json

{ "kick_user_id": 12345 }
```

**Step 2: OAuth Callback**
```
GET /api/oauth/twitter/callback?code=<code>&state=<base64_state>
```

**Database Update:**
```sql
UPDATE platform_users 
SET 
  twitter_connected = true,
  twitter_user_id = '<twitter_id>',
  twitter_username = '<twitter_username>',
  twitter_access_token_hash = '<hashed_token>'
WHERE kick_user_id = <kick_user_id>
```

**Achievement Unlocked:** `TWITTER_CONNECTED` (+100 Sweet Coins)

---

### 3.5 Connect Instagram

**Step 1: Initiate Connection**
```
POST /api/oauth/instagram/connect
Content-Type: application/json

{ "kick_user_id": 12345 }
```

**Step 2: OAuth Callback**
```
GET /api/oauth/instagram/callback?code=<code>&state=<base64_state>
```

**Database Update:**
```sql
UPDATE platform_users 
SET 
  instagram_connected = true,
  instagram_user_id = '<instagram_id>',
  instagram_username = '<instagram_username>',
  instagram_access_token_hash = '<hashed_token>'
WHERE kick_user_id = <kick_user_id>
```

**Achievement Unlocked:** `INSTAGRAM_CONNECTED` (+100 Sweet Coins)

---

### 3.6 Connect Razed

**Step 1: Generate Verification Code**
```
POST /api/oauth/razed/connect
Content-Type: application/json

{
  "kick_user_id": 12345,
  "razed_username": "razed_user"
}
```

**Response:**
```json
{
  "success": true,
  "verification_code": "ABC123XYZ",
  "expires_at": "2025-01-08T12:00:00Z",
  "message": "Please send \"ABC123XYZ\" in Razed chat to verify your account."
}
```

**Database Insert:**
```sql
INSERT INTO platform_razed_verifications 
  (kick_user_id, razed_username, verification_code, expires_at, status)
VALUES 
  (<kick_user_id>, '<username>', '<code>', '<expires>', 'pending')
```

**Step 2: Poll Verification Status**
```
GET /api/oauth/razed/status?code=<verification_code>
```

*The user sends the code in Razed chat, and a bot/webhook verifies it.*

**Database Update on Verification:**
```sql
-- Update verification record
UPDATE platform_razed_verifications 
SET status = 'verified', verified_at = NOW()
WHERE verification_code = '<code>'

-- Update user record
UPDATE platform_users 
SET 
  razed_connected = true,
  razed_user_id = '<razed_id>',
  razed_username = '<razed_username>'
WHERE kick_user_id = <kick_user_id>
```

---

### 3.7 Disconnect Account

```
POST /api/connected-accounts/disconnect
Content-Type: application/json

{
  "kick_user_id": 12345,
  "provider": "discord"
}
```

**Note:** Kick account cannot be disconnected (returns 400 error).

**Database Update (example for Discord):**
```sql
UPDATE platform_users 
SET 
  discord_connected = false,
  discord_user_id = NULL,
  discord_username = NULL,
  discord_access_token_hash = NULL
WHERE kick_user_id = <kick_user_id>
```

---

## Tab 4: Achievements

### Achievement Categories

| Category | Achievements |
|----------|-------------|
| Streams | Stream Starter, Getting Cozy, Dedicated Viewer, Stream Veteran, Ride or Die, Multi-Stream Hopper |
| Community | Dashboard Addict, Discord Connected, Telegram Connected, Twitter Connected, Instagram Connected, Custom Profile Picture |
| Chat | First Words, Chatterbox, Emote Master, Super Social, Daily Chatter |
| Leaderboard | Top G Chatter |
| Special | OG Dash, SF Legend of the Month |

### Achievement Status States

| State | Description |
|-------|-------------|
| `LOCKED` | Not yet unlocked |
| `UNLOCKED` | Conditions met, can be claimed |
| `CLAIMED` | Reward already claimed |

---

### 4.1 Get Achievements

```
GET /api/achievements?access_token=<token>
```

**Backend Process (via `getAchievementStatuses()`):**
1. Authenticate user
2. Call `evaluateAchievementsForUser()` to compute and persist unlock states
3. Query `platform_user_achievements` for current status
4. Check `platform_sweet_coin_history` for legacy claims

**Database Queries:**
```sql
-- Get user data for evaluation
SELECT id, created_at, discord_connected, telegram_connected, 
       twitter_connected, instagram_connected, custom_profile_picture_url
FROM platform_users WHERE id = <user_id>

-- Get user sweet coins
SELECT total_sweet_coins, total_emotes 
FROM platform_user_sweet_coins WHERE user_id = <user_id>

-- Get chat messages count
SELECT COUNT(*) FROM platform_chat_messages 
WHERE sender_user_id = <kick_user_id> AND sent_when_offline = false

-- Get achievement status
SELECT achievement_id, status, unlocked_at, claimed_at
FROM platform_user_achievements WHERE user_id = <user_id>
```

**Response:**
```json
{
  "achievements": [
    { "id": "discord-connected", "unlocked": true, "claimed": false, "status": "UNLOCKED" },
    { "id": "first-words", "unlocked": true, "claimed": true, "status": "CLAIMED" },
    { "id": "stream-veteran", "unlocked": false, "claimed": false, "status": "LOCKED" }
  ]
}
```

---

### 4.2 Claim Achievement

```
POST /api/achievements/claim?access_token=<token>
Content-Type: application/json

{ "achievementId": "discord-connected" }
```

**Validation:**
1. Check achievement exists
2. Verify achievement is unlocked
3. Check not already claimed (idempotency via unique `message_id`)

**Database Transaction:**
```sql
-- 1. Create sweet coin history entry (idempotent)
INSERT INTO platform_sweet_coin_history 
  (user_id, stream_session_id, sweet_coins_earned, message_id, earned_at)
VALUES 
  (<user_id>, NULL, <reward>, 'achievement:DISCORD_CONNECTED:<user_id>', NOW())

-- 2. Update user sweet coins
UPDATE platform_user_sweet_coins 
SET total_sweet_coins = total_sweet_coins + <reward>
WHERE user_id = <user_id>

-- 3. Update achievement status to CLAIMED
UPDATE platform_user_achievements 
SET status = 'CLAIMED', claimed_at = NOW()
WHERE user_id = <user_id> AND achievement_id = 'DISCORD_CONNECTED'
```

**Response:**
```json
{
  "claimed": true,
  "alreadyClaimed": false,
  "sweetCoinsAwarded": 25,
  "balance": 150
}
```

---

### Achievement Unlock Conditions (from `achievements-engine.ts`)

| Achievement ID | Condition |
|---------------|-----------|
| `STREAM_STARTER` | `totalWatchMinutes >= 30` |
| `GETTING_COZY` | `totalWatchMinutes >= 120` |
| `DEDICATED_VIEWER` | `totalWatchMinutes >= 600` |
| `STREAM_VETERAN` | `totalWatchMinutes >= 3000` |
| `RIDE_OR_DIE` | `totalWatchMinutes >= 12000` |
| `MULTI_STREAM_HOPPER` | `recentSessionCount >= 2` (in 24h) |
| `DASHBOARD_ADDICT` | `loginDaysThisMonth >= 7` |
| `DISCORD_CONNECTED` | `user.discord_connected === true` |
| `TELEGRAM_CONNECTED` | `user.telegram_connected === true` |
| `TWITTER_CONNECTED` | `user.twitter_connected === true` |
| `INSTAGRAM_CONNECTED` | `user.instagram_connected === true` |
| `CUSTOM_PROFILE_PICTURE` | `user.custom_profile_picture_url` is set |
| `FIRST_WORDS` | `totalMessages >= 1` |
| `CHATTERBOX` | `totalMessages >= 1000` |
| `EMOTE_MASTER` | `totalEmotes >= 1500` |
| `SUPER_SOCIAL` | `totalMessages >= 4000` |
| `DAILY_CHATTER` | `dailyChatDaysCount >= 7` |
| `TOP_G_CHATTER` | In top 3 by total_sweet_coins |
| `OG_DASH` | < 100 users created before this user |
| `SF_LEGEND_OF_THE_MONTH` | Highest points this month |

---

## Tab 5: Security

### 5.1 Authentication Info

**UI Elements:**
- Kick OAuth status badge (Active)
- Account identifier display

*This is read-only information.*

---

### 5.2 Session Management

**UI Elements:**
- Current Session indicator (Active Now)

*Note: Detailed session listing from `platform_user_sessions` table is not currently exposed in UI.*

---

### 5.3 Danger Zone

**UI Elements:**
- Disconnect Account button

**Action:** Client-side only
```javascript
localStorage.removeItem('kick_access_token')
localStorage.removeItem('kick_refresh_token')
window.location.href = '/login'
```

*This logs the user out by clearing local tokens. The database record is preserved.*

---

## Tab 6: Admin Tools (Admin Only)

### Visibility Condition

Tab only appears if `isAdminUser === true`, verified via:

```
GET /api/admin/verify
Authorization: Bearer <access_token>
```

**Response:**
```json
{ "is_admin": true }
```

**Database Check:**
```sql
SELECT is_admin FROM platform_users WHERE kick_user_id = <kick_user_id>
```

---

### 6.1 User Search

```
GET /api/admin/users?limit=25&offset=0&search=<username>
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "users": [
    {
      "kick_user_id": "12345",
      "username": "example_user",
      "is_admin": false,
      "is_excluded": false,
      "moderator_override": null
    }
  ]
}
```

---

### 6.2 Update User Flags

```
PUT /api/admin/users
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "kick_user_id": "12345",
  "is_admin": true,
  "is_excluded": false,
  "moderator_override": true
}
```

**Available Flags:**
| Flag | Type | Description |
|------|------|-------------|
| `is_admin` | boolean | Full admin access |
| `is_excluded` | boolean | Excluded from leaderboards |
| `moderator_override` | boolean/null | Force mod status (null = auto-detect) |

**Database Update:**
```sql
UPDATE platform_users 
SET 
  is_admin = <value>,
  is_excluded = <value>,
  moderator_override = <value>
WHERE kick_user_id = <kick_user_id>
```

---

### 6.3 Award/Deduct Sweet Coins

```
POST /api/admin/users/award-sweet-coins
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "kick_user_id": "12345",
  "sweet_coins": 100,
  "reason": "Manual adjustment"
}
```

*Use negative values to deduct.*

**Database Transaction:**
```sql
-- 1. Update sweet coins balance
UPDATE platform_user_sweet_coins 
SET total_sweet_coins = total_sweet_coins + <amount>
WHERE user_id = (SELECT id FROM platform_users WHERE kick_user_id = <kick_user_id>)

-- 2. Create history entry
INSERT INTO platform_sweet_coin_history 
  (user_id, sweet_coins_earned, message_id, earned_at)
VALUES 
  (<user_id>, <amount>, 'admin:<uuid>', NOW())

-- 3. Create ledger entry (optional)
INSERT INTO platform_coin_ledger 
  (user_id, amount, reason, ref_id)
VALUES 
  (<user_id>, <amount>, 'admin_award', '<unique_ref>')
```

---

## Database Schema Summary

### Primary Tables

| Table | Purpose |
|-------|---------|
| `platform_users` | User profiles, preferences, connected accounts |
| `platform_user_sweet_coins` | User sweet coin balances |
| `platform_sweet_coin_history` | Sweet coin transaction history |
| `platform_user_achievements` | Achievement status per user |
| `platform_achievement_definitions` | Achievement metadata |
| `platform_referrals` | Referral relationships |
| `platform_referral_rewards` | Referral tier rewards |
| `platform_razed_verifications` | Razed verification codes |
| `platform_user_sessions` | User session tracking |
| `platform_coin_ledger` | Detailed coin transactions |

### Key User Table Columns

```prisma
model User {
  // Core Identity
  id                          BigInt    @id @default(autoincrement())
  kick_user_id                BigInt    @unique
  username                    String
  email                       String?
  
  // Profile
  profile_picture_url         String?   // From Kick
  custom_profile_picture_url  String?   // User uploaded
  bio                         String?
  
  // Preferences
  notifications_enabled       Boolean   @default(true)
  email_notifications_enabled Boolean   @default(false)
  chat_font_size              String?   @default("14px")
  chat_show_timestamps        Boolean   @default(true)
  
  // Connected Accounts
  discord_user_id             String?
  discord_username            String?
  discord_connected           Boolean   @default(false)
  discord_access_token_hash   String?
  
  telegram_user_id            String?
  telegram_username           String?
  telegram_connected          Boolean   @default(false)
  telegram_access_token_hash  String?
  
  twitter_user_id             String?
  twitter_username            String?
  twitter_connected           Boolean   @default(false)
  twitter_access_token_hash   String?
  
  instagram_user_id           String?
  instagram_username          String?
  instagram_connected         Boolean   @default(false)
  instagram_access_token_hash String?
  
  razed_user_id               String?
  razed_username              String?
  razed_connected             Boolean   @default(false)
  
  // Admin & Moderation
  is_admin                    Boolean   @default(false)
  is_excluded                 Boolean   @default(false)
  moderator_override          Boolean?
  
  // Auth Tokens (encrypted)
  access_token_hash           String?
  refresh_token_hash          String?
  access_token_encrypted      String?
  refresh_token_encrypted     String?
  
  // Timestamps
  created_at                  DateTime  @default(now())
  updated_at                  DateTime  @updatedAt
}
```

---

## Environment Variables Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DISCORD_CLIENT_ID` | Discord OAuth app ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth secret |
| `DISCORD_REDIRECT_URI` | Discord callback URL |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for auth |
| `TWITTER_CLIENT_ID` | Twitter OAuth app ID |
| `TWITTER_CLIENT_SECRET` | Twitter OAuth secret |
| `INSTAGRAM_CLIENT_ID` | Instagram OAuth app ID |
| `INSTAGRAM_CLIENT_SECRET` | Instagram OAuth secret |
| `KICK_CLIENT_ID` | Kick OAuth app ID |
| `KICK_CLIENT_SECRET` | Kick OAuth secret |
| `TOKEN_ENCRYPTION_KEY` | AES key for token encryption |
| `R2_ACCOUNT_ID` | Cloudflare R2 account |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket |
| `NEXT_PUBLIC_APP_URL` | Base URL for callbacks |

---

## Frontend Component Structure

```
app/(app)/profile/page.tsx
├── State Management
│   ├── userData - User info from Kick API
│   ├── notifications - Push notification preference
│   ├── emailNotifications - Email preference
│   ├── customProfilePicture - Custom profile picture URL
│   ├── connectedAccounts - Array of connected accounts
│   ├── achievementStatuses - Map of achievement statuses
│   └── isAdminUser - Admin status
├── Tab Navigation
│   ├── General
│   ├── Preferences
│   ├── Connected Accounts
│   ├── Achievements
│   ├── Security
│   └── Admin Tools (conditional)
└── Modals
    └── Razed Verification Modal
```

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/user` | Fetch user data from Kick |
| GET | `/api/user/preferences` | Get user preferences |
| PATCH | `/api/user/preferences` | Update user preferences |
| POST | `/api/profile/upload-picture` | Upload profile picture |
| GET | `/api/connected-accounts` | Get connected accounts |
| POST | `/api/connected-accounts/disconnect` | Disconnect account |
| POST | `/api/oauth/discord/connect` | Start Discord OAuth |
| GET | `/api/oauth/discord/callback` | Discord OAuth callback |
| POST | `/api/oauth/twitter/connect` | Start Twitter OAuth |
| GET | `/api/oauth/twitter/callback` | Twitter OAuth callback |
| POST | `/api/oauth/instagram/connect` | Start Instagram OAuth |
| GET | `/api/oauth/instagram/callback` | Instagram OAuth callback |
| POST | `/api/oauth/razed/connect` | Generate Razed code |
| GET | `/api/oauth/razed/status` | Check Razed verification |
| GET | `/api/tg-auth/callback` | Telegram auth callback |
| GET | `/api/referrals/check` | Check referral status |
| POST | `/api/referrals/set` | Add referral code |
| GET | `/api/achievements` | Get achievement statuses |
| POST | `/api/achievements/claim` | Claim achievement |
| GET | `/api/admin/verify` | Verify admin status |
| GET | `/api/admin/users` | Search users (admin) |
| PUT | `/api/admin/users` | Update user flags (admin) |
| POST | `/api/admin/users/award-sweet-coins` | Award coins (admin) |

---

This documentation provides everything needed to recreate the Profile Settings panel from scratch, assuming the database schema already exists.

