# Quick Production Deployment Guide

## Option 1: Via Railway Web Interface (Recommended)

1. **Go to Railway Dashboard** → Your Project → Your Service
2. **Click "Shell" tab** (or "Deployments" → Click latest deployment → "Shell")
3. **Run these commands:**

```bash
# Run migration and grant admin
node scripts/deploy-admin-system.js
```

This single script will:
- ✅ Run the database migration
- ✅ Grant admin access to "amorsweetflips"

## Option 2: Via Railway CLI (If Linked)

If you've linked Railway CLI:

```bash
railway run node scripts/deploy-admin-system.js
```

## Option 3: Manual Steps

### Step 1: Run Migration
```bash
railway run npx prisma migrate deploy
```

### Step 2: Grant Admin
```bash
railway run node scripts/grant-admin.js
```

## Verification

After deployment:
1. Log in as "amorsweetflips"
2. Check sidebar - you should see "Admin" section with:
   - Analytics
   - Giveaways
   - User Management
3. Verify SweetFlips logo appears centered in header
4. Test `/admin/users` page - should show all users

## If User Not Found

If "amorsweetflips" user doesn't exist yet:
1. Make sure that user logs in at least once
2. Then run: `railway run node scripts/grant-admin.js`
