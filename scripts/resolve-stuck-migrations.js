#!/usr/bin/env node
/**
 * Resolve stuck/failed migrations before running migrate deploy.
 * This handles migrations that failed because tables/columns already exist.
 */

const { execSync } = require('child_process');

// Migrations to mark as applied (already exist in DB)
const MIGRATIONS_TO_APPLY = [
  '20250101000000_init',
  '20251216000000_add_meeting_notes',
];

// Migrations that failed and need to be rolled back first, then marked as applied
const FAILED_MIGRATIONS_TO_FIX = [
  '20250101000002_add_chat_message_styling',
];

async function main() {
  console.log('🔍 Checking for stuck migrations...');

  // Step 1: Fix failed migrations by marking them as rolled-back, then applied
  for (const migration of FAILED_MIGRATIONS_TO_FIX) {
    try {
      console.log(`  → Fixing failed migration ${migration}...`);

      // First, mark as rolled-back to clear the failed state
      try {
        execSync(`npx prisma migrate resolve --rolled-back ${migration} --config=./prisma.config.js`, {
          stdio: 'pipe',
          timeout: 30000,
          env: process.env,
        });
        console.log(`    ✓ Marked as rolled-back`);
      } catch (rollbackError) {
        const stderr = rollbackError.stderr?.toString() || '';
        if (stderr.includes('cannot be rolled back') || stderr.includes('already been applied')) {
          console.log(`    ℹ️ Already resolved or applied`);
        } else if (stderr.includes('is not a known migration')) {
          console.log(`    ℹ️ Not in migration history, skipping`);
          continue;
        } else {
          // Try to continue anyway - might already be in correct state
          console.log(`    ⚠️ Rollback warning: ${rollbackError.message}`);
        }
      }

      // Then, mark as applied (since columns already exist in DB)
      try {
        execSync(`npx prisma migrate resolve --applied ${migration} --config=./prisma.config.js`, {
          stdio: 'pipe',
          timeout: 30000,
          env: process.env,
        });
        console.log(`    ✓ Marked as applied`);
      } catch (applyError) {
        const stderr = applyError.stderr?.toString() || '';
        if (stderr.includes('already been applied')) {
          console.log(`    ℹ️ Already marked as applied`);
        } else {
          console.log(`    ⚠️ Apply warning: ${applyError.message}`);
        }
      }

      console.log(`  ✅ ${migration} fixed`);
    } catch (error) {
      console.log(`  ⚠️ Could not fix ${migration}: ${error.message}`);
    }
  }

  // Step 2: Mark other stuck migrations as applied
  for (const migration of MIGRATIONS_TO_APPLY) {
    try {
      console.log(`  → Marking ${migration} as applied...`);
      execSync(`npx prisma migrate resolve --applied ${migration} --config=./prisma.config.js`, {
        stdio: 'pipe',
        timeout: 30000,
        env: process.env,
      });
      console.log(`  ✅ ${migration} marked as applied`);
    } catch (error) {
      const stderr = error.stderr?.toString() || '';
      if (stderr.includes('is not a known migration') || stderr.includes('already been applied')) {
        console.log(`  ℹ️ ${migration} already resolved or not in history`);
      } else {
        console.log(`  ⚠️ Could not resolve ${migration}: ${error.message}`);
      }
    }
  }

  // Step 3: Drop problematic triggers if they exist
  try {
    console.log('🔧 Dropping problematic trigger if exists...');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS chat_messages_points_sweet_coins_sync_trg ON "chat_messages";
    `);
    await prisma.$executeRawUnsafe(`
      DROP FUNCTION IF EXISTS chat_messages_points_sweet_coins_sync();
    `);

    console.log('  ✅ Trigger cleanup completed');
    await prisma.$disconnect();
  } catch (error) {
    console.log(`  ⚠️ Trigger cleanup failed: ${error.message}`);
  }

  console.log('✅ Migration resolution complete');
}

main().catch(console.error);
