# Fix: point_award_jobs Table Missing

## Problem
The `point_award_jobs` table doesn't exist in the database, causing errors when trying to enqueue point award jobs.

## Quick Fix

### Option 1: Run Migration (Recommended)
Via Railway Shell:
```bash
npx prisma migrate deploy
```

Via Railway CLI:
```bash
railway run npx prisma migrate deploy
```

### Option 2: Run Fix Script
Via Railway Shell:
```bash
node scripts/fix-point-award-jobs-table.js
```

Via Railway CLI:
```bash
railway run node scripts/fix-point-award-jobs-table.js
```

## Verification
After running the fix, check the logs - you should no longer see:
```
The table `public.point_award_jobs` does not exist in the current database.
```

## Why This Happened
The migration `20250101000020_add_point_award_job` exists but hasn't been applied to the production database. The `start.js` script should create it automatically, but if the app is started with `next start` directly instead of `node scripts/start.js`, the table won't be created.

## Prevention
Make sure Railway is using the start script:
- Check `package.json` - `"start": "node scripts/start.js"`
- Or ensure migrations run on deploy via Railway's build command








