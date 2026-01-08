-- CreateTable Referral
CREATE TABLE IF NOT EXISTS "referrals" (
    "id" BIGSERIAL NOT NULL,
    "referrer_user_id" BIGINT NOT NULL,
    "referee_user_id" BIGINT NOT NULL,
    "referral_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable ReferralReward
CREATE TABLE IF NOT EXISTS "referral_rewards" (
    "id" BIGSERIAL NOT NULL,
    "referrer_user_id" BIGINT NOT NULL,
    "referee_user_id" BIGINT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "required_points" INTEGER NOT NULL,
    "reward_points" INTEGER NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referee_user_id_key" ON "referrals"("referee_user_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_user_id_idx" ON "referrals"("referrer_user_id");

-- CreateIndex
CREATE INDEX "referrals_referral_code_idx" ON "referrals"("referral_code");

-- CreateIndex
CREATE INDEX "referrals_created_at_idx" ON "referrals"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_referrer_user_id_referee_user_id_tier_id_key" ON "referral_rewards"("referrer_user_id", "referee_user_id", "tier_id");

-- CreateIndex
CREATE INDEX "referral_rewards_referrer_user_id_idx" ON "referral_rewards"("referrer_user_id");

-- CreateIndex
CREATE INDEX "referral_rewards_awarded_at_idx" ON "referral_rewards"("awarded_at");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_user_id_fkey" FOREIGN KEY ("referee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
