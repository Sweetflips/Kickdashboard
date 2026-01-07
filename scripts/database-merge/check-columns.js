const { Client } = require('pg');

const DB2_URL = 'postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway';

async function main() {
  const db = new Client({ connectionString: DB2_URL });
  await db.connect();
  
  const tables = [
    'stream_sessions',
    'user_sweet_coins', 
    'sweet_coin_history',
    'chat_messages',
    'offline_chat_messages',
    'user_sessions',
    'raffles',
    'raffle_entries',
    'promo_codes',
    'promo_code_redemptions',
    'purchase_transactions',
    'advent_purchases',
    'referrals',
    'razed_verifications',
    'app_settings'
  ];
  
  for (const table of tables) {
    console.log(`\n=== ${table} ===`);
    const result = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position
    `, [table]);
    console.log(result.rows.map(r => r.column_name).join(', '));
  }
  
  await db.end();
}

main();
