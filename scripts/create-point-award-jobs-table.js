const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Use provided connection string or fall back to DATABASE_URL env var
const dbUrl = process.argv[2] || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ No database URL provided');
  console.log('Usage: node scripts/create-point-award-jobs-table.js <DATABASE_URL>');
  console.log('Or set DATABASE_URL environment variable');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

async function createTable() {
  try {
    console.log('🔄 Checking if point_award_jobs table exists...');

    // Check if table exists
    const checkResult = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'point_award_jobs'
    `;

    if (Array.isArray(checkResult) && checkResult.length > 0) {
      console.log('✅ point_award_jobs table already exists');
      return;
    }

    console.log('⚠️ point_award_jobs table missing, creating it...');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '..', 'prisma', 'migrations', '20250101000020_add_point_award_job', 'migration.sql'),
      'utf-8'
    );

    await prisma.$executeRawUnsafe(migrationSQL);
    console.log('✅ Successfully created point_award_jobs table');

  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log('✅ point_award_jobs table already exists (created concurrently)');
    } else {
      console.error('❌ Failed to create table:', error.message);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

createTable();








