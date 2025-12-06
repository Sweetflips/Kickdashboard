# Production Deployment Steps for Admin System

## 1. Run Database Migration

**Via Railway Shell:**
```bash
npx prisma migrate deploy
```

**Via Railway CLI:**
```bash
railway run npx prisma migrate deploy
```

This migration is **safe for production** - it only adds a new column `is_admin` with default value `false` to existing users. No data loss or downtime.

## 2. Grant Admin Access

**Via Railway Shell:**
```bash
node scripts/grant-admin.js
```

**Via Railway CLI:**
```bash
railway run node scripts/grant-admin.js
```

This will grant admin access to the user with username "amorsweetflips" (case-insensitive).

**Note:** Make sure the user "amorsweetflips" has logged in at least once before running this script, otherwise the user won't exist in the database yet.

## 3. Verify Deployment

After deployment:
- ✅ Check that admin links appear in sidebar for admin users
- ✅ Verify non-admin users don't see Analytics/Giveaways links
- ✅ Confirm SweetFlips logo appears centered in header
- ✅ Test admin user management page at `/admin/users`

## Migration Details

The migration adds:
- `is_admin BOOLEAN NOT NULL DEFAULT false` to the `users` table
- All existing users will have `is_admin = false` by default
- Only "amorsweetflips" will be granted admin access via the script

## Rollback (if needed)

If you need to rollback:
```sql
ALTER TABLE "users" DROP COLUMN "is_admin";
```

However, this is **not recommended** after granting admin access as it will break admin functionality.

---

# Point Award Queue System

## Overview

Point awards are now processed asynchronously via a queue system to prevent transaction timeouts during high chat volume. Messages are saved immediately, and point awards are processed by a background worker.

## Architecture

- **Queue Table**: `point_award_jobs` stores pending point award jobs
- **Worker Process**: `scripts/point-worker.ts` processes jobs from the queue
- **API Route**: `/api/chat/save` enqueues jobs instead of awarding points synchronously

## Worker Configuration

The worker runs alongside the Next.js server and can be configured via environment variables:

- `ENABLE_POINT_WORKER` (default: `true`) - Enable/disable the worker
- `POINT_WORKER_BATCH_SIZE` (default: `10`) - Number of jobs to claim per batch
- `POINT_WORKER_POLL_INTERVAL_MS` (default: `1000`) - Milliseconds between polls
- `POINT_WORKER_CONCURRENCY` (default: `5`) - Max concurrent job processing
- `POINT_WORKER_STATS_INTERVAL_MS` (default: `60000`) - Stats logging interval
- `POINT_QUEUE_VERBOSE_LOGS` (default: `false`) - Enable verbose queue logging

## Monitoring

### Queue Statistics

The worker logs queue statistics every minute:
```
[point-worker] Queue stats: pending=42, processing=3, completed=12345, failed=2, staleLocks=0
```

### Checking Queue Status

You can query the queue directly:
```sql
SELECT status, COUNT(*)
FROM point_award_jobs
GROUP BY status;
```

### Common Issues

**Stale Locks**: If `staleLocks > 0`, jobs are stuck in "processing" state. The worker automatically unlocks jobs locked for >5 minutes.

**High Pending Count**: If `pending` grows continuously, the worker may be overloaded. Consider:
- Increasing `POINT_WORKER_CONCURRENCY`
- Decreasing `POINT_WORKER_POLL_INTERVAL_MS`
- Scaling to multiple worker instances

**Failed Jobs**: Check `last_error` field for failed jobs:
```sql
SELECT message_id, attempts, last_error
FROM point_award_jobs
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 10;
```

Failed jobs are retried up to 5 times before being marked as permanently failed.

## Migration

When deploying the queue system:

1. **Run Migration**: The `point_award_jobs` table will be created automatically
2. **Restart Services**: The worker starts automatically with the Next.js server
3. **Monitor Logs**: Watch for worker startup and queue stats

## Disabling the Worker

To disable the worker (for debugging or maintenance):
```bash
ENABLE_POINT_WORKER=false npm start
```

**Note**: With the worker disabled, points will be enqueued but not processed. Jobs will accumulate in the queue until the worker is re-enabled.
