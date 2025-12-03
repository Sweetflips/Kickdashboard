-- Fix: Create point_award_jobs table if it doesn't exist
-- Run with: psql -h mainline.proxy.rlwy.net -U postgres -p 46309 -d railway -f fix-point-award-jobs.sql

-- Check if table exists first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'point_award_jobs'
    ) THEN
        -- CreateTable
        CREATE TABLE "point_award_jobs" (
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
            "updated_at" TIMESTAMP(3) NOT NULL,

            CONSTRAINT "point_award_jobs_pkey" PRIMARY KEY ("id")
        );

        -- CreateIndex
        CREATE UNIQUE INDEX "point_award_jobs_message_id_key" ON "point_award_jobs"("message_id");

        -- CreateIndex
        CREATE INDEX "point_award_jobs_status_created_at_idx" ON "point_award_jobs"("status", "created_at");

        -- CreateIndex
        CREATE INDEX "point_award_jobs_status_locked_at_idx" ON "point_award_jobs"("status", "locked_at");

        RAISE NOTICE '✅ Successfully created point_award_jobs table';
    ELSE
        RAISE NOTICE '✅ point_award_jobs table already exists';
    END IF;
END $$;







