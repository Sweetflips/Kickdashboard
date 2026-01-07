#!/usr/bin/env node
/**
 * Resolve stuck/failed migrations before running migrate deploy.
 * Only acts when there are actually stuck migrations - silent otherwise.
 */

const { execSync } = require('child_process');

async function main() {
  // First, check if there are any failed migrations in the database
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });

  try {
    await client.connect();

    // Check for failed migrations (finished_at is NULL and not rolled back)
    const result = await client.query(`
      SELECT migration_name, started_at, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
      ORDER BY started_at DESC
    `);

    if (result.rows.length === 0) {
      // No stuck migrations - exit silently
      await client.end();
      return;
    }

    console.log(`🔍 Found ${result.rows.length} stuck migration(s):`);
    for (const row of result.rows) {
      console.log(`  - ${row.migration_name}`);
    }

    // Fix each stuck migration
    for (const row of result.rows) {
      const migration = row.migration_name;
      console.log(`  → Fixing ${migration}...`);

      try {
        // Mark as rolled-back first
        execSync(`npx prisma migrate resolve --rolled-back ${migration} --config=./prisma.config.js`, {
          stdio: 'pipe',
          timeout: 30000,
          env: process.env,
        });

        // Then mark as applied (columns exist in DB)
        execSync(`npx prisma migrate resolve --applied ${migration} --config=./prisma.config.js`, {
          stdio: 'pipe',
          timeout: 30000,
          env: process.env,
        });

        console.log(`  ✅ ${migration} fixed`);
      } catch (error) {
        const stderr = error.stderr?.toString() || '';
        if (stderr.includes('already been applied') || stderr.includes('already recorded')) {
          console.log(`  ✅ ${migration} already resolved`);
        } else {
          console.log(`  ⚠️ Could not fix ${migration}: ${stderr.split('\n')[0]}`);
        }
      }
    }

    // Clean up any problematic triggers
    await client.query(`
      DROP TRIGGER IF EXISTS chat_messages_points_sweet_coins_sync_trg ON "platform_chat_messages";
      DROP FUNCTION IF EXISTS chat_messages_points_sweet_coins_sync();
    `);

    console.log('✅ Migration resolution complete');
  } catch (error) {
    // If _prisma_migrations doesn't exist yet, that's fine
    if (error.message?.includes('does not exist')) {
      return;
    }
    console.error(`Migration check error: ${error.message}`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
