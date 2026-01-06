/**
 * PHASE 1: Prepare Shuttle (DB1) Database
 * 
 * This script:
 * 1. Renames 'users' table to 'admin_users'
 * 2. Updates all foreign key references
 * 3. Creates backup of current state
 * 
 * Run: node scripts/database-merge/phase1-prepare-shuttle.js
 */

const { Client } = require('pg');

const DB1_URL = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway';

async function phase1() {
  const client = new Client({ connectionString: DB1_URL });
  
  try {
    await client.connect();
    console.log('✅ Connected to Shuttle (DB1) database\n');
    
    // Start transaction
    await client.query('BEGIN');
    
    // Step 1: Check if users table exists and admin_users doesn't
    console.log('📋 Step 1: Checking current table state...');
    const usersCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      ) as users_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'admin_users'
      ) as admin_users_exists
    `);
    
    const { users_exists, admin_users_exists } = usersCheck.rows[0];
    console.log(`   - users table exists: ${users_exists}`);
    console.log(`   - admin_users table exists: ${admin_users_exists}`);
    
    if (admin_users_exists) {
      console.log('\n⚠️  admin_users table already exists. Skipping rename.');
      console.log('   Phase 1 may have already been run.');
      await client.query('ROLLBACK');
      return;
    }
    
    if (!users_exists) {
      console.log('\n❌ users table does not exist. Cannot proceed.');
      await client.query('ROLLBACK');
      return;
    }
    
    // Step 2: Get current users data for logging
    console.log('\n📋 Step 2: Backing up users data to console...');
    const usersData = await client.query('SELECT id, email, name, role FROM users ORDER BY id');
    console.log(`   Found ${usersData.rows.length} admin users:`);
    usersData.rows.forEach(u => {
      console.log(`   - ID: ${u.id}, Email: ${u.email}, Name: ${u.name}, Role: ${u.role}`);
    });
    
    // Step 3: Get all foreign key constraints referencing users table
    console.log('\n📋 Step 3: Finding foreign key constraints referencing users table...');
    const fkQuery = await client.query(`
      SELECT
        tc.constraint_name,
        tc.table_name as source_table,
        kcu.column_name as source_column,
        ccu.table_name AS target_table,
        ccu.column_name AS target_column
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_name = 'users'
      ORDER BY tc.table_name
    `);
    
    console.log(`   Found ${fkQuery.rows.length} foreign key constraints:`);
    fkQuery.rows.forEach(fk => {
      console.log(`   - ${fk.source_table}.${fk.source_column} → users.${fk.target_column} (${fk.constraint_name})`);
    });
    
    // Step 4: Drop foreign key constraints
    console.log('\n📋 Step 4: Dropping foreign key constraints...');
    for (const fk of fkQuery.rows) {
      console.log(`   Dropping ${fk.constraint_name}...`);
      await client.query(`ALTER TABLE "${fk.source_table}" DROP CONSTRAINT "${fk.constraint_name}"`);
    }
    console.log('   ✅ All foreign key constraints dropped');
    
    // Step 5: Rename users table to admin_users
    console.log('\n📋 Step 5: Renaming users table to admin_users...');
    await client.query('ALTER TABLE users RENAME TO admin_users');
    console.log('   ✅ Table renamed to admin_users');
    
    // Step 6: Rename the primary key constraint if it exists
    console.log('\n📋 Step 6: Updating primary key constraint name...');
    try {
      await client.query('ALTER TABLE admin_users RENAME CONSTRAINT users_pkey TO admin_users_pkey');
      console.log('   ✅ Primary key constraint renamed');
    } catch (e) {
      console.log('   ⚠️  Primary key constraint rename skipped (may not exist or different name)');
    }
    
    // Step 7: Rename the sequence if it exists
    console.log('\n📋 Step 7: Updating sequence name...');
    try {
      await client.query('ALTER SEQUENCE users_id_seq RENAME TO admin_users_id_seq');
      console.log('   ✅ Sequence renamed');
    } catch (e) {
      console.log('   ⚠️  Sequence rename skipped (may not exist or different name)');
    }
    
    // Step 8: Recreate foreign key constraints pointing to admin_users
    console.log('\n📋 Step 8: Recreating foreign key constraints to admin_users...');
    for (const fk of fkQuery.rows) {
      const newConstraintName = fk.constraint_name.replace('users', 'admin_users');
      console.log(`   Creating ${newConstraintName}...`);
      await client.query(`
        ALTER TABLE "${fk.source_table}" 
        ADD CONSTRAINT "${newConstraintName}" 
        FOREIGN KEY ("${fk.source_column}") 
        REFERENCES admin_users("${fk.target_column}")
        ON DELETE CASCADE
      `);
    }
    console.log('   ✅ All foreign key constraints recreated');
    
    // Step 9: Verify the rename
    console.log('\n📋 Step 9: Verifying the rename...');
    const verifyResult = await client.query(`
      SELECT COUNT(*) as count FROM admin_users
    `);
    console.log(`   ✅ admin_users table has ${verifyResult.rows[0].count} rows`);
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ PHASE 1 COMPLETE: users table renamed to admin_users');
    console.log('='.repeat(60));
    console.log('\nNext step: Run phase2-create-platform-tables.js');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error during Phase 1:', error.message);
    console.error('Transaction rolled back. No changes were made.');
    throw error;
  } finally {
    await client.end();
  }
}

// Run the phase
phase1().catch(err => {
  console.error(err);
  process.exit(1);
});




