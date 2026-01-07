import pg from 'pg'
const { Client } = pg

const dbUrl = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'

const client = new Client({ connectionString: dbUrl })

async function createMissingTables() {
  await client.connect()
  console.log('Connected to database\n')

  const statements = [
    // Create enum types if they don't exist
    `DO $$ BEGIN
      CREATE TYPE "AchievementCategory" AS ENUM ('SOCIAL', 'PLATFORM', 'CHAT', 'STREAMER');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    `DO $$ BEGIN
      CREATE TYPE "AchievementStatus" AS ENUM ('LOCKED', 'UNLOCKED', 'CLAIMED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    // Create platform_achievement_definitions table
    `CREATE TABLE IF NOT EXISTS "platform_achievement_definitions" (
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
    )`,

    // Create platform_user_achievements table
    `CREATE TABLE IF NOT EXISTS "platform_user_achievements" (
      "id" BIGSERIAL NOT NULL,
      "user_id" BIGINT NOT NULL,
      "achievement_id" TEXT NOT NULL,
      "status" "AchievementStatus" NOT NULL DEFAULT 'LOCKED',
      "unlocked_at" TIMESTAMP(3),
      "claimed_at" TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "platform_user_achievements_pkey" PRIMARY KEY ("id")
    )`,

    // Create platform_coin_ledger table
    `CREATE TABLE IF NOT EXISTS "platform_coin_ledger" (
      "id" BIGSERIAL NOT NULL,
      "user_id" BIGINT NOT NULL,
      "amount" INTEGER NOT NULL,
      "reason" TEXT NOT NULL,
      "ref_id" TEXT,
      "metadata" JSONB,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "platform_coin_ledger_pkey" PRIMARY KEY ("id")
    )`,

    // Create platform_dashboard_login_days table
    `CREATE TABLE IF NOT EXISTS "platform_dashboard_login_days" (
      "id" BIGSERIAL NOT NULL,
      "user_id" BIGINT NOT NULL,
      "day" DATE NOT NULL,
      "month_key" TEXT NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "platform_dashboard_login_days_pkey" PRIMARY KEY ("id")
    )`,

    // Create platform_chat_counters table
    `CREATE TABLE IF NOT EXISTS "platform_chat_counters" (
      "id" BIGSERIAL NOT NULL,
      "user_id" BIGINT NOT NULL,
      "message_count" INTEGER NOT NULL DEFAULT 0,
      "emote_count" INTEGER NOT NULL DEFAULT 0,
      "updated_at" TIMESTAMP(3) NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "platform_chat_counters_pkey" PRIMARY KEY ("id")
    )`,

    // Create platform_chat_days table
    `CREATE TABLE IF NOT EXISTS "platform_chat_days" (
      "id" BIGSERIAL NOT NULL,
      "user_id" BIGINT NOT NULL,
      "day" DATE NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "platform_chat_days_pkey" PRIMARY KEY ("id")
    )`,

    // Create platform_leaderboard_period_results table
    `CREATE TABLE IF NOT EXISTS "platform_leaderboard_period_results" (
      "id" BIGSERIAL NOT NULL,
      "period_key" TEXT NOT NULL,
      "user_id" BIGINT NOT NULL,
      "rank" INTEGER NOT NULL,
      "points" INTEGER NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "platform_leaderboard_period_results_pkey" PRIMARY KEY ("id")
    )`,

    // Create platform_monthly_winners table
    `CREATE TABLE IF NOT EXISTS "platform_monthly_winners" (
      "id" BIGSERIAL NOT NULL,
      "month_key" TEXT NOT NULL,
      "user_id" BIGINT NOT NULL,
      "points" INTEGER NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "platform_monthly_winners_pkey" PRIMARY KEY ("id")
    )`,

    // Create platform_watch_time_aggregates table
    `CREATE TABLE IF NOT EXISTS "platform_watch_time_aggregates" (
      "id" BIGSERIAL NOT NULL,
      "user_id" BIGINT NOT NULL,
      "total_minutes" INTEGER NOT NULL DEFAULT 0,
      "last_updated_at" TIMESTAMP(3) NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "platform_watch_time_aggregates_pkey" PRIMARY KEY ("id")
    )`,

    // Create unique constraints
    `CREATE UNIQUE INDEX IF NOT EXISTS "platform_user_achievements_user_id_achievement_id_key" ON "platform_user_achievements"("user_id", "achievement_id")`,
    `CREATE INDEX IF NOT EXISTS "platform_user_achievements_user_id_idx" ON "platform_user_achievements"("user_id")`,
    `CREATE INDEX IF NOT EXISTS "platform_user_achievements_achievement_id_idx" ON "platform_user_achievements"("achievement_id")`,
    `CREATE INDEX IF NOT EXISTS "platform_user_achievements_status_idx" ON "platform_user_achievements"("status")`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "platform_coin_ledger_user_id_ref_id_key" ON "platform_coin_ledger"("user_id", "ref_id")`,
    `CREATE INDEX IF NOT EXISTS "platform_coin_ledger_user_id_created_at_idx" ON "platform_coin_ledger"("user_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "platform_coin_ledger_reason_idx" ON "platform_coin_ledger"("reason")`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "platform_dashboard_login_days_user_id_day_key" ON "platform_dashboard_login_days"("user_id", "day")`,
    `CREATE INDEX IF NOT EXISTS "platform_dashboard_login_days_user_id_month_key_idx" ON "platform_dashboard_login_days"("user_id", "month_key")`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "platform_chat_counters_user_id_key" ON "platform_chat_counters"("user_id")`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "platform_chat_days_user_id_day_key" ON "platform_chat_days"("user_id", "day")`,
    `CREATE INDEX IF NOT EXISTS "platform_chat_days_user_id_idx" ON "platform_chat_days"("user_id")`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "platform_leaderboard_period_results_period_key_user_id_key" ON "platform_leaderboard_period_results"("period_key", "user_id")`,
    `CREATE INDEX IF NOT EXISTS "platform_leaderboard_period_results_period_key_rank_idx" ON "platform_leaderboard_period_results"("period_key", "rank")`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "platform_monthly_winners_month_key_key" ON "platform_monthly_winners"("month_key")`,
    `CREATE INDEX IF NOT EXISTS "platform_monthly_winners_user_id_idx" ON "platform_monthly_winners"("user_id")`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "platform_watch_time_aggregates_user_id_key" ON "platform_watch_time_aggregates"("user_id")`,

    // Add foreign key constraints
    `DO $$ BEGIN
      ALTER TABLE "platform_user_achievements" ADD CONSTRAINT "platform_user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE "platform_user_achievements" ADD CONSTRAINT "platform_user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "platform_achievement_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE "platform_coin_ledger" ADD CONSTRAINT "platform_coin_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE "platform_dashboard_login_days" ADD CONSTRAINT "platform_dashboard_login_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE "platform_chat_counters" ADD CONSTRAINT "platform_chat_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE "platform_chat_days" ADD CONSTRAINT "platform_chat_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE "platform_leaderboard_period_results" ADD CONSTRAINT "platform_leaderboard_period_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE "platform_monthly_winners" ADD CONSTRAINT "platform_monthly_winners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE "platform_watch_time_aggregates" ADD CONSTRAINT "platform_watch_time_aggregates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,
  ]

  for (const sql of statements) {
    try {
      await client.query(sql)
      console.log('✅ Executed:', sql.substring(0, 60).replace(/\n/g, ' ') + '...')
    } catch (err: any) {
      console.error('❌ Error:', err.message)
      console.error('   SQL:', sql.substring(0, 100).replace(/\n/g, ' '))
    }
  }

  console.log('\n✅ All tables created!')
  await client.end()
}

createMissingTables().catch(console.error)
