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

// Run the safety net check and wait for it to complete before starting server
(async () => {
  await ensurePointsReasonColumn();

  const port = process.env.PORT || '3000';
  const nextProcess = spawn('next', ['start', '-p', port], {
    stdio: 'inherit',
    env: process.env
  });

  nextProcess.on('exit', (code) => {
    process.exit(code || 0);
  });

  process.on('SIGTERM', () => {
    nextProcess.kill('SIGTERM');
  });

  process.on('SIGINT', () => {
    nextProcess.kill('SIGINT');
  });
})().catch(err => {
  console.error('⚠️ Error starting server:', err.message);
  process.exit(1);
});
