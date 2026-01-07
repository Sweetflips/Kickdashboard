#!/usr/bin/env node
/**
 * Resolve stuck/failed migrations before running migrate deploy.
 * This handles migrations that failed because tables/columns already exist.
 */

const { execSync } = require('child_process');

// Migrations to mark as applied (platform_* tables already have all columns)
const MIGRATIONS_TO_APPLY = [
  '20250101000000_init',
  '20250101000001_add_user_preferences',
  '20250101000002_add_chat_message_styling',
  '20250101000003_add_points_earned',
  '20250101000004_add_total_emotes',
  '20250101000005_add_giveaway_system',
  '20250101000006_add_thumbnail_url_to_stream_session',
  '20250101000007_add_stream_session_to_giveaway',
  '20250101000008_simplify_giveaway',
  '20250101000012_add_unique_message_id_to_point_history',
  '20251209215000_create_raffle_tables',
  '20251209215830_add_referral_system',
  '20251209220000_raffle_wheel_rigging',
  '20251209230000_raffle_appearance',
  '20251211100604_add_kick_stream_id',
  '20251211180921_add_kick_video_id',
  '20251211184641_add_advent_purchase_user_relation',
  '20251211200000_add_unique_active_session_constraint',
  '20251211210000_wheel_overlay',
  '20251212000100_add_chat_analytics_fields',
  '20251212120000_purchase_transactions',
  '20251212130000_point_award_jobs_compat_view',
  '20251212134000_chat_messages_points_columns_compat',
  '20251214134340_add_moderator_override',
  '20251215000000_add_app_settings',
  '20251216000000_add_meeting_notes',
  '20251219000000_rename_points_to_sweet_coins',
  '20251219000100_add_moderation_logs',
  'add_connected_accounts',
];

// Migrations that failed and need to be rolled back first, then marked as applied
const FAILED_MIGRATIONS_TO_FIX = [
  '20250101000002_add_chat_message_styling',
  '20250101000003_add_points_earned',
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
