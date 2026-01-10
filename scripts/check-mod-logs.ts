#!/usr/bin/env npx tsx
import { Pool } from 'pg'

async function main() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway',
    ssl: { rejectUnauthorized: false }
  })

  console.log('========================================')
  console.log('MODERATION LOGS CHECK')
  console.log('========================================\n')

  try {
    // Check recent moderation logs
    const logs = await pool.query(`
      SELECT created_at, action_type, target_username, reason, rule_id, dry_run, success, error_message
      FROM "ModerationLog"
      ORDER BY created_at DESC
      LIMIT 20
    `)

    console.log('Recent Moderation Actions:')
    if (logs.rows.length === 0) {
      console.log('  No moderation logs found.')
    } else {
      for (const row of logs.rows) {
        const status = row.success ? '✅' : '❌'
        const dryRun = row.dry_run ? '[DRY-RUN]' : ''
        console.log(`${status} ${dryRun} ${row.action_type.toUpperCase()} @${row.target_username}`)
        console.log(`   Reason: ${row.reason}`)
        console.log(`   Rule: ${row.rule_id}`)
        console.log(`   Time: ${row.created_at}`)
        if (row.error_message) {
          console.log(`   ERROR: ${row.error_message}`)
        }
        console.log('')
      }
    }

    // Check for sweetflipsbot user
    console.log('\n========================================')
    console.log('MODERATOR BOT CHECK')
    console.log('========================================\n')

    const bot = await pool.query(`
      SELECT id, username, kick_user_id, access_token_encrypted IS NOT NULL as has_token, updated_at
      FROM "User"
      WHERE LOWER(username) = 'sweetflipsbot'
    `)

    if (bot.rows.length > 0) {
      const b = bot.rows[0]
      console.log(`Bot Found: @${b.username}`)
      console.log(`  Kick User ID: ${b.kick_user_id}`)
      console.log(`  Has Token: ${b.has_token ? '✅ Yes' : '❌ No'}`)
      console.log(`  Updated: ${b.updated_at}`)
    } else {
      console.log('❌ Bot account "sweetflipsbot" NOT FOUND in database!')
    }

  } catch (err) {
    console.error('Error:', err)
  } finally {
    await pool.end()
  }
}

main()
