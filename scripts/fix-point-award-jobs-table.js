#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function fixTable() {
  try {
    console.log('🔄 Checking if point_award_jobs table exists...');

    // Check if table exists
    const checkResult = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'point_award_jobs'
    `;

    if (Array.isArray(checkResult) && checkResult.length > 0) {
      console.log('✅ point_award_jobs table already exists');
      return;
    }

    console.log('⚠️ point_award_jobs table missing, creating it...');

    // Create table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "point_award_jobs" (
        "id" BIGSERIAL NOT NULL,
        "kick_user_id" BIGINT NOT NULL,
        "stream_session_id" BIGINT,
        "message_id" TEXT NOT NULL,
        "badges" JSONB,
        "emotes" JSONB,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "locked_at" TIMESTAMP(3),
        "processed_at" TIMESTAMP(3),
        "last_error" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "point_award_jobs_pkey" PRIMARY KEY ("id")
      )
    `);

    // Create indexes (ignore errors if they already exist)
    try {
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "point_award_jobs_message_id_key" ON "point_award_jobs"("message_id")
      `);
    } catch (e) {
      // Index might already exist, ignore
    }

    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "point_award_jobs_status_created_at_idx" ON "point_award_jobs"("status", "created_at")
      `);
    } catch (e) {
      // Index might already exist, ignore
    }

    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "point_award_jobs_status_locked_at_idx" ON "point_award_jobs"("status", "locked_at")
      `);
    } catch (e) {
      // Index might already exist, ignore
    }

    console.log('✅ Successfully created point_award_jobs table');

  } catch (error) {
    if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
      console.log('✅ point_award_jobs table already exists (created concurrently)');
    } else {
      console.error('❌ Failed to create table:', error.message);
      console.error(error);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

fixTable().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
