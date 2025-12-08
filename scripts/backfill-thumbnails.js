/**
 * Backfill thumbnails for past stream sessions
 * 
 * This script uses Kick's API to fetch live thumbnail data,
 * or generates a placeholder URL for ended streams.
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Default placeholder thumbnail (Kick-style gradient)
const DEFAULT_THUMBNAIL = 'https://images.kick.com/default/thumbnail.jpg'

// Alternative: Use a data URI for a gradient placeholder
const GRADIENT_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZ3JhZCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3R5bGU9InN0b3AtY29sb3I6cmdiKDEzOCw0Myw0Myk7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjpyZ2IoNTMsMTIzLDI1NSk7c3RvcC1vcGFjaXR5OjEiIC8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjE5MjAiIGhlaWdodD0iMTA4MCIgZmlsbD0idXJsKCNncmFkKSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNDgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgb3BhY2l0eT0iMC41Ij5QYXN0IFN0cmVhbTwvdGV4dD48L3N2Zz4='

async function main() {
    try {
        console.log('🔍 Finding stream sessions without thumbnails...\n')
        
        const sessionsWithoutThumbnails = await prisma.streamSession.findMany({
            where: { thumbnail_url: null },
            select: {
                id: true,
                broadcaster_user_id: true,
                channel_slug: true,
                session_title: true,
                started_at: true,
                ended_at: true,
            },
            orderBy: { started_at: 'desc' }
        })
        
        const totalSessions = await prisma.streamSession.count()
        
        console.log(`📊 Statistics:`)
        console.log(`   Total sessions: ${totalSessions}`)
        console.log(`   Missing thumbnails: ${sessionsWithoutThumbnails.length}`)
        console.log(`   Percentage: ${((sessionsWithoutThumbnails.length / totalSessions) * 100).toFixed(1)}%\n`)
        
        if (sessionsWithoutThumbnails.length === 0) {
            console.log('✅ All sessions have thumbnails!')
            return
        }
        
        console.log(`🔄 Adding placeholder thumbnails to all sessions without thumbnails...\n`)
        
        let updated = 0
        let errors = 0
        
        // Use a nice gradient placeholder for all sessions
        const thumbnailUrl = GRADIENT_PLACEHOLDER
        
        try {
            // Batch update all sessions without thumbnails
            const result = await prisma.streamSession.updateMany({
                where: { thumbnail_url: null },
                data: { thumbnail_url: thumbnailUrl }
            })
            
            updated = result.count
            console.log(`✅ Updated ${updated} sessions with placeholder thumbnails\n`)
            
        } catch (error) {
            errors++
            console.error(`❌ Error updating sessions:`, error.message, '\n')
        }
        
        console.log(`\n✅ Backfill complete!`)
        console.log(`   Updated: ${updated}`)
        console.log(`   Errors: ${errors}`)
        
        // Final statistics
        const remainingWithoutThumbnails = await prisma.streamSession.count({
            where: { thumbnail_url: null }
        })
        
        console.log(`\n📊 Final Statistics:`)
        console.log(`   Sessions without thumbnails: ${remainingWithoutThumbnails}`)
        console.log(`   Sessions with thumbnails: ${totalSessions - remainingWithoutThumbnails}`)
        console.log(`   Success rate: ${(((totalSessions - remainingWithoutThumbnails) / totalSessions) * 100).toFixed(1)}%`)
        
    } catch (error) {
        console.error('❌ Fatal error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

main()
