/**
 * PHASE 5: Verify Database Merge Integrity
 * 
 * This script:
 * 1. Compares row counts between source (DB2) and destination (DB1)
 * 2. Validates foreign key relationships
 * 3. Checks data integrity
 * 4. Generates a final report
 * 
 * Run: node scripts/database-merge/phase5-verify.js
 */

const { Client } = require('pg');

const DB1_URL = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway';
const DB2_URL = 'postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway';

async function phase5() {
  const db1 = new Client({ connectionString: DB1_URL });
  const db2 = new Client({ connectionString: DB2_URL });
  
  try {
    await db1.connect();
    await db2.connect();
    console.log('✅ Connected to both databases\n');
    
    const report = {
      timestamp: new Date().toISOString(),
      tableCounts: {},
      foreignKeyChecks: [],
      dataIntegrity: [],
      warnings: [],
      errors: []
    };
    
    // ================================================================
    // STEP 1: Compare row counts
    // ================================================================
    console.log('='.repeat(60));
    console.log('STEP 1: Comparing Row Counts');
    console.log('='.repeat(60));
    
    const tableMapping = [
      { source: 'users', target: 'platform_users' },
      { source: 'user_sweet_coins', target: 'platform_user_sweet_coins' },
      { source: 'sweet_coin_history', target: 'platform_sweet_coin_history' },
      { source: 'stream_sessions', target: 'platform_stream_sessions' },
      { source: 'chat_messages', target: 'platform_chat_messages' },
      { source: 'offline_chat_messages', target: 'platform_offline_chat_messages' },
      { source: 'user_sessions', target: 'platform_user_sessions' },
      { source: 'raffles', target: 'platform_raffles' },
      { source: 'raffle_entries', target: 'platform_raffle_entries' },
      { source: 'promo_codes', target: 'platform_promo_codes' },
      { source: 'promo_code_redemptions', target: 'platform_promo_code_redemptions' },
      { source: 'purchase_transactions', target: 'platform_purchase_transactions' },
      { source: 'advent_purchases', target: 'platform_advent_purchases' },
      { source: 'referrals', target: 'platform_referrals' },
      { source: 'razed_verifications', target: 'platform_razed_verifications' },
      { source: 'app_settings', target: 'platform_app_settings' }
    ];
    
    console.log('\nTable                          | Source (DB2) | Target (DB1) | Status');
    console.log('-'.repeat(80));
    
    for (const mapping of tableMapping) {
      const sourceCount = await db2.query(`SELECT COUNT(*) as count FROM "${mapping.source}"`);
      const targetCount = await db1.query(`SELECT COUNT(*) as count FROM "${mapping.target}"`);
      
      const src = parseInt(sourceCount.rows[0].count);
      const tgt = parseInt(targetCount.rows[0].count);
      const diff = tgt - src;
      
      let status = '✅';
      if (tgt < src) {
        status = '⚠️  MISSING';
        report.warnings.push(`${mapping.target} has fewer rows than ${mapping.source}: ${tgt} vs ${src}`);
      } else if (tgt === src) {
        status = '✅ EXACT';
      } else {
        status = '✅ OK';
      }
      
      report.tableCounts[mapping.target] = { source: src, target: tgt, diff };
      
      console.log(`${mapping.target.padEnd(30)} | ${src.toLocaleString().padStart(12)} | ${tgt.toLocaleString().padStart(12)} | ${status}`);
    }
    
    // ================================================================
    // STEP 2: Verify admin_users table
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Verifying admin_users Table');
    console.log('='.repeat(60));
    
    const adminUsersResult = await db1.query(`
      SELECT COUNT(*) as count FROM admin_users
    `);
    console.log(`   admin_users count: ${adminUsersResult.rows[0].count}`);
    
    // List admin users
    const adminsResult = await db1.query(`
      SELECT id, email, name, role FROM admin_users ORDER BY id LIMIT 10
    `);
    console.log('\n   Admin Users (first 10):');
    for (const admin of adminsResult.rows) {
      console.log(`   - ID: ${admin.id}, Email: ${admin.email}, Name: ${admin.name}, Role: ${admin.role}`);
    }
    
    // ================================================================
    // STEP 3: Verify foreign key relationships
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Verifying Foreign Key Relationships');
    console.log('='.repeat(60));
    
    // Check platform_user_sweet_coins references valid users
    const orphanSweetCoins = await db1.query(`
      SELECT COUNT(*) as count 
      FROM platform_user_sweet_coins usc
      WHERE NOT EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = usc.user_id)
    `);
    const orphanCount1 = parseInt(orphanSweetCoins.rows[0].count);
    console.log(`   platform_user_sweet_coins orphans: ${orphanCount1}`);
    if (orphanCount1 > 0) {
      report.warnings.push(`${orphanCount1} orphan records in platform_user_sweet_coins`);
    }
    
    // Check platform_sweet_coin_history references valid users
    const orphanHistory = await db1.query(`
      SELECT COUNT(*) as count 
      FROM platform_sweet_coin_history sch
      WHERE NOT EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = sch.user_id)
    `);
    const orphanCount2 = parseInt(orphanHistory.rows[0].count);
    console.log(`   platform_sweet_coin_history orphans: ${orphanCount2}`);
    if (orphanCount2 > 0) {
      report.warnings.push(`${orphanCount2} orphan records in platform_sweet_coin_history`);
    }
    
    // Check platform_raffle_entries references valid users and raffles
    const orphanEntries = await db1.query(`
      SELECT COUNT(*) as count 
      FROM platform_raffle_entries pre
      WHERE NOT EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = pre.user_id)
         OR NOT EXISTS (SELECT 1 FROM platform_raffles pr WHERE pr.id = pre.raffle_id)
    `);
    const orphanCount3 = parseInt(orphanEntries.rows[0].count);
    console.log(`   platform_raffle_entries orphans: ${orphanCount3}`);
    if (orphanCount3 > 0) {
      report.warnings.push(`${orphanCount3} orphan records in platform_raffle_entries`);
    }
    
    // Check player_casino_links references valid users
    const orphanLinks = await db1.query(`
      SELECT COUNT(*) as count 
      FROM player_casino_links pcl
      WHERE NOT EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = pcl.platform_user_id)
    `);
    const orphanCount4 = parseInt(orphanLinks.rows[0].count);
    console.log(`   player_casino_links orphans: ${orphanCount4}`);
    if (orphanCount4 > 0) {
      report.warnings.push(`${orphanCount4} orphan records in player_casino_links`);
    }
    
    report.foreignKeyChecks.push({
      table: 'platform_user_sweet_coins',
      orphans: orphanCount1,
      status: orphanCount1 === 0 ? 'OK' : 'WARNING'
    });
    
    // ================================================================
    // STEP 4: Verify data integrity
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 4: Verifying Data Integrity');
    console.log('='.repeat(60));
    
    // Check for duplicate kick_user_ids
    const duplicateKickIds = await db1.query(`
      SELECT kick_user_id, COUNT(*) as count
      FROM platform_users
      GROUP BY kick_user_id
      HAVING COUNT(*) > 1
    `);
    console.log(`   Duplicate kick_user_ids: ${duplicateKickIds.rows.length}`);
    if (duplicateKickIds.rows.length > 0) {
      report.errors.push(`Found ${duplicateKickIds.rows.length} duplicate kick_user_ids`);
    }
    
    // Check for users with sweet coins but no sweet_coins record
    const usersWithoutSweetCoins = await db1.query(`
      SELECT COUNT(*) as count
      FROM platform_users pu
      WHERE NOT EXISTS (
        SELECT 1 FROM platform_user_sweet_coins usc WHERE usc.user_id = pu.id
      )
    `);
    console.log(`   Users without sweet_coins record: ${usersWithoutSweetCoins.rows[0].count}`);
    
    // Check razed connections
    const razedConnected = await db1.query(`
      SELECT COUNT(*) as count
      FROM platform_users
      WHERE razed_connected = true
    `);
    console.log(`   Users with razed_connected: ${razedConnected.rows[0].count}`);
    
    const razedLinks = await db1.query(`
      SELECT COUNT(*) as count
      FROM player_casino_links
      WHERE casino = 'razed' AND verified = true
    `);
    console.log(`   Verified razed links: ${razedLinks.rows[0].count}`);
    
    // ================================================================
    // STEP 5: Check existing tables weren't affected
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 5: Verifying Existing DB1 Tables');
    console.log('='.repeat(60));
    
    const existingTables = [
      'admin_users',
      'razed_players',
      'razed_player_daily_stats',
      'luxdrop_players',
      'luxdrop_player_daily_stats',
      'players',
      'player_daily_stats',
      'player_bonus_transactions',
      'player_loans',
      'leads',
      'shuffle_bets',
      'shuffle_users',
      'tasks',
      'tickets',
      'audit_logs',
      'raffles',
      'raffle_entries',
      'raffle_winners'
    ];
    
    console.log('\nExisting Table Counts:');
    for (const table of existingTables) {
      try {
        const countResult = await db1.query(`SELECT COUNT(*) as count FROM "${table}"`);
        console.log(`   ${table}: ${parseInt(countResult.rows[0].count).toLocaleString()}`);
      } catch (err) {
        console.log(`   ${table}: ERROR - ${err.message}`);
      }
    }
    
    // ================================================================
    // STEP 6: Sample data verification
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 6: Sample Data Verification');
    console.log('='.repeat(60));
    
    // Get a sample platform user with all their data
    const sampleUser = await db1.query(`
      SELECT 
        pu.id,
        pu.kick_user_id,
        pu.username,
        pu.razed_username,
        pu.razed_connected,
        usc.total_sweet_coins,
        (SELECT COUNT(*) FROM platform_sweet_coin_history WHERE user_id = pu.id) as history_count,
        (SELECT COUNT(*) FROM platform_chat_messages WHERE sender_user_id = pu.kick_user_id) as message_count
      FROM platform_users pu
      LEFT JOIN platform_user_sweet_coins usc ON usc.user_id = pu.id
      WHERE usc.total_sweet_coins > 0
      ORDER BY usc.total_sweet_coins DESC
      LIMIT 1
    `);
    
    if (sampleUser.rows.length > 0) {
      const user = sampleUser.rows[0];
      console.log('\n   Sample User (highest sweet coins):');
      console.log(`   - ID: ${user.id}`);
      console.log(`   - Kick User ID: ${user.kick_user_id}`);
      console.log(`   - Username: ${user.username}`);
      console.log(`   - Razed Username: ${user.razed_username || 'N/A'}`);
      console.log(`   - Razed Connected: ${user.razed_connected}`);
      console.log(`   - Total Sweet Coins: ${user.total_sweet_coins}`);
      console.log(`   - Sweet Coin History Records: ${user.history_count}`);
      console.log(`   - Chat Messages: ${user.message_count}`);
    }
    
    // ================================================================
    // FINAL REPORT
    // ================================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('VERIFICATION REPORT');
    console.log('='.repeat(60));
    
    console.log(`\nTimestamp: ${report.timestamp}`);
    
    console.log('\n📊 Table Migration Summary:');
    let totalSource = 0;
    let totalTarget = 0;
    for (const [table, counts] of Object.entries(report.tableCounts)) {
      totalSource += counts.source;
      totalTarget += counts.target;
    }
    console.log(`   Total source rows: ${totalSource.toLocaleString()}`);
    console.log(`   Total target rows: ${totalTarget.toLocaleString()}`);
    
    if (report.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of report.warnings) {
        console.log(`   - ${warning}`);
      }
    } else {
      console.log('\n✅ No warnings');
    }
    
    if (report.errors.length > 0) {
      console.log('\n❌ Errors:');
      for (const error of report.errors) {
        console.log(`   - ${error}`);
      }
    } else {
      console.log('✅ No errors');
    }
    
    // Overall status
    console.log('\n' + '='.repeat(60));
    if (report.errors.length === 0) {
      console.log('✅ DATABASE MERGE VERIFICATION PASSED');
    } else {
      console.log('⚠️  DATABASE MERGE VERIFICATION COMPLETED WITH ISSUES');
    }
    console.log('='.repeat(60));
    
    // Save report to file
    const fs = require('fs');
    const reportPath = 'scripts/database-merge/verification-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Full report saved to: ${reportPath}`);
    
    console.log('\n✅ PHASE 5 COMPLETE');
    console.log('\n📖 Next: Read DATABASE_MERGE_GUIDE.md for code adjustment instructions');
    
  } catch (error) {
    console.error('\n❌ Error during Phase 5:', error.message);
    throw error;
  } finally {
    await db1.end();
    await db2.end();
  }
}

// Run the phase
phase5().catch(err => {
  console.error(err);
  process.exit(1);
});



