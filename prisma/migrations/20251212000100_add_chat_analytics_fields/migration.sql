-- Add derived analytics fields to avoid full-table scans and content parsing at read-time

ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "has_emotes" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "engagement_type" text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS "message_length" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "exclamation_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sentence_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "offline_chat_messages"
  ADD COLUMN IF NOT EXISTS "has_emotes" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "engagement_type" text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS "message_length" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "exclamation_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sentence_count" integer NOT NULL DEFAULT 0;

-- Helpful indexes for analytics queries
CREATE INDEX IF NOT EXISTS "idx_chat_messages_has_emotes" ON "chat_messages" ("has_emotes");
CREATE INDEX IF NOT EXISTS "idx_chat_messages_engagement_type" ON "chat_messages" ("engagement_type");
CREATE INDEX IF NOT EXISTS "idx_chat_messages_created_at" ON "chat_messages" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_chat_messages_sender_user_id" ON "chat_messages" ("sender_user_id");





