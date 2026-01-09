-- AlterTable
-- Add referee_reward_awarded column to track if referee reward was awarded
ALTER TABLE "platform_referral_rewards" ADD COLUMN IF NOT EXISTS "referee_reward_awarded" BOOLEAN NOT NULL DEFAULT false;
