# Production Deployment - Railway

## IMPORTANT: Run via Railway Web Interface

Railway databases are only accessible from Railway's network. You **must** run these commands via Railway's web interface.

## Steps:

### 1. Go to Railway Dashboard
- Navigate to: https://railway.app
- Select your project → Your service

### 2. Open Shell
- Click **"Shell"** tab (or go to Deployments → Latest → Shell)

### 3. Run Deployment Script
```bash
node scripts/deploy-admin-system.js
```

This will:
- ✅ Run the database migration (adds `is_admin` column)
- ✅ Grant admin access to "amorsweetflips"

### 4. Verify
- Log in as "amorsweetflips"
- Check sidebar for "Admin" section
- Verify SweetFlips logo in header

## Alternative: Manual Steps

If the script doesn't work, run separately:

```bash
# Step 1: Run migration
npx prisma migrate deploy

# Step 2: Grant admin
node scripts/grant-admin.js
```

## Notes

- Make sure "amorsweetflips" has logged in at least once before granting admin
- Migration is safe - only adds a column with default `false`
- All existing users remain non-admin by default
