# Session 93 Unique Chatters Investigation Report

## Executive Summary

Investigation into why Session 93 shows **1,098 unique chatters** when fewer (<500) were expected. After thorough analysis, the count appears to be **correct** based on the database records. The discrepancy may be due to comparing against a different metric (e.g., concurrent viewers vs. total unique chatters over the stream duration).

## Investigation Findings

### Data Quality Analysis

1. **Message Assignment**: All 17,671 messages are correctly assigned to Session 93
   - No messages incorrectly assigned from other sessions
   - No messages with timestamps before session start (except 1 message with 1.7s difference)
   - All messages have valid user IDs (> 0)
   - No offline messages included

2. **Session Overlap**: Session 92 started 50ms before Session 93 but has 0 messages
   - Session 92: Started 2025-11-20T09:05:13.651Z, ended (still active)
   - Session 93: Started 2025-11-20T09:05:13.701Z, ended (still active)
   - All messages correctly assigned to Session 93

3. **Duplicate User Analysis**:
   - **0 usernames** with multiple user IDs found
   - 1,099 unique usernames vs 1,098 unique user IDs (1 difference likely due to case sensitivity or username change)
   - No duplicate user IDs inflating the count

4. **User Activity Patterns**:
   - 717 users (65.3%) sent only 1 message
   - 239 users sent 2-5 messages
   - 130 users sent 11+ messages
   - This distribution is normal for a live stream

5. **Message Distribution**:
   - Messages distributed across ~2.5 hours of streaming
   - Consistent message flow throughout the session
   - No suspicious spikes or anomalies

### Root Cause Analysis

The **1,098 unique chatters count is accurate** based on:
- Distinct `sender_user_id` values in valid messages
- Proper filtering (valid user IDs, session time boundaries, online messages only)
- No data quality issues detected

### Possible Explanations for Discrepancy

1. **Metric Mismatch**: The expected <500 count might be:
   - Concurrent viewers (peak viewers at a single moment)
   - Unique chatters from a different time window
   - Unique chatters from a different source (e.g., Twitch dashboard vs. Kick API)

2. **Time Window**: The stream has been active for ~2.5 hours, accumulating unique chatters over time
   - First 30 minutes: 144 unique users
   - First hour: 551 unique users
   - Full session: 1,098 unique users

3. **User Behavior**: 65.3% of users sent only 1 message, indicating many "lurkers" or casual viewers who briefly participated

## Technical Details

### Filtering Logic (Verified Correct)

The unique chatters count uses the following filters:
1. `stream_session_id = 93` (session assignment)
2. `sender_user_id > 0` (valid user IDs)
3. `created_at >= session.started_at` (session time boundary)
4. `sent_when_offline = false` (online messages only)

### Code Locations

Unique chatters count is calculated in:
- `app/api/analytics/stream/route.ts` (line 175-189)
- `app/api/stream-session/leaderboard/route.ts` (line 117-121)
- `scripts/analyze-session-chatters.js` (line 99)

All use consistent logic: count distinct `sender_user_id` values after filtering.

## Recommendations

### Immediate Actions

1. **Verify Expected Count Source**: Confirm what metric the expected <500 count represents
   - Is it concurrent viewers?
   - Is it unique chatters from a different platform?
   - Is it unique chatters from a different time window?

2. **Compare with External Sources**: If available, compare against:
   - Kick.com dashboard analytics
   - Twitch/YouTube analytics (if cross-platform)
   - Manual count from chat logs

### Code Improvements (Optional)

1. **Add Session Boundary Validation**: Ensure messages aren't assigned to sessions if their Kick timestamp is significantly before session start
   ```typescript
   // In message assignment logic
   if (kickTimestamp < session.started_at - 5 * 60 * 1000) {
       // Don't assign to session if >5 min before start
   }
   ```

2. **Add Duplicate Detection**: Monitor for usernames with multiple user IDs
   - Log warnings when detected
   - Optionally deduplicate in analytics

3. **Add Session Cleanup**: End Session 92 if it's still active but has no messages
   ```sql
   UPDATE stream_sessions
   SET ended_at = NOW()
   WHERE id = 92 AND ended_at IS NULL;
   ```

### Monitoring

1. **Track Unique Chatters Over Time**: Add metrics to track unique chatters per 30-minute window
2. **Alert on Anomalies**: Set up alerts if unique chatters count deviates significantly from expected patterns
3. **Session Validation**: Add checks to prevent duplicate/overlapping sessions

## Conclusion

The **1,098 unique chatters count for Session 93 is accurate** based on database records. The discrepancy with the expected <500 count is likely due to:
- Comparing different metrics (concurrent vs. cumulative)
- Different time windows
- Different data sources

No code fixes are needed for data accuracy. However, clarifying the expected metric and source would help validate the count against external references.

## Files Created for Investigation

1. `scripts/analyze-session-chatters.js` - Enhanced with detailed stage-by-stage analysis
2. `scripts/deep-dive-session-93.js` - Deep dive into message timestamps and session overlap
3. `scripts/compare-sessions-92-93.js` - Comparison between Sessions 92 and 93
4. `scripts/check-duplicate-users.js` - Analysis of duplicate usernames/user IDs

All scripts can be run with:
```bash
$env:DATABASE_URL="postgresql://..."; node scripts/[script-name].js [args]
```










