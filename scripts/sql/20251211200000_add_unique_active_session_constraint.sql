-- Add partial unique index to prevent duplicate active sessions per broadcaster
-- This ensures only ONE active session (ended_at IS NULL) can exist per broadcaster

-- First, let's add a grace period column to track when session was last verified as live
ALTER TABLE "stream_sessions" ADD COLUMN IF NOT EXISTS "last_live_check_at" TIMESTAMP(3);

-- Create partial unique index - only enforced when ended_at IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS "stream_sessions_broadcaster_active_unique"
ON "stream_sessions" ("broadcaster_user_id")
WHERE "ended_at" IS NULL;

-- Add index for efficient lookups by broadcaster and status
CREATE INDEX IF NOT EXISTS "stream_sessions_broadcaster_ended_idx"
ON "stream_sessions" ("broadcaster_user_id", "ended_at");
