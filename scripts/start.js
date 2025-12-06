#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

// Run migrations before starting the server
try {
  console.log('🔄 Running database migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Migrations completed');
} catch (error) {
  console.error('⚠️ Migration failed (continuing anyway):', error.message);
  // Continue even if migration fails (might already be applied)
}

// Safety net: Ensure points_reason column exists (handles edge cases where migrate deploy might miss it)
async function ensurePointsReasonColumn() {
  const prisma = new PrismaClient();
  try {
    console.log('🔄 Verifying points_reason column...');

    // Check if column exists
    const checkResult = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'chat_messages' AND column_name = 'points_reason'
    `;

    if (Array.isArray(checkResult) && checkResult.length > 0) {
      console.log('✅ points_reason column already exists');
    } else {
      console.log('⚠️ points_reason column missing, adding it...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "points_reason" TEXT;
      `);
      console.log('✅ Added points_reason column to chat_messages table');
    }
  } catch (error) {
    console.error('⚠️ Points reason migration check failed (continuing anyway):', error.message);
    // Non-critical - column might already exist or will be created on next deploy
  } finally {
    await prisma.$disconnect();
  }
}

// Safety net: Ensure point_award_jobs table exists
async function ensurePointAwardJobsTable() {
  const prisma = new PrismaClient();
  try {
    console.log('🔄 Verifying point_award_jobs table...');

    // Check if table exists
    const checkResult = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'point_award_jobs'
    `;

    if (Array.isArray(checkResult) && checkResult.length > 0) {
      console.log('✅ point_award_jobs table already exists');
    } else {
      console.log('⚠️ point_award_jobs table missing, creating it...');
      const fs = require('fs');
      const path = require('path');
      const migrationSQL = fs.readFileSync(
        path.join(__dirname, '..', 'prisma', 'migrations', '20250101000020_add_point_award_job', 'migration.sql'),
        'utf-8'
      );
      try {
        await prisma.$executeRawUnsafe(migrationSQL);
        console.log('✅ Created point_award_jobs table');
      } catch (createError) {
        // If table was created between check and create, that's fine
        if (createError.message && createError.message.includes('already exists')) {
          console.log('✅ point_award_jobs table already exists (created concurrently)');
        } else {
          throw createError;
        }
      }
    }
  } catch (error) {
    console.error('⚠️ Point award jobs table check failed (continuing anyway):', error.message);
    // Non-critical - table might already exist or will be created on next deploy
  } finally {
    await prisma.$disconnect();
  }
}

// Run the safety net check and wait for it to complete before starting server
(async () => {
  await ensurePointsReasonColumn();
  await ensurePointAwardJobsTable();

  const port = process.env.PORT || '3000';
  const enableWorker = process.env.ENABLE_POINT_WORKER === 'true'; // Default to false, set to 'true' to enable
  console.log(`📌 ENABLE_POINT_WORKER env var = "${process.env.ENABLE_POINT_WORKER}" (enableWorker=${enableWorker})`)

  // Start Next.js server
  const nextProcess = spawn('next', ['start', '-p', port], {
    stdio: 'inherit',
    env: process.env
  });

  // Start chat worker if enabled (handles messages + points)
  let workerProcess = null;
  if (enableWorker) {
    console.log('🔄 Starting chat worker (handles messages + points)...');
    workerProcess = spawn('npx', ['tsx', 'scripts/chat-worker.ts'], {
      stdio: 'inherit',
      env: process.env
    });

    workerProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`⚠️ Point worker exited with code ${code}`);
      }
    });
  } else {
    console.log('⏸️ Point worker disabled (ENABLE_POINT_WORKER=false)');
  }

  // Handle process exits
  nextProcess.on('exit', (code) => {
    if (workerProcess) {
      workerProcess.kill('SIGTERM');
    }
    process.exit(code || 0);
  });

  // Handle graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    nextProcess.kill(signal);
    if (workerProcess) {
      workerProcess.kill(signal);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch(err => {
  console.error('⚠️ Error starting server:', err.message);
  process.exit(1);
});
