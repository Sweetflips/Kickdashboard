require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const url = process.env.DATABASE_URL;
  const client = new Client({ connectionString: url });
  await client.connect();
  const q1 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'raffle_entries';");
  const q2 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'raffles';");
  const q3 = await client.query("SELECT to_regclass('public.raffle_rigged_winners') as exists;")
  console.log('raffle_entries columns:', q1.rows.map(r => r.column_name));
  console.log('raffles columns:', q2.rows.map(r => r.column_name));
  console.log('raffle_rigged_winners exists:', q3.rows[0].exists !== null);
  await client.end();
})();
