const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL || "postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway"
        }
    }
})

async function normalizePoints() {
    console.log('Starting point normalization...\n')

    // Check current distribution
    const distribution = await prisma.$queryRaw`
        SELECT points_earned, COUNT(*)::int as count
        FROM point_history
        GROUP BY points_earned
        ORDER BY points_earned
    `
    console.log('Current point distribution:')
    console.table(distribution)

    // Count records with 2 points (subscriber bonus)
    const twoPointRecords = await prisma.pointHistory.count({
        where: { points_earned: 2 }
    })

    if (twoPointRecords === 0) {
        console.log('\nNo records with 2 points found. Nothing to normalize.')
        return
    }

    console.log(`\nFound ${twoPointRecords} records with 2 points (subscriber bonus)`)
    console.log('Normalizing all to 1 point...\n')

    // Update all 2-point records to 1 point
    const updated = await prisma.pointHistory.updateMany({
        where: { points_earned: 2 },
        data: { points_earned: 1 }
    })

    console.log(`Updated ${updated.count} point_history records to 1 point`)

    // Now recalculate total_points for all users based on point_history
    console.log('\nRecalculating total_points for all users...')

    const pointSums = await prisma.$queryRaw`
        SELECT user_id, SUM(points_earned)::int as total
        FROM point_history
        GROUP BY user_id
    `

    let updatedUsers = 0
    for (const row of pointSums) {
        await prisma.userPoints.update({
            where: { user_id: row.user_id },
            data: { total_points: row.total }
        })
        updatedUsers++
    }

    console.log(`Recalculated total_points for ${updatedUsers} users`)

    // Verify final distribution
    const finalDistribution = await prisma.$queryRaw`
        SELECT points_earned, COUNT(*)::int as count
        FROM point_history
        GROUP BY points_earned
        ORDER BY points_earned
    `
    console.log('\nFinal point distribution:')
    console.table(finalDistribution)

    console.log('\nPoint normalization complete!')
}

normalizePoints()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
