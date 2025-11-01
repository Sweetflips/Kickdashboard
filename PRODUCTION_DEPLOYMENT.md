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
