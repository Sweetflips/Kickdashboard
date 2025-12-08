/**
 * Check how many stream sessions are missing thumbnails
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    try {
        const withoutThumbnails = await prisma.streamSession.count({
            where: { thumbnail_url: null }
        })
        
        const totalSessions = await prisma.streamSession.count()
        
        console.log(`\n📊 Thumbnail Statistics:`)
        console.log(`   Total sessions: ${totalSessions}`)
        console.log(`   Without thumbnails: ${withoutThumbnails}`)
        console.log(`   With thumbnails: ${totalSessions - withoutThumbnails}`)
        console.log(`   Missing: ${((withoutThumbnails / totalSessions) * 100).toFixed(1)}%\n`)
        
        // Get a few sample sessions without thumbnails
        const samples = await prisma.streamSession.findMany({
            where: { thumbnail_url: null },
            take: 5,
            select: {
                id: true,
                channel_slug: true,
                started_at: true,
                ended_at: true,
                session_title: true,
            },
            orderBy: { started_at: 'desc' }
        })
        
        if (samples.length > 0) {
            console.log(`\n📋 Sample sessions without thumbnails:`)
            samples.forEach(s => {
                console.log(`   ID: ${s.id}, Channel: ${s.channel_slug}, Started: ${s.started_at}`)
            })
        }
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main()
