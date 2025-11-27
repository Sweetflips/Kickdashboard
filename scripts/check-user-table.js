const { PrismaClient } = require('@prisma/client')

// Use provided connection string or fall back to DATABASE_URL env var
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway'

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: databaseUrl,
        },
    },
})

async function checkUserTable() {
    try {
        console.log('Checking user table...\n')

        // Get total count
        const totalCount = await prisma.user.count()
        console.log(`Total users: ${totalCount}\n`)

        // Get sample users
        const users = await prisma.user.findMany({
            take: 10,
            orderBy: { created_at: 'desc' },
        })

        console.log('Sample users (last 10):')
        console.log('='.repeat(100))

        users.forEach((user, index) => {
            console.log(`\nUser ${index + 1}:`)
            console.log(`  ID: ${user.id}`)
            console.log(`  Kick User ID: ${user.kick_user_id}`)
            console.log(`  Username: ${user.username || 'NULL'}`)
            console.log(`  Email: ${user.email || 'NULL'}`)
            console.log(`  Profile Picture: ${user.profile_picture_url || 'NULL'}`)
            console.log(`  Access Token Encrypted: ${user.access_token_encrypted ? 'EXISTS' : 'NULL'}`)
            console.log(`  Refresh Token Encrypted: ${user.refresh_token_encrypted ? 'EXISTS' : 'NULL'}`)
            console.log(`  Kick Connected: ${user.kick_connected}`)
            console.log(`  Created At: ${user.created_at}`)
            console.log(`  Updated At: ${user.updated_at}`)
        })

        // Check for empty/null-like usernames
        const emptyUsernames = await prisma.user.count({
            where: {
                OR: [
                    { username: '' },
                    { username: 'Unknown' },
                ]
            },
        })

        console.log(`\n\nUsers with empty/Unknown username: ${emptyUsernames}`)

        // Check for users with no email
        const noEmail = await prisma.user.count({
            where: { email: null },
        })

        console.log(`Users with NULL email: ${noEmail}`)

        // Check for users with no profile picture
        const noProfilePic = await prisma.user.count({
            where: { profile_picture_url: null },
        })

        console.log(`Users with NULL profile_picture_url: ${noProfilePic}`)

        // Check for users with no tokens (using raw query since Prisma might not have regenerated)
        const usersWithTokens = await prisma.user.findMany({
            where: {
                OR: [
                    { access_token_encrypted: { not: null } },
                    { refresh_token_encrypted: { not: null } },
                ]
            },
            select: { id: true },
        })

        const noTokens = totalCount - usersWithTokens.length
        console.log(`Users with NULL tokens: ${noTokens}`)

        // Get statistics
        console.log('\n\nStatistics:')
        const stats = {
            total: totalCount,
            withEmail: await prisma.user.count({ where: { email: { not: null } } }),
            withProfilePic: await prisma.user.count({ where: { profile_picture_url: { not: null } } }),
            withTokens: await prisma.user.count({
                where: {
                    OR: [
                        { access_token_encrypted: { not: null } },
                        { refresh_token_encrypted: { not: null } },
                    ]
                }
            }),
            withBothTokens: await prisma.user.count({
                where: {
                    AND: [
                        { access_token_encrypted: { not: null } },
                        { refresh_token_encrypted: { not: null } },
                    ]
                }
            }),
        }

        console.log(`Total users: ${stats.total}`)
        console.log(`Users with email: ${stats.withEmail} (${((stats.withEmail / stats.total) * 100).toFixed(2)}%)`)
        console.log(`Users with profile picture: ${stats.withProfilePic} (${((stats.withProfilePic / stats.total) * 100).toFixed(2)}%)`)
        console.log(`Users with at least one token: ${stats.withTokens} (${((stats.withTokens / stats.total) * 100).toFixed(2)}%)`)
        console.log(`Users with both tokens: ${stats.withBothTokens} (${((stats.withBothTokens / stats.total) * 100).toFixed(2)}%)`)

    } catch (error) {
        console.error('Error checking user table:', error)
    } finally {
        await prisma.$disconnect()
    }
}

checkUserTable()
