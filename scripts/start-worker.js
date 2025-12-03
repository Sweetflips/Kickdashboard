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
  // Continue even if migration fails (might already be applied)
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

// Run the safety net check and wait for it to complete before starting worker
(async () => {
  await ensurePointAwardJobsTable();

  // Start point worker
  console.log('🔄 Starting point award worker...');
  // Use npx tsx to run TypeScript
  const { spawn } = require('child_process');
  const workerProcess = spawn('npx', ['tsx', 'scripts/point-worker.ts'], {
    stdio: 'inherit',
    env: process.env
  });

  workerProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`⚠️ Point worker exited with code ${code}`);
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






