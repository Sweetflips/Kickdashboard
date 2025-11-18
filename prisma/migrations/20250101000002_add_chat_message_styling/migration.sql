-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "sender_username_color" TEXT,
ADD COLUMN "sender_badges" JSONB,
ADD COLUMN "sender_is_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sender_is_anonymous" BOOLEAN NOT NULL DEFAULT false;
















