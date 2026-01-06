# Database Merge Guide: Shuttle + Mainline → Unified Database

## Overview

This guide documents the database merge from two separate databases into one unified database:

- **Shuttle (DB1)**: Internal business operations (16 admin users, affiliate management, finance)
- **Mainline (DB2)**: User-facing platform (22K+ Kick users, chat, sweet coins, raffles)

**Result**: All data consolidated into Shuttle (DB1) with:
- `admin_users` - Internal staff/admin accounts
- `platform_users` - Kick platform users
- `platform_*` tables - All user-facing features
- `player_casino_links` - Links between platform users and casino players

---

## Migration Summary

### Phase 1: Prepare Shuttle Database
- Renamed `users` → `admin_users`
- Updated all foreign key references

### Phase 2: Create Platform Tables
Created new tables in DB1:
- `platform_users`
- `platform_user_sweet_coins`
- `platform_sweet_coin_history`
- `platform_stream_sessions`
- `platform_chat_messages`
- `platform_offline_chat_messages`
- `platform_user_sessions`
- `platform_raffles`
- `platform_raffle_entries`
- `platform_raffle_winners`
- `platform_promo_codes`
- `platform_promo_code_redemptions`
- `platform_purchase_transactions`
- `platform_advent_purchases`
- `platform_referrals`
- `platform_referral_rewards`
- `platform_razed_verifications`
- `platform_app_settings`
- `platform_chat_jobs`
- `platform_sweet_coin_award_jobs`
- `platform_moderation_action_logs`
- `platform_bot_reply_logs`
- `player_casino_links` (NEW)

### Phase 3: Migrate Data
Migrated all data from Mainline (DB2) to Shuttle (DB1) with proper ID remapping.

### Phase 4: Create Links
- Linked platform_users to razed_players
- Linked platform_users to luxdrop_players
- Created backward compatibility views

### Phase 5: Verify Integrity
Verified all data was migrated correctly.

---

## Table Name Changes

### Old (Mainline DB2) → New (Shuttle DB1)

| Old Table Name | New Table Name |
|---------------|----------------|
| `users` | `platform_users` |
| `user_sweet_coins` | `platform_user_sweet_coins` |
| `sweet_coin_history` | `platform_sweet_coin_history` |
| `stream_sessions` | `platform_stream_sessions` |
| `chat_messages` | `platform_chat_messages` |
| `offline_chat_messages` | `platform_offline_chat_messages` |
| `user_sessions` | `platform_user_sessions` |
| `raffles` | `platform_raffles` |
| `raffle_entries` | `platform_raffle_entries` |
| `raffle_winners` | `platform_raffle_winners` |
| `promo_codes` | `platform_promo_codes` |
| `promo_code_redemptions` | `platform_promo_code_redemptions` |
| `purchase_transactions` | `platform_purchase_transactions` |
| `advent_purchases` | `platform_advent_purchases` |
| `referrals` | `platform_referrals` |
| `referral_rewards` | `platform_referral_rewards` |
| `razed_verifications` | `platform_razed_verifications` |
| `app_settings` | `platform_app_settings` |

### Shuttle DB1 Changes

| Old Table Name | New Table Name |
|---------------|----------------|
| `users` (admin) | `admin_users` |

---

## Code Adjustment Guide

### Step 1: Update Prisma Schema

Replace the current `prisma/schema.prisma` with the new unified schema.

**Key Changes:**

```prisma
// OLD
model User {
  id            BigInt @id @default(autoincrement())
  kick_user_id  BigInt @unique
  // ...
  @@map("users")
}

// NEW
model PlatformUser {
  id            BigInt @id @default(autoincrement())
  kick_user_id  BigInt @unique
  // ...
  @@map("platform_users")
}

// NEW - Admin users (internal)
model AdminUser {
  id         BigInt @id @default(autoincrement())
  email      String @unique
  name       String?
  role       String @default("user")
  // ...
  @@map("admin_users")
}
```

### Step 2: Update Database URL

Change your environment variable to point to the merged database:

```env
# OLD (Mainline)
DATABASE_URL="postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway"

# NEW (Shuttle - Unified)
DATABASE_URL="postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway"
```

### Step 3: Update Prisma Client Imports

**Find and Replace in all files:**

```typescript
// OLD
import { User, UserSweetCoins, SweetCoinHistory } from '@prisma/client'

// NEW
import { PlatformUser, PlatformUserSweetCoins, PlatformSweetCoinHistory } from '@prisma/client'
```

### Step 4: Update Prisma Queries

**Model Name Changes:**

```typescript
// OLD
prisma.user.findUnique({ where: { kick_user_id: 123 } })
prisma.userSweetCoins.findUnique({ where: { user_id: 1 } })
prisma.sweetCoinHistory.create({ data: {...} })
prisma.raffle.findMany()
prisma.raffleEntry.create({ data: {...} })

// NEW
prisma.platformUser.findUnique({ where: { kick_user_id: 123 } })
prisma.platformUserSweetCoins.findUnique({ where: { user_id: 1 } })
prisma.platformSweetCoinHistory.create({ data: {...} })
prisma.platformRaffle.findMany()
prisma.platformRaffleEntry.create({ data: {...} })
```

### Step 5: Update API Routes

#### Files to Update (Kickdashboard):

| File | Changes Needed |
|------|----------------|
| `app/api/auth/[...]/route.ts` | Change `User` → `PlatformUser` |
| `app/api/sweet-coins/*/route.ts` | Update all model references |
| `app/api/raffles/*/route.ts` | Change raffle model names |
| `app/api/promo-codes/*/route.ts` | Update promo code models |
| `app/api/chat/*/route.ts` | Update chat message models |
| `lib/auth.ts` | Update user queries |
| `lib/sweet-coins.ts` | Update sweet coins queries |
| `lib/raffles.ts` | Update raffle queries |

**Example API Route Update:**

```typescript
// OLD - app/api/user/route.ts
export async function GET(req: Request) {
  const user = await prisma.user.findUnique({
    where: { kick_user_id: userId },
    include: {
      sweet_coins: true,
      raffle_entries: true
    }
  })
}

// NEW
export async function GET(req: Request) {
  const user = await prisma.platformUser.findUnique({
    where: { kick_user_id: userId },
    include: {
      sweet_coins: true,
      raffle_entries: true
    }
  })
}
```

### Step 6: Update Type Definitions

Create/update types file:

```typescript
// types/database.ts

export type PlatformUser = {
  id: bigint
  kick_user_id: bigint
  username: string
  email: string | null
  razed_username: string | null
  razed_connected: boolean
  // ... rest of fields
}

export type AdminUser = {
  id: bigint
  email: string
  name: string | null
  role: string
  settings: Record<string, any> | null
}

export type PlayerCasinoLink = {
  id: bigint
  platform_user_id: bigint
  casino: 'razed' | 'luxdrop' | 'shuffle' | 'winna'
  casino_user_id: string
  casino_username: string | null
  verified: boolean
  total_wagered: number
}
```

### Step 7: Leverage New Features

#### Unified User Queries

```typescript
// Get user with all their casino links and wager totals
const user = await prisma.platformUser.findUnique({
  where: { kick_user_id: userId },
  include: {
    sweet_coins: true,
    casino_links: true
  }
})

// Get total wager across all casinos
const totalWager = user.casino_links.reduce((sum, link) => sum + link.total_wagered, 0)
```

#### Cross-Reference Queries

```typescript
// Find platform user by their Razed username
const user = await prisma.platformUser.findFirst({
  where: { razed_username: 'SomeRazedUser' }
})

// Get all Razed-verified users with high wagers
const highRollers = await prisma.playerCasinoLink.findMany({
  where: {
    casino: 'razed',
    verified: true,
    total_wagered: { gte: 100000 }
  },
  include: {
    platform_user: true
  }
})
```

---

## Search and Replace Commands

### VS Code / Cursor

Use these regex patterns for find and replace:

```
Find: prisma\.user\.
Replace: prisma.platformUser.

Find: prisma\.userSweetCoins\.
Replace: prisma.platformUserSweetCoins.

Find: prisma\.sweetCoinHistory\.
Replace: prisma.platformSweetCoinHistory.

Find: prisma\.streamSession\.
Replace: prisma.platformStreamSession.

Find: prisma\.chatMessage\.
Replace: prisma.platformChatMessage.

Find: prisma\.raffle\.
Replace: prisma.platformRaffle.

Find: prisma\.raffleEntry\.
Replace: prisma.platformRaffleEntry.

Find: prisma\.promoCode\.
Replace: prisma.platformPromoCode.

Find: prisma\.promoCodeRedemption\.
Replace: prisma.platformPromoCodeRedemption.

Find: prisma\.purchaseTransaction\.
Replace: prisma.platformPurchaseTransaction.

Find: prisma\.adventPurchase\.
Replace: prisma.platformAdventPurchase.

Find: prisma\.referral\.
Replace: prisma.platformReferral.
```

---

## Updated Prisma Schema

Create a new file or update your existing schema:

```prisma
// prisma/schema.prisma

generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// ADMIN USERS (Internal Staff)
// ============================================
model AdminUser {
  id         BigInt   @id @default(autoincrement())
  email      String   @unique
  name       String?
  image      String?
  role       String   @default("user")
  settings   Json?
  is_active  Boolean  @default(true)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  // Relations
  audit_logs              AuditLog[]
  expense_transactions    ExpenseTransaction[]
  income_transactions     IncomeTransaction[]
  player_loans            PlayerLoan[]
  player_bonus_transactions PlayerBonusTransaction[]
  tasks_created           Task[] @relation("TaskCreator")
  tasks_led               Task[] @relation("TaskLead")
  tickets_created         Ticket[] @relation("TicketCreator")
  tickets_assigned        Ticket[] @relation("TicketAssignee")
  meeting_notes           MeetingNote[]
  // ... other admin relations

  @@map("admin_users")
}

// ============================================
// PLATFORM USERS (Kick Users)
// ============================================
model PlatformUser {
  id                     BigInt    @id @default(autoincrement())
  kick_user_id           BigInt    @unique
  username               String
  email                  String?
  email_verified_at      DateTime?
  bio                    String?   @db.Text
  profile_picture_url    String?
  custom_profile_picture_url String?
  
  access_token_hash      String?
  refresh_token_hash     String?
  access_token_encrypted String?   @db.Text
  refresh_token_encrypted String?  @db.Text
  
  notifications_enabled       Boolean @default(true)
  email_notifications_enabled Boolean @default(false)
  chat_font_size              String? @default("14px")
  chat_show_timestamps        Boolean @default(true)
  
  last_login_at    DateTime?
  last_ip_address  String?
  last_user_agent  String?
  
  signup_ip_address  String?
  signup_user_agent  String?
  signup_referrer    String?
  
  instagram_url String?
  twitter_url   String?
  
  discord_user_id           String?
  discord_username          String?
  discord_access_token_hash String?
  discord_connected         Boolean @default(false)
  
  telegram_user_id           String?
  telegram_username          String?
  telegram_access_token_hash String?
  telegram_connected         Boolean @default(false)
  
  twitter_user_id           String?
  twitter_username          String?
  twitter_access_token_hash String?
  twitter_connected         Boolean @default(false)
  
  instagram_user_id           String?
  instagram_username          String?
  instagram_access_token_hash String?
  instagram_connected         Boolean @default(false)
  
  razed_user_id    String?
  razed_username   String?
  razed_connected  Boolean @default(false)
  
  kick_connected     Boolean  @default(true)
  is_admin           Boolean  @default(false)
  is_excluded        Boolean  @default(false)
  moderator_override Boolean?
  
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  // Relations
  sweet_coins          PlatformUserSweetCoins?
  sweet_coin_history   PlatformSweetCoinHistory[]
  sent_messages        PlatformChatMessage[]      @relation("SenderMessages")
  broadcaster_messages PlatformChatMessage[]      @relation("BroadcasterMessages")
  stream_sessions      PlatformStreamSession[]
  user_sessions        PlatformUserSession[]
  raffles_created      PlatformRaffle[]
  raffle_entries       PlatformRaffleEntry[]
  advent_purchases     PlatformAdventPurchase[]
  purchase_transactions PlatformPurchaseTransaction[]
  promo_codes_created  PlatformPromoCode[]
  promo_redemptions    PlatformPromoCodeRedemption[]
  referrals_as_referrer PlatformReferral[] @relation("Referrer")
  referrals_as_referee  PlatformReferral[] @relation("Referee")
  referral_rewards     PlatformReferralReward[]
  casino_links         PlayerCasinoLink[]

  @@index([kick_user_id])
  @@index([username])
  @@index([razed_username])
  @@map("platform_users")
}

// ============================================
// PLAYER CASINO LINKS
// ============================================
model PlayerCasinoLink {
  id                BigInt   @id @default(autoincrement())
  platform_user_id  BigInt
  casino            String   // razed, luxdrop, shuffle, winna
  casino_user_id    String
  casino_username   String?
  verified          Boolean  @default(false)
  verified_at       DateTime?
  total_wagered     Decimal  @default(0) @db.Decimal(20, 8)
  last_wager_sync_at DateTime?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  platform_user PlatformUser @relation(fields: [platform_user_id], references: [id], onDelete: Cascade)

  @@unique([platform_user_id, casino])
  @@unique([casino, casino_user_id])
  @@index([platform_user_id])
  @@index([casino, casino_user_id])
  @@map("player_casino_links")
}

// ... (rest of platform models)

// ============================================
// SWEET COINS
// ============================================
model PlatformUserSweetCoins {
  id                      BigInt    @id @default(autoincrement())
  user_id                 BigInt    @unique
  total_sweet_coins       Int       @default(0)
  total_emotes            Int       @default(0)
  last_sweet_coin_earned_at DateTime?
  is_subscriber           Boolean   @default(false)
  created_at              DateTime  @default(now())
  updated_at              DateTime  @updatedAt

  user PlatformUser @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@map("platform_user_sweet_coins")
}

model PlatformSweetCoinHistory {
  id                BigInt   @id @default(autoincrement())
  user_id           BigInt
  stream_session_id BigInt?
  sweet_coins_earned Int     @default(1)
  message_id        String?  @unique
  earned_at         DateTime @default(now())
  created_at        DateTime @default(now())

  user           PlatformUser           @relation(fields: [user_id], references: [id], onDelete: Cascade)
  stream_session PlatformStreamSession? @relation(fields: [stream_session_id], references: [id])

  @@index([stream_session_id])
  @@index([user_id, earned_at])
  @@index([earned_at])
  @@map("platform_sweet_coin_history")
}

// ... (continue with all other platform models)
```

---

## Testing Checklist

After updating the code:

1. [ ] Run `npx prisma generate` to regenerate the client
2. [ ] Run `npx prisma db pull` to verify schema matches database
3. [ ] Test user authentication flow
4. [ ] Test sweet coins earning
5. [ ] Test raffle entry
6. [ ] Test promo code redemption
7. [ ] Test chat message sending
8. [ ] Test admin dashboard access
9. [ ] Verify API responses match expected format

---

## Rollback Plan

If issues arise, the original Mainline database is still intact at:
```
postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway
```

To rollback:
1. Revert `DATABASE_URL` to the Mainline URL
2. Revert Prisma schema changes
3. Run `npx prisma generate`

---

## New Unified Query Examples

### Get User with All Data

```typescript
const user = await prisma.platformUser.findUnique({
  where: { kick_user_id: BigInt(userId) },
  include: {
    sweet_coins: true,
    casino_links: true,
    raffle_entries: {
      include: { raffle: true }
    }
  }
})

// Access data
console.log(user.username)
console.log(user.sweet_coins?.total_sweet_coins)
console.log(user.casino_links.find(l => l.casino === 'razed')?.total_wagered)
```

### Get Leaderboard with Wagers

```typescript
const leaderboard = await prisma.playerCasinoLink.findMany({
  where: { casino: 'razed', verified: true },
  orderBy: { total_wagered: 'desc' },
  take: 100,
  include: {
    platform_user: {
      select: {
        id: true,
        username: true,
        profile_picture_url: true
      }
    }
  }
})
```

### Cross-Reference Lookup

```typescript
// Find if a Razed player is on our platform
const razedUsername = 'SomePlayer'

const platformUser = await prisma.platformUser.findFirst({
  where: { razed_username: razedUsername }
})

// Or via casino links
const link = await prisma.playerCasinoLink.findFirst({
  where: {
    casino: 'razed',
    casino_username: razedUsername
  },
  include: { platform_user: true }
})
```

---

## Support

If you encounter issues during the code adjustment process, the migration scripts are in:
`scripts/database-merge/`

You can re-run verification at any time:
```bash
node scripts/database-merge/phase5-verify.js
```



