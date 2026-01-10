# Thumbnail Management System

## Overview
The Kickdashboard automatically captures and stores thumbnails for all stream sessions. This ensures that past streams display properly with visual thumbnails.

## How Thumbnails Are Captured

### 1. Automatic Capture During Stream
When a stream goes live, thumbnails are automatically captured from the Kick API:

- **Webhook Handler** (`app/api/webhook/route.ts`): Captures thumbnails when processing chat messages
- **Channel Route** (`app/api/channel/route.ts`): Captures thumbnails during stream status checks
- **Kick API** (`lib/kick-api.ts`): Fetches live thumbnail data from Kick's official Dev API

### 2. Data Flow
```
Kick API → getChannelWithLivestream() → StreamSession.thumbnail_url
```

The `thumbnail_url` field in the `stream_sessions` table stores either:
- A full HTTP URL to Kick's CDN
- A data URI with an SVG placeholder for past streams without available thumbnails

## Maintenance Scripts

### Check Missing Thumbnails
```bash
node scripts/check-missing-thumbnails.js
```
Shows statistics about sessions with/without thumbnails.

### Backfill Thumbnails
```bash
node scripts/backfill-thumbnails.js
```
Adds placeholder thumbnails to all sessions missing them. Uses a gradient SVG placeholder.

### Auto-Sync Active Streams
```bash
node scripts/auto-sync-thumbnails.js
```
Fetches thumbnails for currently active streams that are missing them. Should be run periodically (e.g., via cron every 5-10 minutes).

### Admin API Endpoint
```bash
POST /api/admin/sync-thumbnails
```
Admin-only endpoint to manually sync thumbnails for all active streams.

## Frontend Display

The streams page (`app/streams/page.tsx`) handles thumbnail display with:

1. **Image Proxy**: Routes external thumbnails through `/api/image-proxy` to avoid CORS issues
2. **Error Handling**: Falls back to gradient placeholder if image fails to load
3. **Data URI Support**: Handles both HTTP URLs and data URIs (SVG placeholders)
4. **Placeholder Gradient**: Beautiful purple-to-pink gradient for missing thumbnails

## Troubleshooting

### Thumbnails Not Loading
1. Check if thumbnails are in database:
   ```bash
   node scripts/check-missing-thumbnails.js
   ```

2. Run backfill for missing thumbnails:
   ```bash
   node scripts/backfill-thumbnails.js
   ```

3. For active streams, sync from Kick API:
   ```bash
   node scripts/auto-sync-thumbnails.js
   ```

### New Sessions Not Getting Thumbnails
- Verify webhook is receiving messages: Check logs for `getChannelWithLivestream`
- Ensure Kick API credentials are valid in `.env`
- Check that `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` are set

### Placeholder Thumbnails Not Displaying
The system uses inline SVG data URIs which work universally. If you see broken images:
- Check browser console for errors
- Verify the `thumbnail_url` field isn't corrupted
- Re-run backfill script to regenerate placeholders

## Database Schema
```prisma
model StreamSession {
  id                  BigInt    @id @default(autoincrement())
  thumbnail_url       String?   // HTTP URL or data URI
  // ... other fields
}
```

## Best Practices

1. **Run auto-sync periodically**: Set up a cron job for `auto-sync-thumbnails.js`
2. **Monitor active streams**: Check logs to ensure thumbnails are being captured
3. **Backfill after API changes**: If Kick API changes, re-run backfill scripts
4. **Keep placeholders consistent**: Use the same gradient style across the app

## Future Improvements

- [ ] Cache thumbnails locally to reduce Kick API calls
- [ ] Generate custom thumbnails with stream metadata overlays
- [ ] Implement thumbnail refresh for long-running streams
- [ ] Add thumbnail quality/size options
