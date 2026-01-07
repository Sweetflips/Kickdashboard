const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

async function main() {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DIRECT_URL or DATABASE_URL must be set');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log('Tables in database:');
    tables.forEach(t => console.log('  -', t.table_name));

    // Check columns in users table
    const usersColumns = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position
    `;
    console.log('\n"users" table columns:');
    usersColumns.forEach(c => console.log('  -', c.column_name));

    // Check columns in platform_users table
    const platformUsersColumns = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_users'
      ORDER BY ordinal_position
    `;
    console.log('\n"platform_users" table columns:');
    platformUsersColumns.forEach(c => console.log('  -', c.column_name));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
