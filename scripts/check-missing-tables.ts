import pg from 'pg'
const { Client } = pg

const dbUrl = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'

const client = new Client({ connectionString: dbUrl })

async function checkMissingTables() {
  await client.connect()

  // Expected tables from schema (with platform_ prefix)
  const expectedTables = [
    'platform_users',
    'platform_purchase_transactions',
    'platform_stream_sessions',
    'platform_chat_messages',
    'platform_offline_chat_messages',
    'platform_user_sweet_coins',
    'platform_sweet_coin_history',
    'platform_raffles',
    'platform_raffle_entries',
    'platform_raffle_winners',
    'platform_user_sessions',
    'platform_promo_codes',
    'platform_promo_code_redemptions',
    'platform_sweet_coin_award_jobs',
    'platform_chat_jobs',
    'platform_advent_purchases',
    'platform_referrals',
    'platform_referral_rewards',
    'platform_app_settings',
    'platform_moderation_action_logs',
    'platform_bot_reply_logs',
    'platform_razed_verifications',
    // New achievement tables
    'platform_achievement_definitions',
    'platform_user_achievements',
    'platform_coin_ledger',
    'platform_dashboard_login_days',
    'platform_chat_counters',
    'platform_chat_days',
    'platform_leaderboard_period_results',
    'platform_monthly_winners',
    'platform_watch_time_aggregates',
  ]

  const tablesResult = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `)

  const existingTables = new Set(tablesResult.rows.map(r => r.table_name))

  console.log('=== TABLE STATUS ===\n')

  const missing: string[] = []
  const existing: string[] = []

  for (const table of expectedTables) {
    if (existingTables.has(table)) {
      existing.push(table)
    } else {
      missing.push(table)
    }
  }

  console.log(`✅ EXISTING (${existing.length}):`)
  existing.forEach(t => console.log(`   ${t}`))

  console.log(`\n❌ MISSING (${missing.length}):`)
  missing.forEach(t => console.log(`   ${t}`))

  await client.end()
}

checkMissingTables().catch(console.error)
