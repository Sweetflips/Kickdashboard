# PostgreSQL Database Setup Guide

## Option 1: Cloud PostgreSQL (Recommended - Easiest)

### Neon (Free Tier) - Recommended
1. Go to https://neon.tech
2. Sign up for free account
3. Create a new project
4. Copy the connection string (looks like: `postgresql://user:pass@host.neon.tech/dbname`)
5. Add it to `.env.local` as `DATABASE_URL`

### Railway
1. Go to https://railway.app
2. Sign up/login
3. Create new project → Add PostgreSQL service
4. Copy connection string from service variables
5. Add to `.env.local`

### Render
1. Go to https://render.com
2. Create PostgreSQL database
3. Copy connection string
4. Add to `.env.local`

## Option 2: Local PostgreSQL

### Windows Installation:
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Install PostgreSQL (remember the password you set!)
3. Create a database:
   ```powershell
   psql -U postgres
   CREATE DATABASE kickchat;
   \q
   ```
4. Update `.env.local`:
   ```
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/kickchat?schema=public"
   ```

## After setting DATABASE_URL:

Run the migration:
```bash
npx prisma migrate deploy
```

Or if you want Prisma to track it:
```bash
npx prisma migrate dev
```

This will create all the tables in your database.

















