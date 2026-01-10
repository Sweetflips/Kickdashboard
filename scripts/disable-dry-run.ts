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

  if (settings.dry_run_mode) {
    console.log('[disable-dry-run] Disabling dry-run mode...')
    settings.dry_run_mode = false
    await setModeratorBotSettingsInDb(settings)
    console.log('[disable-dry-run] ✅ Dry-run mode disabled. Moderation actions will now be enforced.')
  } else {
    console.log('[disable-dry-run] ✅ Dry-run mode is already disabled.')
  }

  // Verify the change
  const updated = await getModeratorBotSettingsFromDb()
  console.log(`[disable-dry-run] Verified dry_run_mode: ${updated.dry_run_mode}`)

  await (db as any).$disconnect()
}

main().catch(err => {
  console.error('[disable-dry-run] Error:', err)
  process.exit(1)
})
