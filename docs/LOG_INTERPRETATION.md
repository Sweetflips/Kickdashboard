# Log Interpretation Guide

This guide helps you understand what the logs mean and when to be concerned.

## ✅ Normal Log Messages

### Successful Operations
```
✅ [SUCCESS] Profile picture upload completed
✅ [R2 UPLOAD] Successfully uploaded to R2
✅ Emotes loaded: 156 total
✅ User logged in: THOR189 (ID: 71644333)
```
**Meaning:** Everything working correctly. No action needed.

### Warnings (Expected Behavior)

#### "No active session found"
```
[chat/save] ⚠️ No active session found for broadcaster_user_id=42962282
```
**Meaning:** A chat message was received for a broadcaster who isn't currently streaming. This is **normal** - messages are saved as "offline" messages and will be associated with a session when the stream goes live.

**Action:** None needed. This is expected behavior.

#### "Emote 403 - Trying fullsize format"
```
⚠️ Emote 403 - Trying fullsize format: https://files.kick.com/emotes/1579036/fullsize
```
**Meaning:** Kick's CDN returned 403 for a thumbnail, so the system is trying the fullsize version. This is a fallback mechanism.

**Action:** None needed. The system handles this automatically.

### Client Disconnects (Not Errors)

#### ECONNRESET Errors
```
Error refreshing token: Error: aborted
    code: 'ECONNRESET'
```
**Meaning:** Client disconnected before the request completed (user closed browser, network issue, etc.). This is **not a server error**.

**Action:** None needed. These are filtered out and don't affect functionality.

**Note:** After the latest update, these errors are now suppressed in logs to reduce noise.

## 🔄 Process Exits

### Graceful Shutdown
```
ℹ️  Next.js exited gracefully (code: null - likely SIGTERM/SIGINT)
```
**Meaning:** Railway sent a shutdown signal (SIGTERM/SIGINT), likely for:
- Deployment/restart
- Scaling down
- Manual restart

**Action:** None needed. This is normal Railway behavior.

### Successful Exit
```
✅ Next.js exited successfully (code: 0)
```
**Meaning:** Process completed successfully.

**Action:** None needed.

### Error Exit
```
⚠️  Next.js exited with code: 1
```
**Meaning:** Process crashed or encountered an error.

**Action:** Check Railway logs for error details before this exit.

## 🚨 Actual Errors (Need Attention)

### Database Connection Errors
```
PrismaClientInitializationError: Can't reach database server
```
**Meaning:** Cannot connect to PostgreSQL database.

**Action:** 
1. Check Railway PostgreSQL service status
2. Verify `DATABASE_URL` environment variable
3. Check database connection limits

### R2 Upload Failures
```
❌ R2 upload failed: Access Denied
```
**Meaning:** Cannot upload to Cloudflare R2.

**Action:**
1. Verify R2 credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`)
2. Check bucket name matches `R2_BUCKET`
3. Verify bucket exists in Cloudflare dashboard

### API Authentication Errors
```
❌ Token refresh failed: Refresh token expired or invalid (401)
```
**Meaning:** User's refresh token expired. They need to log in again.

**Action:** None needed on server side. Client will handle re-authentication.

## 📊 Memory Cache Cleanup

```
[MemoryCache] Cleaned up 3 expired entries
```
**Meaning:** Cache cleanup is working correctly. Old entries are being removed.

**Action:** None needed. This is normal maintenance.

## 🔍 How to Check Logs

### Railway Dashboard
1. Go to Railway Dashboard → Your Service
2. Click **Deployments** → Latest deployment
3. Click **Logs** tab
4. Filter by severity if needed

### Real-time Monitoring
- Railway automatically shows recent logs in the dashboard
- Use the search/filter to find specific errors
- Check timestamps to correlate with user reports

## 📈 Log Volume

Normal log volume depends on traffic:
- **Low traffic:** Few logs per minute
- **High traffic:** Many logs per second (expected)

If logs are overwhelming:
- Check for error loops (same error repeating rapidly)
- Verify rate-limited logging is working
- Consider adjusting log levels in production

## 🎯 Quick Health Check

Run these commands to verify everything is working:

```bash
# Test health endpoint
curl https://www.kickdashboard.com/api/health

# Should return:
# {"status":"ok","timestamp":"...","uptime":12345}
```

If health check fails, check Railway logs for startup errors.

## 📚 Related Documentation

- `docs/CLOUDFLARE_502_FIX.md` - Troubleshooting 502 errors
- `docs/RAILWAY_DEPLOYMENT.md` - Deployment guide
- `docs/DATABASE_SETUP.md` - Database configuration
