#!/usr/bin/env node
/**
 * Run referee reward tracking migration directly to database
 * 
 * This script applies the migration to add the referee_reward_awarded column
 * to the platform_referral_rewards table.
 * 
 * Usage: node scripts/run-referee-reward-migration.js
 */

const { Client } = require('pg')
const { readFileSync } = require('fs')
const { join } = require('path')

// Database connection string - can be provided via:
// 1. Command line argument: node scripts/run-referee-reward-migration.js "postgresql://..."
// 2. Environment variable: DATABASE_URL="postgresql://..." node scripts/run-referee-reward-migration.js
// 3. Default (hardcoded for convenience)
const DATABASE_URL = process.argv[2] || process.env.DATABASE_URL || 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'

async function runMigration() {
  console.log('')
  console.log('========================================')
  console.log('🔄 RUNNING REFEREE REWARD MIGRATION')
  console.log('========================================')
  console.log('')
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`)
  console.log('')

  const client = new Client({
    connectionString: DATABASE_URL
  })

  try {
    // Connect to database
    console.log('Connecting to database...')
    await client.connect()
    console.log('✅ Connected successfully')
    console.log('')

    // Read migration file
    const migrationPath = join(__dirname, '../prisma/migrations/20260110031901_add_referee_reward_tracking/migration.sql')
    console.log(`Reading migration file: ${migrationPath}`)
    
    const migrationSQL = readFileSync(migrationPath, 'utf-8')
    console.log('✅ Migration file read successfully')
    console.log('')
    console.log('Migration SQL:')
    console.log('---')
    console.log(migrationSQL)
    console.log('---')
    console.log('')

    // Execute the migration
    console.log('Executing migration...')
    try {
      await client.query(migrationSQL)
      console.log('✅ Migration executed successfully')
      console.log('')
    } catch (execError) {
      const errorMessage = execError.message || String(execError)
      const errorCode = execError.code || ''
      
      // Check if column already exists (not an error)
      if (errorMessage.includes('already exists') || 
          errorMessage.includes('duplicate') ||
          (errorMessage.includes('column') && errorMessage.includes('already exists')) ||
          errorCode === '42701') { // duplicate column
        console.log('⚠️  Column already exists (migration may have been run previously)')
        console.log('✅ Migration skipped - column already present')
        console.log('')
      } else {
        throw execError
      }
    }

    // Verify the migration was applied
    console.log('Verifying migration...')
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'platform_referral_rewards'
        AND column_name = 'referee_reward_awarded'
      ) as exists
    `)
    
    const exists = result.rows[0]?.exists || false
    
    if (exists) {
      console.log('✅ Column "referee_reward_awarded" exists in "platform_referral_rewards" table')
      console.log('')
      console.log('========================================')
      console.log('✅ MIGRATION COMPLETED SUCCESSFULLY')
      console.log('========================================')
      console.log('')
    } else {
      console.log('⚠️  Warning: Column verification failed')
      console.log('The migration may have run, but the column was not found.')
      console.log('Please check the database manually.')
      console.log('')
    }

  } catch (error) {
    const errorMessage = error.message || String(error)
    const errorCode = error.code || ''
    
    console.error('')
    console.error('========================================')
    console.error('❌ MIGRATION FAILED')
    console.error('========================================')
    console.error('')
    console.error('Error:', errorMessage)
    console.error('Code:', errorCode)
    console.error('')
    throw error
  } finally {
    await client.end()
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Migration script failed:', error)
    process.exit(1)
  })
