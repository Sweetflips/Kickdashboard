-- Drop the incorrect foreign key constraint
ALTER TABLE "promo_codes" DROP CONSTRAINT IF EXISTS "promo_codes_created_by_fkey";

-- Add the correct foreign key constraint (referencing users.id instead of kick_user_id)
ALTER TABLE "promo_codes" 
ADD CONSTRAINT "promo_codes_created_by_fkey" 
FOREIGN KEY ("created_by") REFERENCES "users"("id") 
ON DELETE RESTRICT ON UPDATE CASCADE;
