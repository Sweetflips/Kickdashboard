const { Client } = require('pg');

const DB1_URL = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway';

async function main() {
  const db = new Client({ connectionString: DB1_URL });
  await db.connect();
  
  const tables = [
    'platform_stream_sessions',
    'platform_user_sweet_coins', 
    'platform_sweet_coin_history',
    'platform_chat_messages',
    'platform_offline_chat_messages',
    'platform_user_sessions',
    'platform_raffles',
    'platform_raffle_entries',
    'platform_promo_codes',
    'platform_promo_code_redemptions',
    'platform_purchase_transactions',
    'platform_advent_purchases',
    'platform_referrals',
    'platform_razed_verifications',
    'platform_app_settings'
  ];
  
  for (const table of tables) {
    console.log(`\n=== ${table} ===`);
    const result = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position
    `, [table]);
    if (result.rows.length === 0) {
      console.log('(table does not exist)');
    } else {
      console.log(result.rows.map(r => r.column_name).join(', '));
    }
  }
  
  await db.end();
}

main();
