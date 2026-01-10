#!/usr/bin/env npx tsx
/**
 * Disable dry-run mode for moderation
 * Run: npx tsx scripts/disable-dry-run.ts
 */

import { db } from '../lib/db'
import { getModeratorBotSettingsFromDb, setModeratorBotSettingsInDb } from '../lib/moderation-settings'

async function main() {
  console.log('[disable-dry-run] Checking current moderation settings...')

  const settings = await getModeratorBotSettingsFromDb()
  console.log(`[disable-dry-run] Current dry_run_mode: ${settings.dry_run_mode}`)

  // Also check env variable
  const envDryRun = process.env.KICK_MODERATION_DRY_RUN === '1'
  if (envDryRun) {
    console.log('[disable-dry-run] ⚠️ WARNING: KICK_MODERATION_DRY_RUN=1 is set in environment!')
    console.log('[disable-dry-run] You must also unset this env var to fully disable dry-run mode.')
  }

  if (settings.dry_run_mode) {
    console.log('[disable-dry-run] Disabling dry-run mode...')
    settings.dry_run_mode = false
    await setModeratorBotSettingsInDb(settings)
    console.log('[disable-dry-run] ✅ Dry-run mode disabled in database. Moderation actions will now be enforced.')
  } else {
    console.log('[disable-dry-run] ✅ Dry-run mode is already disabled in database.')
  }

  // Verify the change
  const updated = await getModeratorBotSettingsFromDb()
  console.log(`[disable-dry-run] Verified dry_run_mode: ${updated.dry_run_mode}`)

  if (envDryRun) {
    console.log('')
    console.log('⚠️  IMPORTANT: To fully disable dry-run mode, also ensure KICK_MODERATION_DRY_RUN')
    console.log('   is NOT set to "1" in your environment variables or .env file.')
  }

  await db.$disconnect()
}

main().catch(err => {
  console.error('[disable-dry-run] Error:', err)
  process.exit(1)
})
