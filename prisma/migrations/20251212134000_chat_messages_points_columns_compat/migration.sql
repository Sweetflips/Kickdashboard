-- Compatibility migration: older worker code writes/reads `chat_messages.points_earned` + `points_reason`
-- while newer DBs use `sweet_coins_earned` + `sweet_coins_reason`.
-- This migration re-introduces the legacy columns and keeps them in sync.

DO $$
DECLARE
  has_points_earned boolean;
  has_points_reason boolean;
  has_sweet_coins_earned boolean;
  has_sweet_coins_reason boolean;
BEGIN
  IF to_regclass('public.chat_messages') IS NULL THEN
    RAISE NOTICE 'chat_messages does not exist; skipping points compat migration';
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

  -- Add legacy columns if missing
  IF NOT has_points_earned THEN
    EXECUTE 'ALTER TABLE "chat_messages" ADD COLUMN "points_earned" INTEGER NOT NULL DEFAULT 0';
  END IF;

  IF NOT has_points_reason THEN
    EXECUTE 'ALTER TABLE "chat_messages" ADD COLUMN "points_reason" TEXT';
  END IF;

  -- Backfill legacy columns from sweet coins columns if those exist
  IF has_sweet_coins_earned THEN
    EXECUTE 'UPDATE "chat_messages" SET "points_earned" = "sweet_coins_earned" WHERE "points_earned" IS DISTINCT FROM "sweet_coins_earned"';
  END IF;

  IF has_sweet_coins_reason THEN
    EXECUTE 'UPDATE "chat_messages" SET "points_reason" = "sweet_coins_reason" WHERE "points_reason" IS DISTINCT FROM "sweet_coins_reason"';
  END IF;

  -- If both sets exist, create a trigger to keep them synced both directions
  IF has_sweet_coins_earned AND has_sweet_coins_reason THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION chat_messages_points_sweet_coins_sync()
      RETURNS trigger AS $fn$
      BEGIN
        -- Normalize NULLs to keep both sets aligned
        IF NEW.points_earned IS NULL THEN
          NEW.points_earned := COALESCE(NEW.sweet_coins_earned, 0);
        END IF;
        IF NEW.sweet_coins_earned IS NULL THEN
          NEW.sweet_coins_earned := COALESCE(NEW.points_earned, 0);
        END IF;

        -- If either side changed, force both equal (prefer explicit points_earned if present)
        IF TG_OP = 'INSERT' THEN
          NEW.sweet_coins_earned := NEW.points_earned;
          NEW.sweet_coins_reason := NEW.points_reason;
        ELSE
          IF NEW.points_earned IS DISTINCT FROM OLD.points_earned OR NEW.points_reason IS DISTINCT FROM OLD.points_reason THEN
            NEW.sweet_coins_earned := NEW.points_earned;
            NEW.sweet_coins_reason := NEW.points_reason;
          ELSIF NEW.sweet_coins_earned IS DISTINCT FROM OLD.sweet_coins_earned OR NEW.sweet_coins_reason IS DISTINCT FROM OLD.sweet_coins_reason THEN
            NEW.points_earned := NEW.sweet_coins_earned;
            NEW.points_reason := NEW.sweet_coins_reason;
          END IF;
        END IF;

        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql;
    $sql$;

    EXECUTE 'DROP TRIGGER IF EXISTS chat_messages_points_sweet_coins_sync_trg ON "chat_messages"';
    EXECUTE 'CREATE TRIGGER chat_messages_points_sweet_coins_sync_trg BEFORE INSERT OR UPDATE ON "chat_messages" FOR EACH ROW EXECUTE FUNCTION chat_messages_points_sweet_coins_sync()';
  END IF;
END $$;


