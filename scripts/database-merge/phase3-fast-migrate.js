/**
 * PHASE 3 FAST: Migrate Data using bulk operations
 * 
 * Run: node scripts/database-merge/phase3-fast-migrate.js
 */

const { Client } = require('pg');

const DB1_URL = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway';
const DB2_URL = 'postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway';

// Columns that are JSON/JSONB and need special handling
const JSON_COLUMNS = new Set([
  'emotes', 'badges', 'sender_badges', 'metadata', 'settings'
]);

async function bulkMigrate(db1, db2, sourceTable, targetTable, columns, idColumn = 'id', uniqueColumns = null) {
  // uniqueColumns: optional array of columns that form unique constraint for ON CONFLICT
  // PostgreSQL limit is ~65535 params, so batch size depends on column count
  const MAX_PARAMS = 60000;
  const BATCH_SIZE = Math.floor(MAX_PARAMS / columns.length);
  
  console.log(`\n📋 Bulk migrating ${sourceTable} → ${targetTable}...`);
  
  const startTime = Date.now();
  
  // Get count from source
  const countResult = await db2.query(`SELECT COUNT(*) as count FROM "${sourceTable}"`);
  const totalRows = parseInt(countResult.rows[0].count);
  console.log(`   Source has ${totalRows.toLocaleString()} rows`);
  
  if (totalRows === 0) {
    console.log('   ⏭️  Skipping (no data)');
    return 0;
  }
  
  // Check existing count in target
  const existingResult = await db1.query(`SELECT COUNT(*) as count FROM "${targetTable}"`);
  const existingRows = parseInt(existingResult.rows[0].count);
  console.log(`   Target has ${existingRows.toLocaleString()} rows`);
  
  if (existingRows >= totalRows) {
    console.log('   ✅ Already fully migrated');
    return 0;
  }
  
  // Get max ID from target to resume
  let lastId = 0;
  if (existingRows > 0) {
    const maxIdResult = await db1.query(`SELECT MAX(${idColumn}) as max_id FROM "${targetTable}"`);
    lastId = maxIdResult.rows[0].max_id ? parseInt(maxIdResult.rows[0].max_id) : 0;
    console.log(`   Resuming from ${idColumn} > ${lastId}`);
  }
  
  let migrated = 0;
  let offset = lastId;
  
  while (true) {
    // Fetch batch from source
    const colList = columns.join(', ');
    const query = `
      SELECT ${colList} 
      FROM "${sourceTable}" 
      WHERE ${idColumn} > $1 
      ORDER BY ${idColumn} 
      LIMIT ${BATCH_SIZE}
    `;
    
    const batchResult = await db2.query(query, [offset]);
    
    if (batchResult.rows.length === 0) break;
    
    // Build bulk insert
    const values = [];
    const placeholders = [];
    let paramIndex = 1;
    
    for (const row of batchResult.rows) {
      const rowPlaceholders = [];
      for (const col of columns) {
        let val = row[col];
        // Handle JSON columns - stringify if it's an object
        if (JSON_COLUMNS.has(col) && val !== null && typeof val === 'object') {
          val = JSON.stringify(val);
        }
        values.push(val);
        rowPlaceholders.push(`$${paramIndex++}`);
      }
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    }
    
    const conflictCols = uniqueColumns ? uniqueColumns.join(', ') : idColumn;
    const insertQuery = `
      INSERT INTO "${targetTable}" (${colList})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (${conflictCols}) DO NOTHING
    `;
    
    await db1.query(insertQuery, values);
    
    migrated += batchResult.rows.length;
    offset = batchResult.rows[batchResult.rows.length - 1][idColumn];
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (migrated / elapsed * 60).toFixed(0);
    process.stdout.write(`   Progress: ${migrated.toLocaleString()}/${totalRows.toLocaleString()} rows (${rate}/min)\r`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   ✅ Migrated ${migrated.toLocaleString()} rows in ${elapsed}s`);
  return migrated;
}

// For tables without id column (like app_settings with 'key' as primary)
async function bulkMigrateByKey(db1, db2, sourceTable, targetTable, columns, keyColumn = 'key') {
  const MAX_PARAMS = 60000;
  const BATCH_SIZE = Math.floor(MAX_PARAMS / columns.length);
  
  console.log(`\n📋 Bulk migrating ${sourceTable} → ${targetTable}...`);
  
  const startTime = Date.now();
  
  // Get all from source
  const colList = columns.join(', ');
  const sourceResult = await db2.query(`SELECT ${colList} FROM "${sourceTable}"`);
  const totalRows = sourceResult.rows.length;
  console.log(`   Source has ${totalRows} rows`);
  
  if (totalRows === 0) {
    console.log('   ⏭️  Skipping (no data)');
    return 0;
  }
  
  let migrated = 0;
  
  for (const row of sourceResult.rows) {
    const values = columns.map(col => row[col]);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    
    const insertQuery = `
      INSERT INTO "${targetTable}" (${colList})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (${keyColumn}) DO NOTHING
    `;
    
    try {
      await db1.query(insertQuery, values);
      migrated++;
    } catch (err) {
      console.log(`   Skipping ${row[keyColumn]}: ${err.message}`);
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   ✅ Migrated ${migrated} rows in ${elapsed}s`);
  return migrated;
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 3 FAST: Bulk Data Migration');
  console.log('='.repeat(60));
  
  const db1 = new Client({ connectionString: DB1_URL });
  const db2 = new Client({ connectionString: DB2_URL });
  
  try {
    await db1.connect();
    await db2.connect();
    console.log('✅ Connected to both databases');
    
    const overallStart = Date.now();
    
    // 1. Migrate platform_users (already mostly done)
    await bulkMigrate(db1, db2, 'users', 'platform_users', [
      'id', 'kick_user_id', 'username', 'email', 'email_verified_at', 'bio',
      'profile_picture_url', 'custom_profile_picture_url',
      'access_token_hash', 'refresh_token_hash', 'access_token_encrypted', 'refresh_token_encrypted',
      'notifications_enabled', 'email_notifications_enabled', 'chat_font_size', 'chat_show_timestamps',
      'last_login_at', 'last_ip_address', 'last_user_agent',
      'signup_ip_address', 'signup_user_agent', 'signup_referrer',
      'instagram_url', 'twitter_url',
      'discord_user_id', 'discord_username', 'discord_access_token_hash', 'discord_connected',
      'telegram_user_id', 'telegram_username', 'telegram_access_token_hash', 'telegram_connected',
      'twitter_user_id', 'twitter_username', 'twitter_access_token_hash', 'twitter_connected',
      'instagram_user_id', 'instagram_username', 'instagram_access_token_hash', 'instagram_connected',
      'razed_user_id', 'razed_username', 'razed_connected',
      'kick_connected', 'is_admin', 'is_excluded', 'moderator_override',
      'created_at', 'updated_at'
    ]);
    
    // 2. Migrate platform_stream_sessions
    await bulkMigrate(db1, db2, 'stream_sessions', 'platform_stream_sessions', [
      'id', 'broadcaster_user_id', 'channel_slug', 'kick_stream_id', 'session_title',
      'thumbnail_url', 'thumbnail_captured_at', 'thumbnail_last_refreshed_at', 'thumbnail_source',
      'started_at', 'ended_at', 'last_live_check_at', 'peak_viewer_count', 'total_messages',
      'duration_seconds', 'created_at', 'updated_at'
    ]);
    
    // 3. Migrate platform_user_sweet_coins (unique on user_id)
    await bulkMigrate(db1, db2, 'user_sweet_coins', 'platform_user_sweet_coins', [
      'id', 'user_id', 'total_sweet_coins', 'total_emotes', 'last_sweet_coin_earned_at',
      'is_subscriber', 'created_at', 'updated_at'
    ], 'id', ['user_id']);
    
    // 4. Migrate platform_sweet_coin_history (320K rows, unique on message_id)
    await bulkMigrate(db1, db2, 'sweet_coin_history', 'platform_sweet_coin_history', [
      'id', 'user_id', 'stream_session_id', 'sweet_coins_earned', 'message_id',
      'earned_at', 'created_at'
    ], 'id', ['id']);
    
    // 5. Migrate platform_chat_messages (1.9M rows - largest table)
    await bulkMigrate(db1, db2, 'chat_messages', 'platform_chat_messages', [
      'id', 'message_id', 'stream_session_id', 'sender_user_id', 'sender_username',
      'broadcaster_user_id', 'content', 'emotes', 'has_emotes', 'engagement_type',
      'message_length', 'exclamation_count', 'sentence_count', 'timestamp',
      'sender_username_color', 'sender_badges', 'sender_is_verified', 'sender_is_anonymous',
      'sweet_coins_earned', 'sweet_coins_reason', 'sent_when_offline', 'created_at'
    ]);
    
    // 6. Migrate platform_offline_chat_messages (39K rows)
    await bulkMigrate(db1, db2, 'offline_chat_messages', 'platform_offline_chat_messages', [
      'id', 'message_id', 'sender_user_id', 'sender_username', 'broadcaster_user_id',
      'content', 'emotes', 'has_emotes', 'engagement_type', 'message_length',
      'exclamation_count', 'sentence_count', 'timestamp', 'sender_username_color',
      'sender_badges', 'sender_is_verified', 'sender_is_anonymous', 'created_at'
    ]);
    
    // 7. Migrate platform_user_sessions
    await bulkMigrate(db1, db2, 'user_sessions', 'platform_user_sessions', [
      'id', 'user_id', 'session_id', 'region', 'country', 'client_type',
      'user_agent', 'ip_hash', 'created_at', 'last_seen_at', 'updated_at'
    ]);
    
    // 8. Migrate platform_raffles
    await bulkMigrate(db1, db2, 'raffles', 'platform_raffles', [
      'id', 'title', 'description', 'type', 'prize_description', 'ticket_cost',
      'max_tickets_per_user', 'total_tickets_cap', 'start_at', 'end_at', 'status',
      'sub_only', 'hidden_until_start', 'hidden', 'draw_seed', 'number_of_winners',
      'drawn_at', 'claim_message', 'created_by', 'created_at', 'updated_at'
    ]);
    
    // 9. Migrate platform_raffle_entries
    await bulkMigrate(db1, db2, 'raffle_entries', 'platform_raffle_entries', [
      'id', 'raffle_id', 'user_id', 'tickets', 'source', 'created_at'
    ]);
    
    // 10. Migrate platform_promo_codes
    await bulkMigrate(db1, db2, 'promo_codes', 'platform_promo_codes', [
      'id', 'code', 'sweet_coins_value', 'max_uses', 'current_uses',
      'expires_at', 'is_active', 'created_by', 'created_at', 'updated_at'
    ]);
    
    // 11. Migrate platform_promo_code_redemptions
    await bulkMigrate(db1, db2, 'promo_code_redemptions', 'platform_promo_code_redemptions', [
      'id', 'promo_code_id', 'user_id', 'sweet_coins_awarded', 'redeemed_at'
    ]);
    
    // 12. Migrate platform_purchase_transactions
    await bulkMigrate(db1, db2, 'purchase_transactions', 'platform_purchase_transactions', [
      'id', 'user_id', 'type', 'quantity', 'sweet_coins_spent', 'item_name',
      'advent_item_id', 'raffle_id', 'metadata', 'created_at'
    ]);
    
    // 13. Migrate platform_advent_purchases
    await bulkMigrate(db1, db2, 'advent_purchases', 'platform_advent_purchases', [
      'id', 'user_id', 'item_id', 'tickets', 'created_at'
    ]);
    
    // 14. Migrate platform_referrals
    await bulkMigrate(db1, db2, 'referrals', 'platform_referrals', [
      'id', 'referrer_user_id', 'referee_user_id', 'referral_code', 'created_at', 'updated_at'
    ]);
    
    // 15. Migrate platform_razed_verifications
    await bulkMigrate(db1, db2, 'razed_verifications', 'platform_razed_verifications', [
      'id', 'kick_user_id', 'razed_username', 'verification_code', 'status',
      'verified_at', 'expires_at', 'created_at'
    ]);
    
    // 16. Migrate platform_app_settings (uses 'key' as primary)
    await bulkMigrateByKey(db1, db2, 'app_settings', 'platform_app_settings', [
      'key', 'value', 'updated_at', 'created_at'
    ], 'key');
    
    const totalElapsed = ((Date.now() - overallStart) / 1000 / 60).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log(`✅ PHASE 3 COMPLETE in ${totalElapsed} minutes`);
    console.log('='.repeat(60));
    
  } catch (err) {
    console.error('\n❌ Migration error:', err);
    throw err;
  } finally {
    await db1.end();
    await db2.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
