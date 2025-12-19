-- Wheel overlay tables for OBS browser source + admin controller

CREATE TABLE IF NOT EXISTS "wheel_overlay_state" (
  "key" TEXT NOT NULL DEFAULT 'default',
  "mode" TEXT NOT NULL DEFAULT 'raffle',
  "raffle_id" BIGINT,
  "title" TEXT,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "locked_entries" JSONB,
  "locked_total_tickets" INTEGER,
  "wheel_background_url" TEXT,
  "center_logo_url" TEXT,
  "slice_opacity" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wheel_overlay_state_pkey" PRIMARY KEY ("key")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wheel_overlay_state_raffle_id_fkey'
  ) THEN
    ALTER TABLE "wheel_overlay_state"
      ADD CONSTRAINT "wheel_overlay_state_raffle_id_fkey"
      FOREIGN KEY ("raffle_id") REFERENCES "raffles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "wheel_overlay_entrants" (
  "id" BIGSERIAL NOT NULL,
  "overlay_key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wheel_overlay_entrants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "wheel_overlay_entrants_overlay_key_idx" ON "wheel_overlay_entrants"("overlay_key");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wheel_overlay_entrants_overlay_key_fkey'
  ) THEN
    ALTER TABLE "wheel_overlay_entrants"
      ADD CONSTRAINT "wheel_overlay_entrants_overlay_key_fkey"
      FOREIGN KEY ("overlay_key") REFERENCES "wheel_overlay_state"("key")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "wheel_overlay_spins" (
  "id" BIGSERIAL NOT NULL,
  "overlay_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "mode" TEXT NOT NULL,
  "raffle_id" BIGINT,
  "target_ticket_index" INTEGER NOT NULL,
  "winner_label" TEXT NOT NULL,
  "winner_user_id" BIGINT,
  "winner_entry_id" BIGINT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wheel_overlay_spins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wheel_overlay_spins_overlay_key_version_key" ON "wheel_overlay_spins"("overlay_key", "version");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wheel_overlay_spins_overlay_key_fkey'
  ) THEN
    ALTER TABLE "wheel_overlay_spins"
      ADD CONSTRAINT "wheel_overlay_spins_overlay_key_fkey"
      FOREIGN KEY ("overlay_key") REFERENCES "wheel_overlay_state"("key")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;














