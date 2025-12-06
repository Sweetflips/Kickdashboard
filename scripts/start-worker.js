#!/usr/bin/env node
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

// Run migrations before starting the worker
try {
  console.log('🔄 Running database migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Migrations completed');
} catch (error) {
  console.error('⚠️ Migration failed (continuing anyway):', error.message);
}

// Safety net: Ensure required tables exist
async function ensureTables() {
  const prisma = new PrismaClient();
  try {
    console.log('🔄 Verifying database tables...');

    // Check for chat_jobs table
    const chatJobsCheck = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'chat_jobs'
    `;

    if (Array.isArray(chatJobsCheck) && chatJobsCheck.length > 0) {
      console.log('✅ chat_jobs table exists');
    } else {
      console.log('⚠️ chat_jobs table missing, creating it...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "chat_jobs" (
          "id" BIGSERIAL NOT NULL,
          "message_id" TEXT NOT NULL,
          "payload" JSONB NOT NULL,
          "sender_user_id" BIGINT NOT NULL,
          "broadcaster_user_id" BIGINT NOT NULL,
          "stream_session_id" BIGINT,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "locked_at" TIMESTAMP(3),
          "processed_at" TIMESTAMP(3),
          "last_error" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "chat_jobs_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "chat_jobs_message_id_key" ON "chat_jobs"("message_id");
        CREATE INDEX IF NOT EXISTS "chat_jobs_status_created_at_idx" ON "chat_jobs"("status", "created_at");
        CREATE INDEX IF NOT EXISTS "chat_jobs_status_locked_at_idx" ON "chat_jobs"("status", "locked_at");
      `);
      console.log('✅ Created chat_jobs table');
    }

    // Also check point_award_jobs for backward compatibility
    const pointJobsCheck = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'point_award_jobs'
    `;

    if (Array.isArray(pointJobsCheck) && pointJobsCheck.length > 0) {
      console.log('✅ point_award_jobs table exists');
    }

  } catch (error) {
    console.error('⚠️ Table check failed (continuing anyway):', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the safety net check and wait for it to complete before starting worker
(async () => {
  await ensureTables();

  // Start chat worker (handles all writes: users, messages, points)
  console.log('🔄 Starting chat worker (handles all database writes)...');
  const { spawn } = require('child_process');
  const workerProcess = spawn('npx', ['tsx', 'scripts/chat-worker.ts'], {
    stdio: 'inherit',
    env: process.env
  });

  workerProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`⚠️ Chat worker exited with code ${code}`);
      process.exit(code);
    }
    process.exit(0);
  });

  // Handle graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down worker...`);
    workerProcess.kill(signal);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch(err => {
  console.error('⚠️ Error starting worker:', err.message);
  process.exit(1);
});
