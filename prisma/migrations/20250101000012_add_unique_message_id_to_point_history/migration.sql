-- CreateIndex
CREATE UNIQUE INDEX "point_history_message_id_key" ON "point_history"("message_id") WHERE "message_id" IS NOT NULL;









