-- AlterTable
ALTER TABLE "raffle_entries" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "raffle_winners" ADD COLUMN     "is_rigged" BOOLEAN DEFAULT false,
ADD COLUMN     "selected_ticket_index" BIGINT,
ADD COLUMN     "spin_number" INTEGER;

-- AlterTable
ALTER TABLE "raffles" ADD COLUMN     "number_of_winners" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "rigging_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "raffle_rigged_winners" (
    "id" BIGSERIAL NOT NULL,
    "raffle_id" BIGINT NOT NULL,
    "entry_id" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "raffle_rigged_winners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "raffle_rigged_winners_raffle_id_position_key" ON "raffle_rigged_winners"("raffle_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "point_history_message_id_key" ON "point_history"("message_id");

-- AddForeignKey
ALTER TABLE "raffle_rigged_winners" ADD CONSTRAINT "raffle_rigged_winners_raffle_id_fkey" FOREIGN KEY ("raffle_id") REFERENCES "raffles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raffle_rigged_winners" ADD CONSTRAINT "raffle_rigged_winners_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "raffle_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advent_purchases" ADD CONSTRAINT "advent_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advent_day_status" ADD CONSTRAINT "advent_day_status_drawn_by_fkey" FOREIGN KEY ("drawn_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

