/**
 * PHASE 3: Migrate Data from Mainline (DB2) to Shuttle (DB1)
 * 
 * This script migrates all data from DB2 into the new platform_* tables in DB1.
 * Data is migrated in dependency order to maintain referential integrity.
 * 
 * Run: node scripts/database-merge/phase3-migrate-data.js
 */

const { Client } = require('pg');

const DB1_URL = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway';
const DB2_URL = 'postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway';

const BATCH_SIZE = 1000;

async function migrateTable(db1, db2, sourceTable, targetTable, columns, idMapping = null, transformFn = null) {
  console.log(`\n📋 Migrating ${sourceTable} → ${targetTable}...`);
  
  // Get count from source
  const countResult = await db2.query(`SELECT COUNT(*) as count FROM "${sourceTable}"`);
  const totalRows = parseInt(countResult.rows[0].count);
  console.log(`   Source has ${totalRows} rows`);
  
  if (totalRows === 0) {
    console.log('   ⏭️  Skipping (no data)');
    return { migrated: 0, skipped: 0, mapping: {} };
  }
  
  // Check existing count in target
  const existingResult = await db1.query(`SELECT COUNT(*) as count FROM "${targetTable}"`);
  const existingRows = parseInt(existingResult.rows[0].count);
  
  if (existingRows > 0) {
    console.log(`   ⚠️  Target already has ${existingRows} rows`);
  }
  
  // Get data in batches
  let migrated = 0;
  let skipped = 0;
  let offset = 0;
  const newIdMapping = {};
  
  while (offset < totalRows) {
    const batchResult = await db2.query(`
      SELECT * FROM "${sourceTable}" 
      ORDER BY id 
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `);
    
    for (const row of batchResult.rows) {
      try {
        // Apply transformation if provided
        let transformedRow = row;
        if (transformFn) {
          transformedRow = await transformFn(row, idMapping);
          if (!transformedRow) {
            skipped++;
            continue;
          }
        }
        
        // Build insert query
        const cols = columns.filter(c => transformedRow[c] !== undefined);
        const values = cols.map(c => transformedRow[c]);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        
        const insertQuery = `
          INSERT INTO "${targetTable}" (${cols.join(', ')})
          VALUES (${placeholders.join(', ')})
          ON CONFLICT DO NOTHING
          RETURNING id
        `;
        
        const insertResult = await db1.query(insertQuery, values);
        
        if (insertResult.rows.length > 0) {
          migrated++;
          if (row.id) {
            newIdMapping[row.id] = insertResult.rows[0].id;
          }
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`   Error migrating row ${row.id}:`, err.message);
        skipped++;
      }
    }
    
    offset += BATCH_SIZE;
    process.stdout.write(`   Progress: ${Math.min(offset, totalRows)}/${totalRows} rows processed\r`);
  }
  
  console.log(`   ✅ Migrated: ${migrated}, Skipped: ${skipped}`);
  return { migrated, skipped, mapping: newIdMapping };
}

async function migrateLargeTable(db1, db2, sourceTable, targetTable, columns, batchSize = 5000) {
  console.log(`\n📋 Migrating ${sourceTable} → ${targetTable} (large table mode)...`);
  
  const countResult = await db2.query(`SELECT COUNT(*) as count FROM "${sourceTable}"`);
  const totalRows = parseInt(countResult.rows[0].count);
  console.log(`   Source has ${totalRows.toLocaleString()} rows`);
  
  if (totalRows === 0) {
    console.log('   ⏭️  Skipping (no data)');
    return { migrated: 0, skipped: 0 };
  }
  
  let migrated = 0;
  let skipped = 0;
  let offset = 0;
  
  while (offset < totalRows) {
    const batchResult = await db2.query(`
      SELECT * FROM "${sourceTable}" 
      ORDER BY id 
      LIMIT ${batchSize} OFFSET ${offset}
    `);
    
    if (batchResult.rows.length === 0) break;
    
    // Build batch insert
    const firstRow = batchResult.rows[0];
    const cols = columns.filter(c => firstRow[c] !== undefined);
    
    const valueStrings = [];
    const allValues = [];
    let paramCounter = 1;
    
    for (const row of batchResult.rows) {
      const rowPlaceholders = [];
      for (const col of cols) {
        rowPlaceholders.push(`$${paramCounter}`);
        allValues.push(row[col]);
        paramCounter++;
      }
      valueStrings.push(`(${rowPlaceholders.join(', ')})`);
    }
    
    try {
      const insertQuery = `
        INSERT INTO "${targetTable}" (${cols.join(', ')})
        VALUES ${valueStrings.join(', ')}
        ON CONFLICT DO NOTHING
      `;
      
      const result = await db1.query(insertQuery, allValues);
      migrated += batchResult.rows.length;
    } catch (err) {
      console.error(`   Error in batch at offset ${offset}:`, err.message);
      skipped += batchResult.rows.length;
    }
    
    offset += batchSize;
    const percent = Math.round((offset / totalRows) * 100);
    process.stdout.write(`   Progress: ${Math.min(offset, totalRows).toLocaleString()}/${totalRows.toLocaleString()} (${percent}%)\r`);
  }
  
  console.log(`   ✅ Migrated: ${migrated.toLocaleString()}, Skipped: ${skipped.toLocaleString()}`);
  return { migrated, skipped };
}

async function phase3() {
  const db1 = new Client({ connectionString: DB1_URL });
  const db2 = new Client({ connectionString: DB2_URL });
  
  try {
    await db1.connect();
    await db2.connect();
    console.log('✅ Connected to both databases\n');
    
    const migrationStats = {};
    
    // ================================================================
    // STEP 1: Migrate platform_users (from DB2 users)
    // ================================================================
    console.log('='.repeat(60));
    console.log('STEP 1: Migrating users → platform_users');
    console.log('='.repeat(60));
    
    const usersResult = await migrateTable(
      db1, db2,
      'users', 'platform_users',
      [
        'id', 'kick_user_id', 'username', 'email', 'email_verified_at', 'bio',
        'profile_picture_url', 'custom_profile_picture_url',
        'access_token_hash', 'refresh_token_hash',
        'access_token_encrypted', 'refresh_token_encrypted',
        'notifications_enabled', 'email_notifications_enabled',
        'chat_font_size', 'chat_show_timestamps',
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
      ]
    );
    migrationStats.users = usersResult;
    
    // Build user ID mapping (old_id -> new_id)
    console.log('\n   Building user ID mapping...');
    const userIdMap = {};
    const userMapResult = await db2.query('SELECT id, kick_user_id FROM users');
    const db1UserResult = await db1.query('SELECT id, kick_user_id FROM platform_users');
    
    const kickToNewId = {};
    for (const row of db1UserResult.rows) {
      kickToNewId[row.kick_user_id.toString()] = row.id;
    }
    
    for (const row of userMapResult.rows) {
      const newId = kickToNewId[row.kick_user_id.toString()];
      if (newId) {
        userIdMap[row.id.toString()] = newId;
      }
    }
    console.log(`   ✅ Mapped ${Object.keys(userIdMap).length} user IDs`);
    
    // ================================================================
    // STEP 2: Migrate user_sweet_coins → platform_user_sweet_coins
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Migrating user_sweet_coins → platform_user_sweet_coins');
    console.log('='.repeat(60));
    
    const sweetCoinsResult = await migrateTable(
      db1, db2,
      'user_sweet_coins', 'platform_user_sweet_coins',
      ['user_id', 'total_sweet_coins', 'total_emotes', 'last_sweet_coin_earned_at', 
       'is_subscriber', 'created_at', 'updated_at'],
      null,
      async (row) => {
        const newUserId = userIdMap[row.user_id.toString()];
        if (!newUserId) return null;
        return { ...row, user_id: newUserId };
      }
    );
    migrationStats.sweetCoins = sweetCoinsResult;
    
    // ================================================================
    // STEP 3: Migrate stream_sessions → platform_stream_sessions
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Migrating stream_sessions → platform_stream_sessions');
    console.log('='.repeat(60));
    
    const sessionsResult = await migrateTable(
      db1, db2,
      'stream_sessions', 'platform_stream_sessions',
      ['id', 'broadcaster_user_id', 'channel_slug', 'kick_stream_id', 'session_title',
       'thumbnail_url', 'thumbnail_captured_at', 'thumbnail_last_refreshed_at', 'thumbnail_source',
       'started_at', 'ended_at', 'last_live_check_at', 'peak_viewer_count', 'total_messages',
       'duration_seconds', 'created_at', 'updated_at']
    );
    migrationStats.streamSessions = sessionsResult;
    
    // Build session ID mapping
    const sessionIdMap = {};
    const sessionMapResult = await db2.query('SELECT id FROM stream_sessions');
    const db1SessionResult = await db1.query('SELECT id FROM platform_stream_sessions');
    
    const db2SessionIds = sessionMapResult.rows.map(r => r.id.toString());
    const db1SessionIds = db1SessionResult.rows.map(r => r.id.toString());
    
    // Assuming IDs are preserved
    for (let i = 0; i < db2SessionIds.length; i++) {
      if (db1SessionIds[i]) {
        sessionIdMap[db2SessionIds[i]] = db1SessionIds[i];
      }
    }
    console.log(`   ✅ Mapped ${Object.keys(sessionIdMap).length} session IDs`);
    
    // ================================================================
    // STEP 4: Migrate sweet_coin_history → platform_sweet_coin_history
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 4: Migrating sweet_coin_history → platform_sweet_coin_history');
    console.log('='.repeat(60));
    
    // Use large table mode for this one (320K+ rows)
    const historyCountResult = await db2.query('SELECT COUNT(*) as count FROM sweet_coin_history');
    const historyCount = parseInt(historyCountResult.rows[0].count);
    console.log(`   Found ${historyCount.toLocaleString()} rows in sweet_coin_history`);
    
    let historyMigrated = 0;
    let historySkipped = 0;
    let historyOffset = 0;
    
    while (historyOffset < historyCount) {
      const batchResult = await db2.query(`
        SELECT id, user_id, stream_session_id, sweet_coins_earned, message_id, earned_at, created_at
        FROM sweet_coin_history
        ORDER BY id
        LIMIT 5000 OFFSET ${historyOffset}
      `);
      
      if (batchResult.rows.length === 0) break;
      
      for (const row of batchResult.rows) {
        const newUserId = userIdMap[row.user_id.toString()];
        if (!newUserId) {
          historySkipped++;
          continue;
        }
        
        try {
          await db1.query(`
            INSERT INTO platform_sweet_coin_history 
            (user_id, stream_session_id, sweet_coins_earned, message_id, earned_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (message_id) DO NOTHING
          `, [newUserId, row.stream_session_id, row.sweet_coins_earned, row.message_id, row.earned_at, row.created_at]);
          historyMigrated++;
        } catch (err) {
          historySkipped++;
        }
      }
      
      historyOffset += 5000;
      const percent = Math.round((historyOffset / historyCount) * 100);
      process.stdout.write(`   Progress: ${Math.min(historyOffset, historyCount).toLocaleString()}/${historyCount.toLocaleString()} (${percent}%)\r`);
    }
    
    console.log(`   ✅ Migrated: ${historyMigrated.toLocaleString()}, Skipped: ${historySkipped.toLocaleString()}`);
    migrationStats.sweetCoinHistory = { migrated: historyMigrated, skipped: historySkipped };
    
    // ================================================================
    // STEP 5: Migrate chat_messages → platform_chat_messages
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 5: Migrating chat_messages → platform_chat_messages');
    console.log('='.repeat(60));
    
    const chatCountResult = await db2.query('SELECT COUNT(*) as count FROM chat_messages');
    const chatCount = parseInt(chatCountResult.rows[0].count);
    console.log(`   Found ${chatCount.toLocaleString()} rows in chat_messages`);
    
    let chatMigrated = 0;
    let chatSkipped = 0;
    let chatOffset = 0;
    
    while (chatOffset < chatCount) {
      const batchResult = await db2.query(`
        SELECT * FROM chat_messages
        ORDER BY id
        LIMIT 10000 OFFSET ${chatOffset}
      `);
      
      if (batchResult.rows.length === 0) break;
      
      // Build batch insert
      const valueStrings = [];
      const allValues = [];
      let paramCounter = 1;
      
      for (const row of batchResult.rows) {
        const vals = [
          row.message_id, row.stream_session_id, row.sender_user_id, row.sender_username,
          row.broadcaster_user_id, row.content, JSON.stringify(row.emotes), row.has_emotes,
          row.engagement_type, row.message_length, row.exclamation_count, row.sentence_count,
          row.timestamp, row.sender_username_color, JSON.stringify(row.sender_badges),
          row.sender_is_verified, row.sender_is_anonymous, row.sweet_coins_earned,
          row.sweet_coins_reason, row.sent_when_offline, row.created_at
        ];
        
        const placeholders = vals.map(() => `$${paramCounter++}`);
        valueStrings.push(`(${placeholders.join(', ')})`);
        allValues.push(...vals);
      }
      
      try {
        await db1.query(`
          INSERT INTO platform_chat_messages 
          (message_id, stream_session_id, sender_user_id, sender_username, broadcaster_user_id,
           content, emotes, has_emotes, engagement_type, message_length, exclamation_count,
           sentence_count, timestamp, sender_username_color, sender_badges, sender_is_verified,
           sender_is_anonymous, sweet_coins_earned, sweet_coins_reason, sent_when_offline, created_at)
          VALUES ${valueStrings.join(', ')}
          ON CONFLICT (message_id) DO NOTHING
        `, allValues);
        chatMigrated += batchResult.rows.length;
      } catch (err) {
        console.error(`   Error at offset ${chatOffset}:`, err.message);
        chatSkipped += batchResult.rows.length;
      }
      
      chatOffset += 10000;
      const percent = Math.round((chatOffset / chatCount) * 100);
      process.stdout.write(`   Progress: ${Math.min(chatOffset, chatCount).toLocaleString()}/${chatCount.toLocaleString()} (${percent}%)\r`);
    }
    
    console.log(`   ✅ Migrated: ${chatMigrated.toLocaleString()}, Skipped: ${chatSkipped.toLocaleString()}`);
    migrationStats.chatMessages = { migrated: chatMigrated, skipped: chatSkipped };
    
    // ================================================================
    // STEP 6: Migrate offline_chat_messages → platform_offline_chat_messages
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 6: Migrating offline_chat_messages → platform_offline_chat_messages');
    console.log('='.repeat(60));
    
    await migrateLargeTable(db1, db2, 'offline_chat_messages', 'platform_offline_chat_messages', [
      'message_id', 'sender_user_id', 'sender_username', 'broadcaster_user_id', 'content',
      'emotes', 'has_emotes', 'engagement_type', 'message_length', 'exclamation_count',
      'sentence_count', 'timestamp', 'sender_username_color', 'sender_badges',
      'sender_is_verified', 'sender_is_anonymous', 'created_at'
    ], 5000);
    
    // ================================================================
    // STEP 7: Migrate user_sessions → platform_user_sessions
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 7: Migrating user_sessions → platform_user_sessions');
    console.log('='.repeat(60));
    
    const sessionsUserResult = await migrateTable(
      db1, db2,
      'user_sessions', 'platform_user_sessions',
      ['user_id', 'session_id', 'region', 'country', 'client_type', 'user_agent',
       'ip_hash', 'created_at', 'last_seen_at', 'updated_at'],
      null,
      async (row) => {
        const newUserId = userIdMap[row.user_id.toString()];
        if (!newUserId) return null;
        return { ...row, user_id: newUserId };
      }
    );
    migrationStats.userSessions = sessionsUserResult;
    
    // ================================================================
    // STEP 8: Migrate raffles → platform_raffles
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 8: Migrating raffles → platform_raffles');
    console.log('='.repeat(60));
    
    const rafflesResult = await migrateTable(
      db1, db2,
      'raffles', 'platform_raffles',
      ['id', 'title', 'description', 'type', 'prize_description', 'ticket_cost',
       'max_tickets_per_user', 'total_tickets_cap', 'start_at', 'end_at', 'status',
       'sub_only', 'hidden_until_start', 'hidden', 'draw_seed', 'number_of_winners',
       'drawn_at', 'claim_message', 'created_by', 'created_at', 'updated_at'],
      null,
      async (row) => {
        const newCreatedBy = userIdMap[row.created_by.toString()];
        if (!newCreatedBy) return null;
        return { ...row, created_by: newCreatedBy };
      }
    );
    migrationStats.raffles = rafflesResult;
    
    // Build raffle ID mapping
    const raffleIdMap = {};
    const raffleMapResult = await db2.query('SELECT id, title FROM raffles');
    const db1RaffleResult = await db1.query('SELECT id, title FROM platform_raffles');
    
    for (const db2Raffle of raffleMapResult.rows) {
      const match = db1RaffleResult.rows.find(r => r.title === db2Raffle.title);
      if (match) {
        raffleIdMap[db2Raffle.id.toString()] = match.id;
      }
    }
    console.log(`   ✅ Mapped ${Object.keys(raffleIdMap).length} raffle IDs`);
    
    // ================================================================
    // STEP 9: Migrate raffle_entries → platform_raffle_entries
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 9: Migrating raffle_entries → platform_raffle_entries');
    console.log('='.repeat(60));
    
    const entriesResult = await migrateTable(
      db1, db2,
      'raffle_entries', 'platform_raffle_entries',
      ['raffle_id', 'user_id', 'tickets', 'source', 'created_at'],
      null,
      async (row) => {
        const newUserId = userIdMap[row.user_id.toString()];
        const newRaffleId = raffleIdMap[row.raffle_id.toString()];
        if (!newUserId || !newRaffleId) return null;
        return { ...row, user_id: newUserId, raffle_id: newRaffleId };
      }
    );
    migrationStats.raffleEntries = entriesResult;
    
    // ================================================================
    // STEP 10: Migrate promo_codes → platform_promo_codes
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 10: Migrating promo_codes → platform_promo_codes');
    console.log('='.repeat(60));
    
    const promoCodesResult = await migrateTable(
      db1, db2,
      'promo_codes', 'platform_promo_codes',
      ['code', 'sweet_coins_value', 'max_uses', 'current_uses', 'expires_at',
       'is_active', 'created_by', 'created_at', 'updated_at'],
      null,
      async (row) => {
        const newCreatedBy = userIdMap[row.created_by.toString()];
        if (!newCreatedBy) return null;
        return { ...row, created_by: newCreatedBy };
      }
    );
    migrationStats.promoCodes = promoCodesResult;
    
    // Build promo code ID mapping
    const promoCodeIdMap = {};
    const promoMapResult = await db2.query('SELECT id, code FROM promo_codes');
    const db1PromoResult = await db1.query('SELECT id, code FROM platform_promo_codes');
    
    for (const db2Promo of promoMapResult.rows) {
      const match = db1PromoResult.rows.find(r => r.code === db2Promo.code);
      if (match) {
        promoCodeIdMap[db2Promo.id.toString()] = match.id;
      }
    }
    
    // ================================================================
    // STEP 11: Migrate promo_code_redemptions → platform_promo_code_redemptions
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 11: Migrating promo_code_redemptions → platform_promo_code_redemptions');
    console.log('='.repeat(60));
    
    const redemptionsResult = await migrateTable(
      db1, db2,
      'promo_code_redemptions', 'platform_promo_code_redemptions',
      ['promo_code_id', 'user_id', 'sweet_coins_awarded', 'redeemed_at'],
      null,
      async (row) => {
        const newUserId = userIdMap[row.user_id.toString()];
        const newPromoCodeId = promoCodeIdMap[row.promo_code_id.toString()];
        if (!newUserId || !newPromoCodeId) return null;
        return { ...row, user_id: newUserId, promo_code_id: newPromoCodeId };
      }
    );
    migrationStats.promoRedemptions = redemptionsResult;
    
    // ================================================================
    // STEP 12: Migrate purchase_transactions → platform_purchase_transactions
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 12: Migrating purchase_transactions → platform_purchase_transactions');
    console.log('='.repeat(60));
    
    const purchasesResult = await migrateTable(
      db1, db2,
      'purchase_transactions', 'platform_purchase_transactions',
      ['user_id', 'type', 'quantity', 'sweet_coins_spent', 'item_name',
       'advent_item_id', 'raffle_id', 'metadata', 'created_at'],
      null,
      async (row) => {
        const newUserId = userIdMap[row.user_id.toString()];
        if (!newUserId) return null;
        const newRaffleId = row.raffle_id ? raffleIdMap[row.raffle_id.toString()] : null;
        return { 
          ...row, 
          user_id: newUserId, 
          raffle_id: newRaffleId,
          metadata: JSON.stringify(row.metadata || {})
        };
      }
    );
    migrationStats.purchases = purchasesResult;
    
    // ================================================================
    // STEP 13: Migrate advent_purchases → platform_advent_purchases
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 13: Migrating advent_purchases → platform_advent_purchases');
    console.log('='.repeat(60));
    
    const adventResult = await migrateTable(
      db1, db2,
      'advent_purchases', 'platform_advent_purchases',
      ['user_id', 'item_id', 'tickets', 'created_at'],
      null,
      async (row) => {
        const newUserId = userIdMap[row.user_id.toString()];
        if (!newUserId) return null;
        return { ...row, user_id: newUserId };
      }
    );
    migrationStats.adventPurchases = adventResult;
    
    // ================================================================
    // STEP 14: Migrate referrals → platform_referrals
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 14: Migrating referrals → platform_referrals');
    console.log('='.repeat(60));
    
    const referralsResult = await migrateTable(
      db1, db2,
      'referrals', 'platform_referrals',
      ['referrer_user_id', 'referee_user_id', 'referral_code', 'created_at', 'updated_at'],
      null,
      async (row) => {
        const newReferrerId = userIdMap[row.referrer_user_id.toString()];
        const newRefereeId = userIdMap[row.referee_user_id.toString()];
        if (!newReferrerId || !newRefereeId) return null;
        return { ...row, referrer_user_id: newReferrerId, referee_user_id: newRefereeId };
      }
    );
    migrationStats.referrals = referralsResult;
    
    // ================================================================
    // STEP 15: Migrate razed_verifications → platform_razed_verifications
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 15: Migrating razed_verifications → platform_razed_verifications');
    console.log('='.repeat(60));
    
    await migrateTable(
      db1, db2,
      'razed_verifications', 'platform_razed_verifications',
      ['kick_user_id', 'razed_username', 'verification_code', 'status', 
       'verified_at', 'expires_at', 'created_at']
    );
    
    // ================================================================
    // STEP 16: Migrate app_settings → platform_app_settings
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 16: Migrating app_settings → platform_app_settings');
    console.log('='.repeat(60));
    
    await migrateTable(
      db1, db2,
      'app_settings', 'platform_app_settings',
      ['key', 'value', 'updated_at', 'created_at']
    );
    
    // ================================================================
    // SUMMARY
    // ================================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('✅ PHASE 3 COMPLETE: Data Migration Summary');
    console.log('='.repeat(60));
    
    console.log('\nMigration Statistics:');
    for (const [table, stats] of Object.entries(migrationStats)) {
      console.log(`  ${table}: ${stats.migrated?.toLocaleString() || 0} migrated, ${stats.skipped?.toLocaleString() || 0} skipped`);
    }
    
    // Verify final counts
    console.log('\nFinal table counts in DB1:');
    const tables = [
      'platform_users', 'platform_user_sweet_coins', 'platform_sweet_coin_history',
      'platform_stream_sessions', 'platform_chat_messages', 'platform_offline_chat_messages',
      'platform_user_sessions', 'platform_raffles', 'platform_raffle_entries',
      'platform_promo_codes', 'platform_promo_code_redemptions', 'platform_purchase_transactions',
      'platform_advent_purchases', 'platform_referrals', 'platform_razed_verifications',
      'platform_app_settings'
    ];
    
    for (const table of tables) {
      const countResult = await db1.query(`SELECT COUNT(*) as count FROM "${table}"`);
      console.log(`  ${table}: ${parseInt(countResult.rows[0].count).toLocaleString()} rows`);
    }
    
    console.log('\nNext step: Run phase4-create-links.js');
    
  } catch (error) {
    console.error('\n❌ Error during Phase 3:', error.message);
    throw error;
  } finally {
    await db1.end();
    await db2.end();
  }
}

// Run the phase
phase3().catch(err => {
  console.error(err);
  process.exit(1);
});



