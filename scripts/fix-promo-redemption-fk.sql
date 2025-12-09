-- Fix promo_code_redemptions foreign key constraint
-- Drop the incorrect foreign key constraint
ALTER TABLE "promo_code_redemptions" DROP CONSTRAINT IF EXISTS "promo_code_redemptions_user_id_fkey";

-- Add the correct foreign key constraint (referencing users.id instead of kick_user_id)
ALTER TABLE "promo_code_redemptions" 
ADD CONSTRAINT "promo_code_redemptions_user_id_fkey" 
FOREIGN KEY ("user_id") REFERENCES "users"("id") 
ON DELETE RESTRICT ON UPDATE CASCADE;
