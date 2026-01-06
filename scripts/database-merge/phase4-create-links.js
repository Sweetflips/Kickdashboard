/**
 * PHASE 4: Create Links Between Platform Users and Casino Players
 * 
 * This script:
 * 1. Links platform_users to razed_players via razed_username
 * 2. Links platform_users to luxdrop_players via casino links
 * 3. Creates player_casino_links entries
 * 4. Syncs wager totals to platform users
 * 
 * Run: node scripts/database-merge/phase4-create-links.js
 */

const { Client } = require('pg');

const DB1_URL = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway';

async function phase4() {
  const client = new Client({ connectionString: DB1_URL });
  
  try {
    await client.connect();
    console.log('✅ Connected to Shuttle (DB1) database\n');
    
    // ================================================================
    // STEP 1: Link platform_users to razed_players
    // ================================================================
    console.log('='.repeat(60));
    console.log('STEP 1: Linking platform_users to razed_players');
    console.log('='.repeat(60));
    
    // Find platform users with razed_username set
    const razedUsersResult = await client.query(`
      SELECT id, kick_user_id, username, razed_username, razed_connected
      FROM platform_users
      WHERE razed_username IS NOT NULL AND razed_username != ''
    `);
    
    console.log(`   Found ${razedUsersResult.rows.length} platform users with razed_username`);
    
    let razedLinked = 0;
    let razedNotFound = 0;
    
    for (const user of razedUsersResult.rows) {
      // Check if razed_player exists
      const razedPlayerResult = await client.query(`
        SELECT username FROM razed_players 
        WHERE LOWER(username) = LOWER($1)
      `, [user.razed_username]);
      
      if (razedPlayerResult.rows.length > 0) {
        // Create link
        try {
          await client.query(`
            INSERT INTO player_casino_links 
            (platform_user_id, casino, casino_user_id, casino_username, verified, verified_at, created_at)
            VALUES ($1, 'razed', $2, $2, true, NOW(), NOW())
            ON CONFLICT (platform_user_id, casino) DO UPDATE SET
              casino_username = EXCLUDED.casino_username,
              verified = true,
              verified_at = NOW()
          `, [user.id, user.razed_username]);
          razedLinked++;
        } catch (err) {
          console.error(`   Error linking user ${user.username}:`, err.message);
        }
      } else {
        razedNotFound++;
      }
    }
    
    console.log(`   ✅ Linked: ${razedLinked}, Not found in razed_players: ${razedNotFound}`);
    
    // ================================================================
    // STEP 2: Calculate and sync Razed wager totals
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Calculating Razed wager totals');
    console.log('='.repeat(60));
    
    // Get all razed links
    const razedLinksResult = await client.query(`
      SELECT pcl.id, pcl.platform_user_id, pcl.casino_username
      FROM player_casino_links pcl
      WHERE pcl.casino = 'razed'
    `);
    
    console.log(`   Processing ${razedLinksResult.rows.length} Razed links...`);
    
    let wagersSynced = 0;
    
    for (const link of razedLinksResult.rows) {
      // Get total wagered from razed_player_daily_stats
      const wagerResult = await client.query(`
        SELECT COALESCE(SUM(wagered), 0) as total_wagered
        FROM razed_player_daily_stats
        WHERE LOWER(username) = LOWER($1)
      `, [link.casino_username]);
      
      const totalWagered = parseFloat(wagerResult.rows[0].total_wagered) || 0;
      
      if (totalWagered > 0) {
        await client.query(`
          UPDATE player_casino_links
          SET total_wagered = $1, last_wager_sync_at = NOW(), updated_at = NOW()
          WHERE id = $2
        `, [totalWagered, link.id]);
        wagersSynced++;
      }
    }
    
    console.log(`   ✅ Updated wager totals for ${wagersSynced} users`);
    
    // ================================================================
    // STEP 3: Link platform_users to luxdrop_players (via username matching)
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Linking platform_users to luxdrop_players');
    console.log('='.repeat(60));
    
    // For Luxdrop, we need to match by username since there's no direct link in the user table
    // We'll look for exact username matches
    const platformUsersResult = await client.query(`
      SELECT id, kick_user_id, username
      FROM platform_users
    `);
    
    console.log(`   Checking ${platformUsersResult.rows.length} platform users against luxdrop_players...`);
    
    let luxdropLinked = 0;
    
    for (const user of platformUsersResult.rows) {
      // Check if there's a luxdrop player with matching username
      const luxdropResult = await client.query(`
        SELECT player_id, username
        FROM luxdrop_players
        WHERE LOWER(username) = LOWER($1)
      `, [user.username]);
      
      if (luxdropResult.rows.length > 0) {
        const luxPlayer = luxdropResult.rows[0];
        
        try {
          await client.query(`
            INSERT INTO player_casino_links 
            (platform_user_id, casino, casino_user_id, casino_username, verified, created_at)
            VALUES ($1, 'luxdrop', $2, $3, false, NOW())
            ON CONFLICT (platform_user_id, casino) DO NOTHING
          `, [user.id, luxPlayer.player_id.toString(), luxPlayer.username]);
          luxdropLinked++;
        } catch (err) {
          // Ignore duplicate errors
        }
      }
    }
    
    console.log(`   ✅ Linked ${luxdropLinked} users to Luxdrop`);
    
    // Calculate Luxdrop wagers
    console.log('   Calculating Luxdrop wager totals...');
    
    const luxdropLinksResult = await client.query(`
      SELECT pcl.id, pcl.casino_user_id
      FROM player_casino_links pcl
      WHERE pcl.casino = 'luxdrop'
    `);
    
    let luxdropWagersSynced = 0;
    
    for (const link of luxdropLinksResult.rows) {
      const wagerResult = await client.query(`
        SELECT COALESCE(SUM(wagered), 0) as total_wagered
        FROM luxdrop_player_daily_stats
        WHERE player_id = $1
      `, [parseInt(link.casino_user_id)]);
      
      const totalWagered = parseFloat(wagerResult.rows[0].total_wagered) || 0;
      
      if (totalWagered > 0) {
        await client.query(`
          UPDATE player_casino_links
          SET total_wagered = $1, last_wager_sync_at = NOW(), updated_at = NOW()
          WHERE id = $2
        `, [totalWagered, link.id]);
        luxdropWagersSynced++;
      }
    }
    
    console.log(`   ✅ Updated wager totals for ${luxdropWagersSynced} Luxdrop users`);
    
    // ================================================================
    // STEP 4: Create views for backward compatibility
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 4: Creating backward compatibility views');
    console.log('='.repeat(60));
    
    // View: users (points to admin_users for backward compatibility with internal dashboard)
    try {
      await client.query('DROP VIEW IF EXISTS users CASCADE');
      await client.query(`
        CREATE VIEW users AS
        SELECT * FROM admin_users
      `);
      console.log('   ✅ Created view: users → admin_users');
    } catch (err) {
      console.log('   ⚠️  Could not create users view:', err.message);
    }
    
    // View: kick_users (points to platform_users for easy reference)
    try {
      await client.query('DROP VIEW IF EXISTS kick_users CASCADE');
      await client.query(`
        CREATE VIEW kick_users AS
        SELECT 
          pu.*,
          usc.total_sweet_coins,
          usc.total_emotes,
          usc.is_subscriber
        FROM platform_users pu
        LEFT JOIN platform_user_sweet_coins usc ON usc.user_id = pu.id
      `);
      console.log('   ✅ Created view: kick_users (platform_users with sweet coins)');
    } catch (err) {
      console.log('   ⚠️  Could not create kick_users view:', err.message);
    }
    
    // View: platform_user_wagers (aggregated wager data per user)
    try {
      await client.query('DROP VIEW IF EXISTS platform_user_wagers CASCADE');
      await client.query(`
        CREATE VIEW platform_user_wagers AS
        SELECT 
          pu.id as platform_user_id,
          pu.kick_user_id,
          pu.username,
          pu.razed_username,
          COALESCE(razed_link.total_wagered, 0) as razed_total_wagered,
          COALESCE(luxdrop_link.total_wagered, 0) as luxdrop_total_wagered,
          COALESCE(razed_link.total_wagered, 0) + COALESCE(luxdrop_link.total_wagered, 0) as total_wagered
        FROM platform_users pu
        LEFT JOIN player_casino_links razed_link ON razed_link.platform_user_id = pu.id AND razed_link.casino = 'razed'
        LEFT JOIN player_casino_links luxdrop_link ON luxdrop_link.platform_user_id = pu.id AND luxdrop_link.casino = 'luxdrop'
      `);
      console.log('   ✅ Created view: platform_user_wagers');
    } catch (err) {
      console.log('   ⚠️  Could not create platform_user_wagers view:', err.message);
    }
    
    // ================================================================
    // STEP 5: Reset sequences to avoid ID conflicts
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 5: Resetting sequences');
    console.log('='.repeat(60));
    
    const tablesToReset = [
      'platform_users',
      'platform_user_sweet_coins',
      'platform_sweet_coin_history',
      'platform_stream_sessions',
      'platform_chat_messages',
      'platform_offline_chat_messages',
      'platform_user_sessions',
      'platform_raffles',
      'platform_raffle_entries',
      'platform_raffle_winners',
      'platform_promo_codes',
      'platform_promo_code_redemptions',
      'platform_purchase_transactions',
      'platform_advent_purchases',
      'platform_referrals',
      'platform_referral_rewards',
      'platform_razed_verifications',
      'player_casino_links'
    ];
    
    for (const table of tablesToReset) {
      try {
        const maxResult = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 as next_val FROM "${table}"`);
        const nextVal = maxResult.rows[0].next_val;
        await client.query(`SELECT setval('${table}_id_seq', $1, false)`, [nextVal]);
        console.log(`   ✅ Reset ${table}_id_seq to ${nextVal}`);
      } catch (err) {
        // Sequence might not exist or have different name
      }
    }
    
    // ================================================================
    // SUMMARY
    // ================================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('✅ PHASE 4 COMPLETE: Links and Views Created');
    console.log('='.repeat(60));
    
    // Show some statistics
    const statsResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM player_casino_links WHERE casino = 'razed') as razed_links,
        (SELECT COUNT(*) FROM player_casino_links WHERE casino = 'luxdrop') as luxdrop_links,
        (SELECT COUNT(*) FROM player_casino_links WHERE verified = true) as verified_links,
        (SELECT COUNT(*) FROM player_casino_links WHERE total_wagered > 0) as links_with_wagers
    `);
    
    const stats = statsResult.rows[0];
    console.log('\nPlayer Casino Links Statistics:');
    console.log(`  Razed links: ${stats.razed_links}`);
    console.log(`  Luxdrop links: ${stats.luxdrop_links}`);
    console.log(`  Verified links: ${stats.verified_links}`);
    console.log(`  Links with wagers: ${stats.links_with_wagers}`);
    
    console.log('\nNext step: Run phase5-verify.js');
    
  } catch (error) {
    console.error('\n❌ Error during Phase 4:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the phase
phase4().catch(err => {
  console.error(err);
  process.exit(1);
});




