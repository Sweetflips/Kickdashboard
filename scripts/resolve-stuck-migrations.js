#!/usr/bin/env node
/**
 * Resolve stuck/failed migrations before running migrate deploy.
 * This handles migrations that failed because tables/columns already exist.
 */

const { execSync } = require('child_process');

const MIGRATIONS_TO_RESOLVE = [
  '20251216000000_add_meeting_notes',
];

async function main() {
  console.log('🔍 Checking for stuck migrations...');
  
  for (const migration of MIGRATIONS_TO_RESOLVE) {
    try {
      console.log(`  → Marking ${migration} as applied...`);
      execSync(`npx prisma migrate resolve --applied ${migration}`, {
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log(`  ✅ ${migration} marked as applied`);
    } catch (error) {
      // Might fail if already resolved or doesn't exist in history - that's fine
      const stderr = error.stderr?.toString() || '';
      if (stderr.includes('is not a known migration') || stderr.includes('already been applied')) {
        console.log(`  ℹ️ ${migration} already resolved or not in history`);
      } else {
        console.log(`  ⚠️ Could not resolve ${migration}: ${error.message}`);
      }
    }
  }
  
  // Also drop the problematic trigger if it exists
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
