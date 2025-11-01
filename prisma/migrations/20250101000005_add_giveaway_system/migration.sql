-- CreateTable
CREATE TABLE "giveaways" (
    "id" BIGSERIAL NOT NULL,
    "broadcaster_user_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "prize_info" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "entry_min_points" INTEGER NOT NULL DEFAULT 0,
    "scheduled_start" TIMESTAMP(3),
    "scheduled_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giveaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_segments" (
    "id" BIGSERIAL NOT NULL,
    "giveaway_id" BIGINT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "color" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_entries" (
    "id" BIGSERIAL NOT NULL,
    "giveaway_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "points_at_entry" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_winners" (
    "id" BIGSERIAL NOT NULL,
    "giveaway_id" BIGINT NOT NULL,
    "entry_id" BIGINT NOT NULL,
    "segment_id" BIGINT,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_winners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_entries_giveaway_id_user_id_key" ON "giveaway_entries"("giveaway_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_winners_entry_id_key" ON "giveaway_winners"("entry_id");

-- AddForeignKey
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_broadcaster_user_id_fkey" FOREIGN KEY ("broadcaster_user_id") REFERENCES "users"("kick_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_segments" ADD CONSTRAINT "giveaway_segments_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("kick_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "giveaway_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "giveaway_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

