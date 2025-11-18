-- AlterTable
ALTER TABLE "users" ADD COLUMN "custom_profile_picture_url" TEXT;
ALTER TABLE "users" ADD COLUMN "notifications_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "chat_font_size" TEXT DEFAULT '14px';
ALTER TABLE "users" ADD COLUMN "chat_show_timestamps" BOOLEAN NOT NULL DEFAULT true;













