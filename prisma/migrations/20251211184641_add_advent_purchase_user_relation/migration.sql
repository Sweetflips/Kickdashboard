-- AlterTable
ALTER TABLE "advent_purchases" ADD CONSTRAINT "advent_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
