-- CreateEnum: AchievementCategory
DO $$ BEGIN
 CREATE TYPE "AchievementCategory" AS ENUM('STREAMS', 'COMMUNITY', 'CHAT', 'LEADERBOARD', 'SPECIAL');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: AchievementStatus
DO $$ BEGIN
 CREATE TYPE "AchievementStatus" AS ENUM('LOCKED', 'UNLOCKED', 'CLAIMED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateTable: platform_achievement_definitions
CREATE TABLE IF NOT EXISTS "platform_achievement_definitions" (
    "id" TEXT NOT NULL,
    "category" "AchievementCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reward_coins" INTEGER NOT NULL,
    "claimable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_achievement_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform_user_achievements
CREATE TABLE IF NOT EXISTS "platform_user_achievements" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "status" "AchievementStatus" NOT NULL DEFAULT 'LOCKED',
    "unlocked_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform_coin_ledger
CREATE TABLE IF NOT EXISTS "platform_coin_ledger" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_coin_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform_dashboard_login_days
CREATE TABLE IF NOT EXISTS "platform_dashboard_login_days" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "day" DATE NOT NULL,
    "month_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_dashboard_login_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform_chat_counters
CREATE TABLE IF NOT EXISTS "platform_chat_counters" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "emote_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_chat_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform_chat_days
CREATE TABLE IF NOT EXISTS "platform_chat_days" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "day" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_chat_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform_leaderboard_period_results
CREATE TABLE IF NOT EXISTS "platform_leaderboard_period_results" (
    "id" BIGSERIAL NOT NULL,
    "period_key" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_leaderboard_period_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform_monthly_winners
CREATE TABLE IF NOT EXISTS "platform_monthly_winners" (
    "id" BIGSERIAL NOT NULL,
    "month_key" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "points" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_monthly_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform_watch_time_aggregates
CREATE TABLE IF NOT EXISTS "platform_watch_time_aggregates" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "total_minutes" INTEGER NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_watch_time_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: platform_user_achievements_user_id_achievement_id_unique
CREATE UNIQUE INDEX IF NOT EXISTS "platform_user_achievements_user_id_achievement_id_key" ON "platform_user_achievements"("user_id", "achievement_id");

-- CreateIndex: platform_user_achievements_user_id
CREATE INDEX IF NOT EXISTS "platform_user_achievements_user_id_idx" ON "platform_user_achievements"("user_id");

-- CreateIndex: platform_user_achievements_achievement_id
CREATE INDEX IF NOT EXISTS "platform_user_achievements_achievement_id_idx" ON "platform_user_achievements"("achievement_id");

-- CreateIndex: platform_user_achievements_status
CREATE INDEX IF NOT EXISTS "platform_user_achievements_status_idx" ON "platform_user_achievements"("status");

-- CreateIndex: platform_coin_ledger_user_id_ref_id_unique
CREATE UNIQUE INDEX IF NOT EXISTS "platform_coin_ledger_user_id_ref_id_key" ON "platform_coin_ledger"("user_id", "ref_id");

-- CreateIndex: platform_coin_ledger_user_id_created_at
CREATE INDEX IF NOT EXISTS "platform_coin_ledger_user_id_created_at_idx" ON "platform_coin_ledger"("user_id", "created_at");

-- CreateIndex: platform_coin_ledger_reason
CREATE INDEX IF NOT EXISTS "platform_coin_ledger_reason_idx" ON "platform_coin_ledger"("reason");

-- CreateIndex: platform_dashboard_login_days_user_id_day_unique
CREATE UNIQUE INDEX IF NOT EXISTS "platform_dashboard_login_days_user_id_day_key" ON "platform_dashboard_login_days"("user_id", "day");

-- CreateIndex: platform_dashboard_login_days_user_id_month_key
CREATE INDEX IF NOT EXISTS "platform_dashboard_login_days_user_id_month_key_idx" ON "platform_dashboard_login_days"("user_id", "month_key");

-- CreateIndex: platform_chat_counters_user_id_unique
CREATE UNIQUE INDEX IF NOT EXISTS "platform_chat_counters_user_id_key" ON "platform_chat_counters"("user_id");

-- CreateIndex: platform_chat_days_user_id_day_unique
CREATE UNIQUE INDEX IF NOT EXISTS "platform_chat_days_user_id_day_key" ON "platform_chat_days"("user_id", "day");

-- CreateIndex: platform_chat_days_user_id
CREATE INDEX IF NOT EXISTS "platform_chat_days_user_id_idx" ON "platform_chat_days"("user_id");

-- CreateIndex: platform_leaderboard_period_results_period_key_user_id_unique
CREATE UNIQUE INDEX IF NOT EXISTS "platform_leaderboard_period_results_period_key_user_id_key" ON "platform_leaderboard_period_results"("period_key", "user_id");

-- CreateIndex: platform_leaderboard_period_results_period_key_rank
CREATE INDEX IF NOT EXISTS "platform_leaderboard_period_results_period_key_rank_idx" ON "platform_leaderboard_period_results"("period_key", "rank");

-- CreateIndex: platform_monthly_winners_month_key_unique
CREATE UNIQUE INDEX IF NOT EXISTS "platform_monthly_winners_month_key_key" ON "platform_monthly_winners"("month_key");

-- CreateIndex: platform_monthly_winners_user_id
CREATE INDEX IF NOT EXISTS "platform_monthly_winners_user_id_idx" ON "platform_monthly_winners"("user_id");

-- CreateIndex: platform_watch_time_aggregates_user_id_unique
CREATE UNIQUE INDEX IF NOT EXISTS "platform_watch_time_aggregates_user_id_key" ON "platform_watch_time_aggregates"("user_id");

-- AddForeignKey: platform_user_achievements_user_id_fkey
DO $$ BEGIN
 ALTER TABLE "platform_user_achievements" ADD CONSTRAINT "platform_user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: platform_user_achievements_achievement_id_fkey
DO $$ BEGIN
 ALTER TABLE "platform_user_achievements" ADD CONSTRAINT "platform_user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "platform_achievement_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: platform_coin_ledger_user_id_fkey
DO $$ BEGIN
 ALTER TABLE "platform_coin_ledger" ADD CONSTRAINT "platform_coin_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: platform_dashboard_login_days_user_id_fkey
DO $$ BEGIN
 ALTER TABLE "platform_dashboard_login_days" ADD CONSTRAINT "platform_dashboard_login_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: platform_chat_counters_user_id_fkey
DO $$ BEGIN
 ALTER TABLE "platform_chat_counters" ADD CONSTRAINT "platform_chat_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: platform_chat_days_user_id_fkey
DO $$ BEGIN
 ALTER TABLE "platform_chat_days" ADD CONSTRAINT "platform_chat_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: platform_leaderboard_period_results_user_id_fkey
DO $$ BEGIN
 ALTER TABLE "platform_leaderboard_period_results" ADD CONSTRAINT "platform_leaderboard_period_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: platform_monthly_winners_user_id_fkey
DO $$ BEGIN
 ALTER TABLE "platform_monthly_winners" ADD CONSTRAINT "platform_monthly_winners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: platform_watch_time_aggregates_user_id_fkey
DO $$ BEGIN
 ALTER TABLE "platform_watch_time_aggregates" ADD CONSTRAINT "platform_watch_time_aggregates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Seed Achievement Definitions
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
  ('SF_LEGEND_OF_THE_MONTH', 'SPECIAL', 'SF Legend of the Month', 'Earn the most points in a calendar month', 1500, true, 501, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "category" = EXCLUDED."category",
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "reward_coins" = EXCLUDED."reward_coins",
  "claimable" = EXCLUDED."claimable",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;
