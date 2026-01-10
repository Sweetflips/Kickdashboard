#!/usr/bin/env npx tsx
/**
 * Diagnose moderation system issues
 * Run: npx tsx scripts/diagnose-moderation.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from '../lib/db'
import { getModeratorBotSettingsFromDb } from '../lib/moderation-settings'

async function main() {
  console.log('========================================')
  console.log('MODERATION SYSTEM DIAGNOSTIC')
  console.log('========================================\n')

  // 1. Check environment variables
  console.log('[1] Environment Variables:')
  console.log(`  KICK_MODERATION_DRY_RUN: ${process.env.KICK_MODERATION_DRY_RUN || '(not set)'}`)
  console.log(`  KICK_MODERATOR_USERNAME: ${process.env.KICK_MODERATOR_USERNAME || 'sweetflipsbot (default)'}`)
  console.log(`  KICK_CLIENT_ID: ${process.env.KICK_CLIENT_ID ? '✅ set' : '❌ NOT SET'}`)
  console.log(`  KICK_API_BASE: ${process.env.KICK_API_BASE || 'https://api.kick.com (default)'}`)
  console.log('')

  // 2. Check database settings
  console.log('[2] Database Moderation Settings:')
  try {
    const settings = await getModeratorBotSettingsFromDb()
    console.log(`  dry_run_mode: ${settings.dry_run_mode ? '❌ TRUE (DRY RUN ACTIVE!)' : '✅ false'}`)
    console.log(`  spam_detection_enabled: ${settings.spam_detection_enabled ? '✅ true' : '❌ false'}`)
    console.log(`  ai_moderation_enabled: ${settings.ai_moderation_enabled ? '✅ true' : '❌ false'}`)
    console.log(`  moderation_announce_actions: ${settings.moderation_announce_actions}`)
    console.log(`  timeout_seconds: ${settings.timeout_seconds}`)
    console.log(`  ban_on_repeat_count: ${settings.ban_on_repeat_count}`)
  } catch (err) {
    console.log(`  ❌ Error loading settings: ${err}`)
  }
  console.log('')

  // 3. Check moderator bot account
  console.log('[3] Moderator Bot Account:')
  const moderatorUsername = process.env.KICK_MODERATOR_USERNAME || 'sweetflipsbot'
  try {
    const moderator = await (db as any).user.findFirst({
      where: {
        username: {
          equals: moderatorUsername,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        username: true,
        kick_user_id: true,
        access_token_encrypted: true,
        refresh_token_encrypted: true,
        updated_at: true,
      },
    })

    if (moderator) {
      console.log(`  Username: ${moderator.username}`)
      console.log(`  Kick User ID: ${moderator.kick_user_id}`)
      console.log(`  Access Token: ${moderator.access_token_encrypted ? '✅ Present' : '❌ MISSING'}`)
      console.log(`  Refresh Token: ${moderator.refresh_token_encrypted ? '✅ Present' : '❌ MISSING'}`)
      console.log(`  Last Updated: ${moderator.updated_at}`)
    } else {
      console.log(`  ❌ Moderator account '${moderatorUsername}' NOT FOUND in database!`)
      console.log(`  This means the bot cannot authenticate with Kick API.`)
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err}`)
  }
  console.log('')

  // 4. Check recent moderation logs
  console.log('[4] Recent Moderation Actions (last 10):')
  try {
    const logs = await (db as any).moderationLog.findMany({
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        created_at: true,
        action_type: true,
        target_username: true,
        reason: true,
        rule_id: true,
        dry_run: true,
        success: true,
        error_message: true,
      },
    })

    if (logs.length === 0) {
      console.log('  No moderation logs found.')
    } else {
      for (const log of logs) {
        const status = log.success ? '✅' : '❌'
        const dryRun = log.dry_run ? '[DRY-RUN]' : ''
        console.log(`  ${status} ${dryRun} ${log.action_type} @${log.target_username} - ${log.reason}`)
        if (log.error_message) {
          console.log(`     Error: ${log.error_message}`)
        }
      }
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err}`)
  }
  console.log('')

  // 5. Summary
  console.log('========================================')
  console.log('DIAGNOSIS SUMMARY')
  console.log('========================================')

  const settings = await getModeratorBotSettingsFromDb()
  const isDryRunEnv = process.env.KICK_MODERATION_DRY_RUN === '1'
  const isDryRunDb = settings.dry_run_mode

  if (isDryRunEnv || isDryRunDb) {
    console.log('❌ DRY RUN MODE IS ACTIVE!')
    if (isDryRunEnv) console.log('   - KICK_MODERATION_DRY_RUN=1 is set in environment')
    if (isDryRunDb) console.log('   - dry_run_mode=true in database settings')
    console.log('   FIX: Disable dry-run mode to enable live moderation')
  } else {
    console.log('✅ Dry run mode is disabled')
  }

  await (db as any).$disconnect()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
