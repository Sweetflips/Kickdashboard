import { db } from '@/lib/db'
import crypto from 'crypto'

const OVERLAY_KEY_SETTING_KEY = 'wheel_overlay_key'

/**
 * Get the persistent overlay access key for OBS browser sources.
 *
 * Priority:
 * 1. If WHEEL_OVERLAY_KEY env var is set, use that (allows override in prod)
 * 2. Otherwise, read from AppSetting table
 * 3. If missing, generate a secure random key and store it
 */
export async function getOverlayAccessKey(): Promise<string> {
  // Check env var first (allows override in production)
  if (process.env.WHEEL_OVERLAY_KEY) {
    return process.env.WHEEL_OVERLAY_KEY
  }

  // Try to read from database
  const existing = await db.appSetting.findUnique({
    where: { key: OVERLAY_KEY_SETTING_KEY },
  })

  if (existing?.value) {
    return existing.value
  }

  // Generate a new secure random key (32 bytes = 64 hex chars)
  const newKey = crypto.randomBytes(32).toString('hex')

  // Store it atomically (upsert to handle race conditions)
  await db.appSetting.upsert({
    where: { key: OVERLAY_KEY_SETTING_KEY },
    update: { value: newKey },
    create: {
      key: OVERLAY_KEY_SETTING_KEY,
      value: newKey,
    },
  })

  return newKey
}
