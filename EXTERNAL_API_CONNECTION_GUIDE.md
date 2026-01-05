# External API Connection Guide

This guide explains how to connect external tools to the secured API endpoints.

## Authentication Methods

### Method 1: API Secret Key (Recommended for External Tools)

Use the `API_SECRET_KEY` from your `.env` file. This key can be used for all endpoints that support API key authentication.

**Option A: Query Parameter**
```
GET /api/stream-session/leaderboard?broadcaster_user_id=123&api_key=YOUR_API_SECRET_KEY
```

**Option B: Header**
```
GET /api/stream-session/leaderboard?broadcaster_user_id=123
X-API-Key: YOUR_API_SECRET_KEY
```

### Method 2: Endpoint-Specific Keys (Optional)

For granular access control, you can set endpoint-specific keys in your `.env`:

- `API_KEY_STREAM_LEADERBOARD` - For `/api/stream-session/leaderboard`
- `API_KEY_CHAT` - For `/api/chat` and `/api/chat/recent`
- `API_KEY_SWEET_COINS` - For `/api/sweet-coins`

If not set, external tools can use `API_SECRET_KEY` for these endpoints.

### Method 3: Session Authentication (Internal Dashboard Only)

Internal dashboard users authenticate automatically via session cookies. No API key needed when logged in.

---

## Secured Endpoints

### 1. Stream Session Leaderboard

**Endpoint:** `GET /api/stream-session/leaderboard`

**Authentication:** API key OR authenticated session

**Parameters:**
- `broadcaster_user_id` (required) - The Kick broadcaster user ID
- `session_id` (optional) - Specific session ID (admin-only for past streams)
- `api_key` (required for external tools) - Your API secret key

**Example:**
```bash
curl "https://kickdashboard.com/api/stream-session/leaderboard?broadcaster_user_id=123&api_key=YOUR_API_SECRET_KEY"
```

**Response:**
```json
{
  "leaderboard": [
    {
      "rank": 1,
      "user_id": "456",
      "kick_user_id": "789",
      "username": "user123",
      "points_earned": 1000,
      "messages_sent": 50,
      "emotes_used": 10
    }
  ],
  "session_id": "123",
  "stats": {
    "total_messages": 500,
    "total_points": 10000,
    "unique_chatters": 25
  }
}
```

**Use Case:** Kick stream raffle integration (as mentioned)

---

### 2. Chat Messages

**Endpoint:** `GET /api/chat`

**Authentication:** API key OR authenticated session

**Parameters:**
- `broadcaster_user_id` (required) - Filter by broadcaster
- `limit` (optional) - Max messages to return (default: 100, max: 500)
- `cursor` (optional) - Timestamp cursor for pagination
- `api_key` (required for external tools) - Your API secret key

**Example:**
```bash
curl "https://kickdashboard.com/api/chat?broadcaster_user_id=123&limit=50&api_key=YOUR_API_SECRET_KEY"
```

---

### 3. Recent Chat Messages (Redis Buffer)

**Endpoint:** `GET /api/chat/recent`

**Authentication:** API key OR authenticated session

**Parameters:**
- `broadcaster_user_id` (optional) - Filter by broadcaster
- `limit` (optional) - Max messages (default: 100, max: 200)
- `api_key` (required for external tools) - Your API secret key

**Note:** Returns messages from Redis buffer (not yet flushed to PostgreSQL)

---

### 4. Sweet Coins Balance

**Endpoint:** `GET /api/sweet-coins`

**Authentication:** API key OR authenticated session

**Parameters:**
- `kick_user_id` (required) - The Kick user ID
- `api_key` (required for external tools) - Your API secret key

**Example:**
```bash
curl "https://kickdashboard.com/api/sweet-coins?kick_user_id=123&api_key=YOUR_API_SECRET_KEY"
```

**Response:**
```json
{
  "kick_user_id": "123",
  "total_sweet_coins": 5000,
  "is_subscriber": false
}
```

---

## Internal Endpoints (Not for External Use)

### `/api/chat/save` (POST)

**Restricted to:**
- Authenticated users (frontend dashboard)
- Internal webhook calls with `X-Internal-Secret` header

**Not available for external tools** - This endpoint is for internal use only.

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Authentication required. Use api_key parameter or login."
}
```

**Solution:** Include `api_key` query parameter or `X-API-Key` header with your `API_SECRET_KEY`.

### 403 Forbidden
```json
{
  "error": "Forbidden - Invalid or missing internal secret"
}
```

**Solution:** Check that your API key matches the one in your `.env` file.

---

## Setup Instructions

1. Copy `example.env` to `.env` (if you haven't already)
2. Set `API_SECRET_KEY` in your `.env` file
3. (Optional) Set endpoint-specific keys if needed
4. Restart your application
5. Use the `API_SECRET_KEY` in your external tool requests

---

## Security Best Practices

1. **Never commit API keys to version control**
   - Keep `.env` in `.gitignore`
   - Use `example.env` as a template

2. **Rotate keys periodically**
   - Generate new keys with: `openssl rand -hex 32`
   - Update external tools with new keys
   - Remove old keys from `.env`

3. **Use HTTPS**
   - Always use HTTPS in production
   - API keys in query parameters are visible in logs/referrers
   - Prefer `X-API-Key` header when possible

4. **Rate Limiting**
   - Be respectful of API rate limits
   - Implement exponential backoff on errors
   - Cache responses when appropriate

---

## Migration Notes

If you're updating an existing integration:

1. **Before deployment:** Add `API_SECRET_KEY` to your `.env` file
2. **Update external tools:** Add `api_key` parameter to requests
3. **Deploy changes:** Endpoints now require authentication
4. **Verify:** Test all integrations work correctly

---

## Support

For issues or questions about API access, contact the development team.

