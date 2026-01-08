-- CreateTable
CREATE TABLE IF NOT EXISTS "purchase_transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "points_spent" INTEGER NOT NULL,
    "item_name" TEXT NOT NULL,
    "advent_item_id" TEXT,
    "raffle_id" BIGINT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "purchase_transactions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "purchase_transactions"
ADD CONSTRAINT "purchase_transactions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "purchase_transactions_user_id_created_at_idx"
ON "purchase_transactions" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "purchase_transactions_type_created_at_idx"
ON "purchase_transactions" ("type", "created_at");

CREATE INDEX IF NOT EXISTS "purchase_transactions_raffle_id_idx"
ON "purchase_transactions" ("raffle_id");

CREATE INDEX IF NOT EXISTS "purchase_transactions_advent_item_id_idx"
ON "purchase_transactions" ("advent_item_id");














