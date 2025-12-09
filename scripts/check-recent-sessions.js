require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function checkRecentSessions() {
    const sessions = await prisma.streamSession.findMany({
        orderBy: { started_at: 'desc' },
        take: 5,
    })

    console.log('Recent stream sessions:')
    console.log('='.repeat(100))
    
    sessions.forEach(session => {
        const started = session.started_at.toISOString()
        const ended = session.ended_at ? session.ended_at.toISOString() : 'ACTIVE'
        const duration = session.duration_seconds 
            ? `${Math.floor(session.duration_seconds / 3600)}h ${Math.floor((session.duration_seconds % 3600) / 60)}m`
            : 'N/A'
        
        console.log(`\nSession ID: ${session.id}`)
        console.log(`  Started: ${started}`)
        console.log(`  Ended: ${ended}`)
        console.log(`  Duration: ${duration}`)
        console.log(`  Peak Viewers: ${session.peak_viewer_count}`)
        console.log(`  Messages: ${session.total_messages}`)
        console.log(`  Title: ${session.session_title || 'N/A'}`)
    })

    await prisma.$disconnect()
}

checkRecentSessions().catch(console.error)
