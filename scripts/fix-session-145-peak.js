require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function fixPeakViewers() {
    const sessionId = 145
    const correctPeakViewers = 1840

    console.log('Updating session 145 peak viewers...')
    console.log(`Setting peak_viewer_count to: ${correctPeakViewers}`)

    const result = await prisma.streamSession.update({
        where: { id: BigInt(sessionId) },
        data: {
            peak_viewer_count: correctPeakViewers,
        },
    })

    console.log(`✅ Session ${sessionId} updated successfully`)
    console.log(`   Peak Viewers: ${result.peak_viewer_count}`)
    console.log(`   Started: ${result.started_at.toISOString()}`)
    console.log(`   Ended: ${result.ended_at?.toISOString()}`)
    console.log(`   Duration: ${Math.floor(result.duration_seconds / 3600)}h ${Math.floor((result.duration_seconds % 3600) / 60)}m`)

    await prisma.$disconnect()
}

fixPeakViewers().catch(console.error)
