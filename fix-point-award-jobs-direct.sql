-- Direct SQL commands to create point_award_jobs table
-- Copy and paste these into psql

-- Check if table exists (optional - just to verify)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'point_award_jobs';

-- Create table (safe to run even if exists - will error but that's fine)
CREATE TABLE IF NOT EXISTS "point_award_jobs" (
    "id" BIGSERIAL NOT NULL,
    "kick_user_id" BIGINT NOT NULL,
    "stream_session_id" BIGINT,
    "message_id" TEXT NOT NULL,
    "badges" JSONB,
    "emotes" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "point_award_jobs_pkey" PRIMARY KEY ("id")
);

-- Create unique index on message_id
CREATE UNIQUE INDEX IF NOT EXISTS "point_award_jobs_message_id_key" ON "point_award_jobs"("message_id");

-- Create status indexes
CREATE INDEX IF NOT EXISTS "point_award_jobs_status_created_at_idx" ON "point_award_jobs"("status", "created_at");
CREATE INDEX IF NOT EXISTS "point_award_jobs_status_locked_at_idx" ON "point_award_jobs"("status", "locked_at");

-- Verify table was created
SELECT COUNT(*) FROM "point_award_jobs";







