-- Add connected accounts fields to users table
-- Check if columns exist before adding to avoid errors on re-run

DO $$
BEGIN
    -- Discord fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='discord_user_id') THEN
        ALTER TABLE "users" ADD COLUMN "discord_user_id" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='discord_username') THEN
        ALTER TABLE "users" ADD COLUMN "discord_username" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='discord_access_token_hash') THEN
        ALTER TABLE "users" ADD COLUMN "discord_access_token_hash" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='discord_connected') THEN
        ALTER TABLE "users" ADD COLUMN "discord_connected" BOOLEAN NOT NULL DEFAULT false;
    END IF;

    -- Telegram fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='telegram_user_id') THEN
        ALTER TABLE "users" ADD COLUMN "telegram_user_id" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='telegram_username') THEN
        ALTER TABLE "users" ADD COLUMN "telegram_username" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='telegram_access_token_hash') THEN
        ALTER TABLE "users" ADD COLUMN "telegram_access_token_hash" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='telegram_connected') THEN
        ALTER TABLE "users" ADD COLUMN "telegram_connected" BOOLEAN NOT NULL DEFAULT false;
    END IF;

    -- Kick connected field
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='kick_connected') THEN
        ALTER TABLE "users" ADD COLUMN "kick_connected" BOOLEAN NOT NULL DEFAULT true;
        -- Set existing users to connected
        UPDATE "users" SET "kick_connected" = true WHERE "kick_connected" IS NULL;
    END IF;
END $$;
