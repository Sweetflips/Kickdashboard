/**
 * Migration script to move existing base64 avatars from Postgres to R2
 *
 * Usage:
 *   tsx scripts/migrate-avatars-to-r2.ts
 *
 * This script:
 * 1. Finds all users with data URI avatars (custom_profile_picture_url starts with "data:image/")
 * 2. Uploads each avatar to R2
 * 3. Updates the database with the new /api/media/... URL
 */

import { PrismaClient } from '@prisma/client'
import { uploadToR2 } from '../lib/r2'
import { buildMediaUrlFromKey } from '../lib/media-url'
import sharp from 'sharp'
import { randomBytes } from 'crypto'

const db = new PrismaClient()

async function migrateAvatars() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔄 [AVATAR MIGRATION] Starting migration of base64 avatars to R2...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  try {
    // Find all users with data URI avatars
    const users = await db.user.findMany({
      where: {
        custom_profile_picture_url: {
          startsWith: 'data:image/',
        },
      },
      select: {
        id: true,
        kick_user_id: true,
        username: true,
        custom_profile_picture_url: true,
      },
    })

    console.log(`📊 [STATS] Found ${users.length} users with base64 avatars\n`)

    if (users.length === 0) {
      console.log('✅ No avatars to migrate. Exiting.\n')
      return
    }

    let successCount = 0
    let errorCount = 0

    for (const user of users) {
      try {
        const dataUri = user.custom_profile_picture_url!
        console.log(`\n👤 [USER] ${user.username || 'Unknown'} (ID: ${user.kick_user_id})`)

        // Parse data URI: data:image/jpeg;base64,/9j/4AAQ...
        const match = dataUri.match(/^data:image\/([^;]+);base64,(.+)$/)
        if (!match) {
          console.error(`   ❌ Invalid data URI format`)
          errorCount++
          continue
        }

        const [, mimeType, base64Data] = match
        const imageBuffer = Buffer.from(base64Data, 'base64')

        console.log(`   ├─ Original format: ${mimeType}`)
        console.log(`   ├─ Original size: ${(imageBuffer.length / 1024).toFixed(2)} KB`)

        // Process image: resize to 256x256, convert to WebP
        const processedBuffer = await sharp(imageBuffer)
          .resize(256, 256, {
            fit: 'cover',
            position: 'center',
          })
          .webp({ quality: 85 })
          .toBuffer()

        console.log(`   ├─ Processed size: ${(processedBuffer.length / 1024).toFixed(2)} KB`)

        // Generate versioned key
        const timestamp = Date.now()
        const random = randomBytes(8).toString('hex')
        const r2Key = `avatars/${user.kick_user_id}/${timestamp}_${random}.webp`

        // Upload to R2
        await uploadToR2({
          key: r2Key,
          body: processedBuffer,
          contentType: 'image/webp',
          metadata: {
            migrated_from: 'base64',
            original_mime_type: mimeType,
            migrated_at: new Date().toISOString(),
          },
        })

        const serveUrl = buildMediaUrlFromKey(r2Key)

        // Update database
        await db.user.update({
          where: { kick_user_id: user.kick_user_id },
          data: { custom_profile_picture_url: serveUrl },
        })

        console.log(`   ├─ R2 Key: ${r2Key}`)
        console.log(`   ├─ Serve URL: ${serveUrl}`)
        console.log(`   └─ ✅ Migrated successfully`)

        successCount++
      } catch (error) {
        console.error(`   └─ ❌ Error migrating avatar:`, error instanceof Error ? error.message : 'Unknown error')
        errorCount++
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 [MIGRATION SUMMARY]')
    console.log(`   ├─ Total users processed: ${users.length}`)
    console.log(`   ├─ Successfully migrated: ${successCount}`)
    console.log(`   └─ Errors: ${errorCount}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  } catch (error) {
    console.error('\n❌ [FATAL ERROR] Migration failed:', error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

// Run migration
migrateAvatars()
  .then(() => {
    console.log('✅ Migration completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })
