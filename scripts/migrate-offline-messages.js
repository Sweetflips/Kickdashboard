const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function migrateOfflineMessages() {
    try {
        console.log('🔄 Starting migration of offline messages to separate table...')
        console.log('')

        // Step 1: Count existing offline messages
        const offlineMessageCount = await prisma.chatMessage.count({
            where: {
                sent_when_offline: true,
            },
        })

        console.log(`📊 Found ${offlineMessageCount} offline messages to migrate`)
        console.log('')

        if (offlineMessageCount === 0) {
            console.log('✅ No offline messages to migrate. Exiting.')
            await prisma.$disconnect()
            return
        }

        // Step 2: Fetch all offline messages in batches
        const batchSize = 1000
        let offset = 0
        let totalMigrated = 0

        while (offset < offlineMessageCount) {
            console.log(`📦 Processing batch ${Math.floor(offset / batchSize) + 1}...`)

            const offlineMessages = await prisma.chatMessage.findMany({
                where: {
                    sent_when_offline: true,
                },
                take: batchSize,
                skip: offset,
                select: {
                    message_id: true,
                    sender_user_id: true,
                    sender_username: true,
                    broadcaster_user_id: true,
                    content: true,
                    emotes: true,
                    timestamp: true,
                    sender_username_color: true,
                    sender_badges: true,
                    sender_is_verified: true,
                    sender_is_anonymous: true,
                    created_at: true,
                },
            })

            if (offlineMessages.length === 0) {
                break
            }

            // Step 3: Insert into offline_chat_messages table
            for (const msg of offlineMessages) {
                try {
                    await prisma.offlineChatMessage.upsert({
                        where: { message_id: msg.message_id },
                        update: {
                            sender_username: msg.sender_username,
                            content: msg.content,
                            emotes: msg.emotes,
                            timestamp: msg.timestamp,
                            sender_username_color: msg.sender_username_color,
                            sender_badges: msg.sender_badges,
                            sender_is_verified: msg.sender_is_verified,
                            sender_is_anonymous: msg.sender_is_anonymous,
                        },
                        create: {
                            message_id: msg.message_id,
                            sender_user_id: msg.sender_user_id,
                            sender_username: msg.sender_username,
                            broadcaster_user_id: msg.broadcaster_user_id,
                            content: msg.content,
                            emotes: msg.emotes,
                            timestamp: msg.timestamp,
                            sender_username_color: msg.sender_username_color,
                            sender_badges: msg.sender_badges,
                            sender_is_verified: msg.sender_is_verified,
                            sender_is_anonymous: msg.sender_is_anonymous,
                            created_at: msg.created_at,
                        },
                    })
                    totalMigrated++
                } catch (error) {
                    console.error(`❌ Error migrating message ${msg.message_id}:`, error.message)
                }
            }

            offset += batchSize
            console.log(`   Migrated ${totalMigrated} messages so far...`)
        }

        console.log('')
        console.log('✅ Migration completed successfully!')
        console.log(`📊 Total messages migrated: ${totalMigrated}`)
        console.log('')

        // Step 4: Verify migration
        const migratedCount = await prisma.offlineChatMessage.count()
        console.log(`🔍 Verification: ${migratedCount} messages in offline_chat_messages table`)
        console.log('')

        // Step 5: Optional - Delete migrated messages from chat_messages
        // Uncomment the following lines if you want to remove migrated messages from chat_messages
        /*
        console.log('🗑️  Deleting migrated messages from chat_messages table...')
        const deleteResult = await prisma.chatMessage.deleteMany({
            where: {
                sent_when_offline: true,
            },
        })
        console.log(`   Deleted ${deleteResult.count} messages from chat_messages`)
        console.log('')
        */

        console.log('⚠️  Note: Migrated messages are still in chat_messages table.')
        console.log('   You can delete them later if desired by uncommenting the delete code in the script.')
        console.log('')
        console.log('✅ Migration script completed!')
        console.log('   Next steps:')
        console.log('   1. Run: npx prisma generate (if needed)')
        console.log('   2. Restart your application')
        console.log('   3. Verify offline messages appear correctly in the dashboard')

    } catch (error) {
        console.error('❌ Migration failed:', error)
        console.error('Error details:', error.message)
        if (error.stack) {
            console.error('Stack trace:', error.stack)
        }
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

migrateOfflineMessages()
