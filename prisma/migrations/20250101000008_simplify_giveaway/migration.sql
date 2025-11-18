-- Add prize_amount and number_of_winners columns to giveaways table
ALTER TABLE "giveaways" ADD COLUMN IF NOT EXISTS "prize_amount" TEXT;
ALTER TABLE "giveaways" ADD COLUMN IF NOT EXISTS "number_of_winners" INTEGER NOT NULL DEFAULT 1;

-- Migrate existing prize_info to prize_amount if needed
UPDATE "giveaways" SET "prize_amount" = "prize_info" WHERE "prize_amount" IS NULL AND "prize_info" IS NOT NULL;














