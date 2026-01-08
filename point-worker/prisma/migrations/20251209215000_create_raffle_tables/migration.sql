-- CreateTable: raffles
CREATE TABLE IF NOT EXISTS "raffles" (
    "id" BIGSERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "prize_description" TEXT NOT NULL,
    "ticket_cost" INTEGER NOT NULL,
    "max_tickets_per_user" INTEGER,
    "total_tickets_cap" INTEGER,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "sub_only" BOOLEAN NOT NULL DEFAULT false,
    "hidden_until_start" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "draw_seed" TEXT,
    "drawn_at" TIMESTAMP(3),
    "claim_message" TEXT,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raffles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: raffle_entries
CREATE TABLE IF NOT EXISTS "raffle_entries" (
    "id" BIGSERIAL NOT NULL,
    "raffle_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "tickets" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raffle_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "raffle_entries_raffle_id_user_id_key" ON "raffle_entries"("raffle_id", "user_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'raffles_created_by_fkey'
    ) THEN
        ALTER TABLE "raffles" ADD CONSTRAINT "raffles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'raffle_entries_raffle_id_fkey'
    ) THEN
        ALTER TABLE "raffle_entries" ADD CONSTRAINT "raffle_entries_raffle_id_fkey" FOREIGN KEY ("raffle_id") REFERENCES "raffles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'raffle_entries_user_id_fkey'
    ) THEN
        ALTER TABLE "raffle_entries" ADD CONSTRAINT "raffle_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
