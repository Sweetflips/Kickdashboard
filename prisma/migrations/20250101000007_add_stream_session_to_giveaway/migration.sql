-- Add stream_session_id column to giveaways table
ALTER TABLE "giveaways" ADD COLUMN IF NOT EXISTS "stream_session_id" BIGINT;

-- Add foreign key constraint
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_stream_session_id_fkey"
FOREIGN KEY ("stream_session_id") REFERENCES "stream_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

