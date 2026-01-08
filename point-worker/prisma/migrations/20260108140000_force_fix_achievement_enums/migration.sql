-- Force Fix Achievement Enums (v3)
-- This migration force-recreates the enums to fix the invalid enum state

-- Step 1: Drop tables that depend on the enums (they may have incorrect types)
DROP TABLE IF EXISTS "platform_user_achievements" CASCADE;
DROP TABLE IF EXISTS "platform_achievement_definitions" CASCADE;

-- Step 2: Drop enums completely
DROP TYPE IF EXISTS "AchievementCategory" CASCADE;
DROP TYPE IF EXISTS "AchievementStatus" CASCADE;

-- Step 3: Create enums fresh
CREATE TYPE "AchievementCategory" AS ENUM ('STREAMS', 'COMMUNITY', 'CHAT', 'LEADERBOARD', 'SPECIAL');
CREATE TYPE "AchievementStatus" AS ENUM ('LOCKED', 'UNLOCKED', 'CLAIMED');

-- Step 4: Recreate platform_achievement_definitions table
CREATE TABLE "platform_achievement_definitions" (
    "id" TEXT NOT NULL,
    "category" "AchievementCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reward_coins" INTEGER NOT NULL,
    "claimable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_achievement_definitions_pkey" PRIMARY KEY ("id")
);

-- Step 5: Recreate platform_user_achievements table
CREATE TABLE "platform_user_achievements" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "status" "AchievementStatus" NOT NULL DEFAULT 'LOCKED',
    "unlocked_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_user_achievements_pkey" PRIMARY KEY ("id")
);

-- Step 6: Create indexes
CREATE UNIQUE INDEX "platform_user_achievements_user_id_achievement_id_key" ON "platform_user_achievements"("user_id", "achievement_id");
CREATE INDEX "platform_user_achievements_user_id_idx" ON "platform_user_achievements"("user_id");
CREATE INDEX "platform_user_achievements_achievement_id_idx" ON "platform_user_achievements"("achievement_id");
CREATE INDEX "platform_user_achievements_status_idx" ON "platform_user_achievements"("status");

-- Step 7: Create foreign keys
ALTER TABLE "platform_user_achievements" ADD CONSTRAINT "platform_user_achievements_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_user_achievements" ADD CONSTRAINT "platform_user_achievements_achievement_id_fkey" 
    FOREIGN KEY ("achievement_id") REFERENCES "platform_achievement_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 8: Seed achievement definitions
INSERT INTO "platform_achievement_definitions" ("id", "category", "title", "description", "reward_coins", "claimable", "sort_order", "created_at", "updated_at")
VALUES
  ('STREAM_STARTER', 'STREAMS', 'Stream Starter', 'Watch your first 30 minutes of streams', 25, true, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GETTING_COZY', 'STREAMS', 'Getting Cozy', 'Watch 2 hours of streams total', 50, true, 101, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DEDICATED_VIEWER', 'STREAMS', 'Dedicated Viewer', 'Watch 10 hours of streams total', 150, true, 102, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('STREAM_VETERAN', 'STREAMS', 'Stream Veteran', 'Watch 50 hours of streams total', 500, true, 103, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('RIDE_OR_DIE', 'STREAMS', 'Ride or Die', 'Watch 200 hours of streams total', 1500, true, 104, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('MULTI_STREAM_HOPPER', 'STREAMS', 'Multi-Stream Hopper', 'Watch 2 different streams within 24 hours', 50, true, 105, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DASHBOARD_ADDICT', 'COMMUNITY', 'Dashboard Addict', 'Login to dashboard on 7 days in a month', 100, true, 200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DISCORD_CONNECTED', 'COMMUNITY', 'Discord Connected', 'Connect your Discord account', 25, true, 201, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('TELEGRAM_CONNECTED', 'COMMUNITY', 'Telegram Connected', 'Connect your Telegram account', 25, true, 202, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('TWITTER_CONNECTED', 'COMMUNITY', 'Twitter Connected', 'Connect your Twitter account', 100, true, 203, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('INSTAGRAM_CONNECTED', 'COMMUNITY', 'Instagram Connected', 'Connect your Instagram account', 100, true, 204, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CUSTOM_PROFILE_PICTURE', 'COMMUNITY', 'Custom Profile Picture', 'Set a custom profile picture', 10, true, 205, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('FIRST_WORDS', 'CHAT', 'First Words', 'Send your first chat message', 25, true, 300, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CHATTERBOX', 'CHAT', 'Chatterbox', 'Send 1000 chat messages', 100, true, 301, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EMOTE_MASTER', 'CHAT', 'Emote Master', 'Use 1500 emotes in chat', 75, true, 302, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SUPER_SOCIAL', 'CHAT', 'Super Social', 'Send 4000 chat messages', 250, true, 303, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DAILY_CHATTER', 'CHAT', 'Daily Chatter', 'Send a message on 7 different days', 75, true, 304, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('TOP_G_CHATTER', 'LEADERBOARD', 'Top G Chatter', 'Finish in the Top 3 on the leaderboard for a period', 300, true, 400, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('OG_DASH', 'SPECIAL', 'OG Dash', 'Be one of the first 100 dashboard users', 150, true, 500, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SF_LEGEND_OF_THE_MONTH', 'SPECIAL', 'SF Legend of the Month', 'Earn the most points in a calendar month', 1500, true, 501, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
