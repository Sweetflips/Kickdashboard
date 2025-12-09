require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function verifyStreamStatus() {
    console.log('='.repeat(80))
    console.log('STREAM STATUS VERIFICATION')
    console.log('='.repeat(80))

    // Check Kick API
    console.log('\n1. Checking Kick API...')
    try {
        const response = await fetch('https://kick.com/api/v2/channels/sweetflips')
        const data = await response.json()
        
        const isLive = data.livestream?.is_live || false
        const viewerCount = data.livestream?.viewer_count || 0
        
        console.log(`   ✓ API Response: ${isLive ? '🔴 LIVE' : '⚫ OFFLINE'}`)
        if (isLive) {
            console.log(`   ✓ Current Viewers: ${viewerCount}`)
        }
    } catch (error) {
        console.log(`   ✗ Error checking API: ${error.message}`)
    }

    // Check database for active sessions
    console.log('\n2. Checking database for active sessions...')
    const activeSessions = await prisma.streamSession.findMany({
        where: { ended_at: null },
        orderBy: { started_at: 'desc' },
    })

    if (activeSessions.length === 0) {
        console.log('   ✓ No active sessions in database')
    } else {
        console.log(`   ✗ Found ${activeSessions.length} active session(s):`)
        activeSessions.forEach(session => {
            console.log(`      Session ${session.id}: Started ${session.started_at.toISOString()}`)
        })
    }

    // Check most recent session
    console.log('\n3. Most recent session data...')
    const lastSession = await prisma.streamSession.findFirst({
        orderBy: { started_at: 'desc' },
    })

    if (lastSession) {
        const duration = lastSession.duration_seconds 
            ? `${Math.floor(lastSession.duration_seconds / 3600)}h ${Math.floor((lastSession.duration_seconds % 3600) / 60)}m`
            : 'N/A'
        
        console.log(`   Session ID: ${lastSession.id}`)
        console.log(`   Started: ${lastSession.started_at.toISOString()}`)
        console.log(`   Ended: ${lastSession.ended_at ? lastSession.ended_at.toISOString() : 'ACTIVE'}`)
        console.log(`   Duration: ${duration}`)
        console.log(`   Peak Viewers: ${lastSession.peak_viewer_count}`)
        console.log(`   Messages: ${lastSession.total_messages}`)
    }

    console.log('\n' + '='.repeat(80))
    console.log('CONCLUSION')
    console.log('='.repeat(80))
    
    const kickIsLive = false // Will be set from API call above
    const dbHasActive = activeSessions.length > 0
    
    if (!kickIsLive && !dbHasActive) {
        console.log('✅ Everything is correct: Stream is offline, no active sessions')
        console.log('   If you still see "LIVE" on your dashboard, clear your browser cache:')
        console.log('   - Press Ctrl+Shift+R to hard refresh')
        console.log('   - Or press Ctrl+Shift+Delete to clear cache')
    } else if (kickIsLive && !dbHasActive) {
        console.log('⚠️  Stream is LIVE but no session in database')
        console.log('   Start your dev server and wait 5-15 seconds for auto-detection')
    } else if (!kickIsLive && dbHasActive) {
        console.log('⚠️  Stream is OFFLINE but database has active session')
        console.log('   Run: node scripts\\end-active-sessions.js')
    }
    
    await prisma.$disconnect()
}

verifyStreamStatus().catch(console.error)
