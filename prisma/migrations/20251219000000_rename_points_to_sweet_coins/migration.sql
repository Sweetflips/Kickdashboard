-- Rename points columns to sweet_coins columns in chat_messages table
-- This migration adds the new columns if missing and syncs data

DO $$
DECLARE
  has_points_earned boolean;
  has_points_reason boolean;
  has_sweet_coins_earned boolean;
  has_sweet_coins_reason boolean;
BEGIN
  IF to_regclass('public.chat_messages') IS NULL THEN
    RAISE NOTICE 'chat_messages does not exist; skipping migration';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages' AND column_name='points_earned'
  ) INTO has_points_earned;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages' AND column_name='points_reason'
  ) INTO has_points_reason;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages' AND column_name='sweet_coins_earned'
  ) INTO has_sweet_coins_earned;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages' AND column_name='sweet_coins_reason'
  ) INTO has_sweet_coins_reason;

  -- Add sweet_coins_earned if missing
  IF NOT has_sweet_coins_earned THEN
    IF has_points_earned THEN
      -- Rename existing column
      EXECUTE 'ALTER TABLE "chat_messages" RENAME COLUMN "points_earned" TO "sweet_coins_earned"';
      has_sweet_coins_earned := true;
      has_points_earned := false;
    ELSE
      -- Add new column
      EXECUTE 'ALTER TABLE "chat_messages" ADD COLUMN "sweet_coins_earned" INTEGER NOT NULL DEFAULT 0';
      has_sweet_coins_earned := true;
    END IF;
  END IF;

  -- Add sweet_coins_reason if missing
  IF NOT has_sweet_coins_reason THEN
    IF has_points_reason THEN
      -- Rename existing column
      EXECUTE 'ALTER TABLE "chat_messages" RENAME COLUMN "points_reason" TO "sweet_coins_reason"';
      has_sweet_coins_reason := true;
      has_points_reason := false;
    ELSE
      -- Add new column
      EXECUTE 'ALTER TABLE "chat_messages" ADD COLUMN "sweet_coins_reason" TEXT';
      has_sweet_coins_reason := true;
    END IF;
  END IF;

  -- If we still have the old columns alongside the new ones, sync and drop old trigger
  IF has_points_earned AND has_sweet_coins_earned THEN
    -- Sync data from old to new
    EXECUTE 'UPDATE "chat_messages" SET "sweet_coins_earned" = "points_earned" WHERE "sweet_coins_earned" IS DISTINCT FROM "points_earned"';
  END IF;

  IF has_points_reason AND has_sweet_coins_reason THEN
    -- Sync data from old to new
    EXECUTE 'UPDATE "chat_messages" SET "sweet_coins_reason" = "points_reason" WHERE "sweet_coins_reason" IS DISTINCT FROM "points_reason"';
  END IF;

  -- Drop the old compat trigger if it exists (it references both column sets which may cause issues)
  EXECUTE 'DROP TRIGGER IF EXISTS chat_messages_points_sweet_coins_sync_trg ON "chat_messages"';
  EXECUTE 'DROP FUNCTION IF EXISTS chat_messages_points_sweet_coins_sync()';
END $$;
