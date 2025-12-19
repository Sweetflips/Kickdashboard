-- CreateTable
CREATE TABLE IF NOT EXISTS "moderation_action_logs" (
    "id" BIGSERIAL NOT NULL,
    "broadcaster_user_id" BIGINT NOT NULL,
    "target_user_id" BIGINT NOT NULL,
    "target_username" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "reason" TEXT,
    "rule_id" TEXT,
    "ai_flagged" BOOLEAN NOT NULL DEFAULT false,
    "ai_categories" JSONB,
    "ai_max_score" DOUBLE PRECISION,
    "message_content" TEXT,
    "message_id" TEXT,
    "raid_mode_active" BOOLEAN NOT NULL DEFAULT false,
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bot_reply_logs" (
    "id" BIGSERIAL NOT NULL,
    "broadcaster_user_id" BIGINT NOT NULL,
    "trigger_user_id" BIGINT NOT NULL,
    "trigger_username" TEXT NOT NULL,
    "trigger_message" TEXT NOT NULL,
    "reply_content" TEXT NOT NULL,
    "reply_type" TEXT NOT NULL,
    "ai_model" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_reply_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "moderation_action_logs_broadcaster_user_id_created_at_idx" ON "moderation_action_logs"("broadcaster_user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "moderation_action_logs_target_user_id_created_at_idx" ON "moderation_action_logs"("target_user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "moderation_action_logs_action_type_created_at_idx" ON "moderation_action_logs"("action_type", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "moderation_action_logs_rule_id_created_at_idx" ON "moderation_action_logs"("rule_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "moderation_action_logs_ai_flagged_created_at_idx" ON "moderation_action_logs"("ai_flagged", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bot_reply_logs_broadcaster_user_id_created_at_idx" ON "bot_reply_logs"("broadcaster_user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bot_reply_logs_reply_type_created_at_idx" ON "bot_reply_logs"("reply_type", "created_at");
