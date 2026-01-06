# Point Worker Architecture Guide

This document explains the current system architecture for the point-worker to understand when syncing with the main branch.

## Overview

The system has two parallel coin awarding paths:
1. **Webhook Path** (real-time) - Kick webhooks → Redis → instant UI updates
2. **Chat Worker Path** (queue-based) - Chat messages → PostgreSQL queue → worker → DB + Redis

## Database Schema (Key Tables)

### User Table (`users`)
- `id` (BigInt) - Internal user ID (used for coin tracking)
- `kick_user_id` (BigInt) - Kick's user ID (used for message sender identification)
- `username` (String)
- `is_excluded` (Boolean) - If true, don't award coins
- `kick_connected` (Boolean) - If false, don't award coins

### UserSweetCoins Table (`user_sweet_coins`)
- `user_id` (BigInt) - References `users.id` (internal ID)
- `total_sweet_coins` (Int) - Total coins balance
- `last_sweet_coin_earned_at` (DateTime) - For rate limiting (5 min cooldown)
- `is_subscriber` (Boolean)

### SweetCoinHistory Table (`sweet_coin_history`)
- `user_id` (BigInt) - References `users.id` (internal ID)
- `stream_session_id` (BigInt) - References `stream_sessions.id`
- `sweet_coins_earned` (Int) - Usually 1
- `message_id` (String) - Unique, prevents duplicate awards
- `earned_at` (DateTime)

### StreamSession Table (`stream_sessions`)
- `id` (BigInt) - Session ID
- `broadcaster_user_id` (BigInt) - References `users.kick_user_id`
- `channel_slug` (String)
- `ended_at` (DateTime?) - NULL if session is active
- `started_at` (DateTime)

### ChatMessage Table (`chat_messages`)
- `message_id` (String) - Unique message ID from Kick
- `stream_session_id` (BigInt?) - NULL if offline
- `sender_user_id` (BigInt) - Kick user ID (NOT internal ID)
- `broadcaster_user_id` (BigInt) - Kick user ID
- `sweet_coins_earned` (Int) - Coins awarded for this message
- `sent_when_offline` (Boolean)

### ChatJob Table (`chat_jobs`)
- Queue for chat worker to process
- `message_id` (String) - Unique
- `payload` (JSON) - Full message data
- `sender_user_id` (BigInt) - Kick user ID
- `broadcaster_user_id` (BigInt) - Kick user ID
- `stream_session_id` (BigInt?) - Session ID if resolved
- `status` (String) - pending/processing/completed/failed

## Redis Keys Structure

### Coin Balances
```
coins:{userId}  →  total balance (integer)
```
Where `userId` is the INTERNAL user ID (from `users.id`), NOT kick_user_id.

### Session Earnings
```
session:{sessionId}:{userId}  →  coins earned this session (integer)
```

### Leaderboard (Sorted Set)
```
leaderboard:{sessionId}  →  ZSET with userId as member, coins as score
```
- Members are INTERNAL user IDs (from `users.id`)
- Scores are total coins earned in that session

### Rate Limiting
```
rate:{userId}  →  timestamp of last award (milliseconds)
```
TTL: 300 seconds (5 minutes)

### Message Coin Awards
```
msg-coins:{messageId}  →  coins earned for this message
```
TTL: 3600 seconds (1 hour)

## Data Flow

### 1. Webhook Path (app/api/webhook/route.ts)
```
Kick Webhook → POST /api/webhook
    ↓
Verify signature
    ↓
Handle event type:
  - livestream.status.updated → create/end session
  - chat.message.sent → process message
    ↓
For chat messages:
  1. Resolve session (resolveSessionForChat)
  2. Buffer message in Redis (bufferMessage)
  3. If session active:
     - Upsert user in DB
     - Award coins via Redis (awardCoins from sweet-coins-redis.ts)
     - Store msg-coins:{messageId} in Redis
```

### 2. Chat Worker Path (scripts/chat-worker.ts)
```
Frontend → POST /api/chat/save → ChatJob queue
    ↓
Chat Worker polls queue (claimChatJobs)
    ↓
For each job:
  1. Upsert sender + broadcaster users
  2. Resolve session
  3. Save message to ChatMessage or OfflineChatMessage
  4. If session active:
     - Award coins via PostgreSQL (awardSweetCoins from sweet-coins.ts)
     - Also update Redis leaderboard (awardCoinsRedis)
```

## Key Functions

### lib/sweet-coins-redis.ts (Redis - Fast Path)
```typescript
awardCoins(userId: bigint, amount: number, sessionId: bigint | null)
// - Updates coins:{userId}
// - Updates session:{sessionId}:{userId}
// - Updates leaderboard:{sessionId} sorted set
// - Checks rate limit via rate:{userId}

getSessionLeaderboard(sessionId: bigint, limit: number)
// - Returns top users from leaderboard:{sessionId}

storeMessageCoinAward(messageId: string, coinsEarned: number)
// - Stores msg-coins:{messageId} for instant UI updates
```

### lib/sweet-coins.ts (PostgreSQL - Authoritative)
```typescript
awardSweetCoins(kickUserId: bigint, streamSessionId: bigint | null, messageId: string | null, badges?)
// - Looks up user by kick_user_id to get internal id
// - Checks rate limit via last_sweet_coin_earned_at
// - Creates SweetCoinHistory record
// - Updates UserSweetCoins.total_sweet_coins
// - Uses transaction with row-level locking
```

### lib/stream-session-manager.ts
```typescript
getOrCreateActiveSession(broadcasterUserId, channelSlug, metadata?, apiStartedAt?)
// - Creates or returns active session for broadcaster

resolveSessionForChat(broadcasterUserId, messageTimestampMs)
// - Returns active session OR recently ended session (within 2 min window)
// - Used to attach messages to correct session

endActiveSessionAt(broadcasterUserId, endedAt, force?)
// - Ends the active session for a broadcaster
```

## Leaderboard API (app/api/stream-session/leaderboard/route.ts)

### Authentication
- Requires `Authorization: Bearer <token>` header OR `api_key` query param
- For past sessions (with session_id), requires admin access

### Data Sources
1. **Redis first** (for active sessions): `getSessionLeaderboard(sessionId, 500)`
2. **PostgreSQL fallback** (if Redis empty or ended session):
   - Message counts from `chat_messages` grouped by `sender_user_id`
   - Points from `sweet_coin_history` grouped by `user_id`

### Response Structure
```json
{
  "leaderboard": [
    {
      "rank": 1,
      "user_id": "123",        // Internal user ID
      "kick_user_id": "456",   // Kick user ID
      "username": "user1",
      "profile_picture_url": "...",
      "points_earned": 50,
      "messages_sent": 100,
      "emotes_used": 25
    }
  ],
  "session_id": "477",
  "has_active_session": true,
  "stats": {
    "total_messages": 1500,
    "total_points": 300,
    "unique_chatters": 75
  }
}
```

## Important ID Mappings

⚠️ **Critical**: The system uses TWO different user IDs:

1. **`kick_user_id`** (from Kick API)
   - Used in: `sender_user_id` in ChatMessage, `broadcaster_user_id`
   - Stored in: `users.kick_user_id`

2. **`id`** (internal database ID)
   - Used in: `user_id` in UserSweetCoins, SweetCoinHistory, Redis keys
   - Stored in: `users.id`

### Conversion
```typescript
// Kick user ID → Internal ID
const user = await db.user.findUnique({
  where: { kick_user_id: kickUserId },
  select: { id: true }
})
const internalId = user.id

// Internal ID → Kick user ID
const user = await db.user.findUnique({
  where: { id: internalId },
  select: { kick_user_id: true }
})
const kickUserId = user.kick_user_id
```

## Rate Limiting

- **Cooldown**: 5 minutes (300 seconds) between coin awards per user
- **Redis**: `rate:{userId}` key with TTL
- **PostgreSQL**: `last_sweet_coin_earned_at` field in `user_sweet_coins`

## Session Resolution

Messages can be attached to sessions even after stream ends (2 minute grace period):

```typescript
const POST_END_ATTACH_WINDOW_MS = 2 * 60 * 1000 // 2 minutes

// A message sent within 2 minutes of stream ending
// will still be attached to that session
```

## Environment Variables

```
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://... (for migrations)
REDIS_URL=redis://... or rediss://... (TLS)
KICK_WEBHOOK_PUBLIC_KEY=... (for signature verification)
INTERNAL_WEBHOOK_SECRET=... (for server-to-server calls)
```

## Worker Scripts

### scripts/chat-worker.ts
- Processes ChatJob queue
- Awards coins via PostgreSQL + Redis
- Uses advisory lock to ensure single instance

### scripts/point-worker.ts (separate branch)
- Processes SweetCoinAwardJob queue (legacy?)
- May need updating to match current schema

### scripts/redis-sync.ts
- Syncs Redis balances to PostgreSQL
- Should run periodically to ensure consistency

