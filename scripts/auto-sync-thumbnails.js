/**
 * Auto-sync thumbnails for active streams
 * 
 * This script should be run periodically (e.g., via cron) to ensure
 * all active stream sessions have thumbnails captured.
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function syncThumbnails() {
    try {
        console.log('🔍 Checking for active streams without thumbnails...\n')
        
        // Find active sessions (not ended) without thumbnails
        const activeSessions = await prisma.streamSession.findMany({
            where: {
                ended_at: null,
                thumbnail_url: null,
            },
            select: {
                id: true,
                broadcaster_user_id: true,
                channel_slug: true,
                started_at: true,
            },
        })
        
        if (activeSessions.length === 0) {
            console.log('✅ All active streams have thumbnails!')
            return
        }
        
        console.log(`📊 Found ${activeSessions.length} active sessions without thumbnails`)
        
        // Import the Kick API function
        const kickApi = require('../lib/kick-api')
        
        let updated = 0
        let failed = 0
        
        for (const session of activeSessions) {
            try {
                if (!session.channel_slug) {
                    console.log(`⚠️  Session ${session.id} has no channel_slug, skipping`)
                    failed++
                    continue
                }
                
                console.log(`📡 Fetching thumbnail for ${session.channel_slug}...`)
                
                // Fetch current livestream data from Kick API
                const livestreamData = await kickApi.getChannelWithLivestream(session.channel_slug)
                
                if (livestreamData && livestreamData.thumbnailUrl) {
                    // Update session with thumbnail
                    await prisma.streamSession.update({
                        where: { id: session.id },
                        data: { thumbnail_url: livestreamData.thumbnailUrl },
                    })
                    
                    updated++
                    console.log(`✅ Updated session ${session.id} with thumbnail`)
                } else {
                    console.log(`⚠️  No thumbnail available for ${session.channel_slug}`)
                    failed++
                }
                
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 500))
                
            } catch (error) {
                console.error(`❌ Error processing session ${session.id}:`, error.message)
                failed++
            }
        }
        
        console.log(`\n✅ Sync complete!`)
        console.log(`   Updated: ${updated}`)
        console.log(`   Failed: ${failed}`)
        
    } catch (error) {
        console.error('❌ Fatal error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

// Run if called directly
if (require.main === module) {
    syncThumbnails()
}

module.exports = { syncThumbnails }
