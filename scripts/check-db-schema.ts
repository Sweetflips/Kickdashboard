import pg from 'pg'
const { Client } = pg

const dbUrl = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'

const client = new Client({ connectionString: dbUrl })

async function checkSchema() {
  await client.connect()
  console.log('Connected to database\n')

  // List all tables
  const tablesResult = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `)

  console.log('=== TABLES IN DATABASE ===')
  tablesResult.rows.forEach(r => console.log(`  - ${r.table_name}`))

  // Check if expected tables exist
  const expectedTables = ['users', 'chat_messages', 'stream_sessions', 'user_sweet_coins', 'sweet_coin_history']
  console.log('\n=== CHECKING EXPECTED TABLES ===')
  for (const table of expectedTables) {
    const exists = tablesResult.rows.some(r => r.table_name === table)
    console.log(`  ${table}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`)
  }

  // Check for platform_ prefixed tables
  const platformTables = tablesResult.rows.filter(r => r.table_name.startsWith('platform_'))
  if (platformTables.length > 0) {
    console.log('\n=== PLATFORM-PREFIXED TABLES FOUND ===')
    platformTables.forEach(r => console.log(`  - ${r.table_name}`))
  }

  // Check users table structure if it exists
  const usersExists = tablesResult.rows.some(r => r.table_name === 'users')
  if (usersExists) {
    const usersColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position
    `)
    console.log('\n=== USERS TABLE COLUMNS ===')
    usersColumns.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`))
  }

  // Check platform_users table structure if it exists
  const platformUsersExists = tablesResult.rows.some(r => r.table_name === 'platform_users')
  if (platformUsersExists) {
    const platformUsersColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'platform_users' AND table_schema = 'public'
      ORDER BY ordinal_position
    `)
    console.log('\n=== PLATFORM_USERS TABLE COLUMNS ===')
    platformUsersColumns.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`))
  }

  await client.end()
}

checkSchema().catch(console.error)
