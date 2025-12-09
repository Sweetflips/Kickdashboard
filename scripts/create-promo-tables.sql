-- Create PromoCode table
CREATE TABLE IF NOT EXISTS "promo_codes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "points_value" INTEGER NOT NULL,
    "max_uses" INTEGER,
    "current_uses" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- Create PromoCodeRedemption table
CREATE TABLE IF NOT EXISTS "promo_code_redemptions" (
    "id" SERIAL NOT NULL,
    "promo_code_id" INTEGER NOT NULL,
    "user_id" BIGINT NOT NULL,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint on code
CREATE UNIQUE INDEX IF NOT EXISTS "promo_codes_code_key" ON "promo_codes"("code");

-- Add unique constraint to prevent duplicate redemptions
CREATE UNIQUE INDEX IF NOT EXISTS "promo_code_redemptions_promo_code_id_user_id_key" ON "promo_code_redemptions"("promo_code_id", "user_id");

-- Add foreign keys
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'promo_codes_created_by_fkey'
    ) THEN
        ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("kick_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'promo_code_redemptions_promo_code_id_fkey'
    ) THEN
        ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'promo_code_redemptions_user_id_fkey'
    ) THEN
        ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("kick_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Add thumbnail tracking columns to stream_sessions
ALTER TABLE "stream_sessions" 
    ADD COLUMN IF NOT EXISTS "thumbnail_captured_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "thumbnail_last_refreshed_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "thumbnail_source" TEXT;
