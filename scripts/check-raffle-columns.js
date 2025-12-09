require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'raffle_winners';");
  console.log('raffle_winners columns:', res.rows.map(r => r.column_name));
  await client.end();
})();
