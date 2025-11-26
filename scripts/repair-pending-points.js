#!/usr/bin/env node
/**
 * Repair script: Re-enqueue chat messages with points_reason='pending'
 * that don't have a corresponding point_history record
 *
 * This script finds messages that were marked as pending but never processed,
 * and safely re-enqueues them using idempotent upsert.
 *
 * Usage: node scripts/repair-pending-points.js [--dry-run] [--limit=N]
 */

const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : null;

async function repairPendingPoints() {
    try {
        console.log('🔄 Starting repair of pending points...');
        if (DRY_RUN) {
            console.log('⚠️ DRY RUN MODE - no changes will be made');
        }
        if (LIMIT) {
            console.log(`📊 Processing limit: ${LIMIT} messages`);
        }

        // Find chat messages with points_reason='pending' and points_earned=0
        // that don't have a corresponding point_history record
        let pendingMessages;
        if (LIMIT) {
            pendingMessages = await prisma.$queryRaw`
                SELECT
                    cm.message_id,
                    cm.sender_user_id,
                    cm.broadcaster_user_id,
                    cm.stream_session_id,
                    cm.sender_badges,
                    cm.emotes,
                    cm.created_at
                FROM chat_messages cm
                LEFT JOIN point_history ph ON ph.message_id = cm.message_id
                WHERE cm.points_reason = 'pending'
                AND cm.points_earned = 0
                AND ph.id IS NULL
                AND cm.stream_session_id IS NOT NULL
                ORDER BY cm.created_at ASC
                LIMIT ${LIMIT}
            `;
        } else {
            pendingMessages = await prisma.$queryRaw`
                SELECT
                    cm.message_id,
                    cm.sender_user_id,
                    cm.broadcaster_user_id,
                    cm.stream_session_id,
                    cm.sender_badges,
                    cm.emotes,
                    cm.created_at
                FROM chat_messages cm
                LEFT JOIN point_history ph ON ph.message_id = cm.message_id
                WHERE cm.points_reason = 'pending'
                AND cm.points_earned = 0
                AND ph.id IS NULL
                AND cm.stream_session_id IS NOT NULL
                ORDER BY cm.created_at ASC
            `;
        }

        console.log(`📊 Found ${pendingMessages.length} messages to repair`);

        if (pendingMessages.length === 0) {
            console.log('✅ No messages need repair');
            return;
        }

        let enqueued = 0;
        let skipped = 0;
        let errors = 0;

        // Process in batches
        const BATCH_SIZE = 50;
        for (let i = 0; i < pendingMessages.length; i += BATCH_SIZE) {
            const batch = pendingMessages.slice(i, i + BATCH_SIZE);

            await Promise.all(
                batch.map(async (msg) => {
                    try {
                        // Check if job already exists (idempotent check)
                        const existingJob = await prisma.pointAwardJob.findUnique({
                            where: { message_id: msg.message_id },
                            select: { status: true },
                        });

                        if (existingJob) {
                            if (existingJob.status === 'completed') {
                                // Job already completed - update message to reflect this
                                const pointHistory = await prisma.pointHistory.findUnique({
                                    where: { message_id: msg.message_id },
                                    select: { points_earned: true },
                                });

                                if (pointHistory) {
                                    if (!DRY_RUN) {
                                        await prisma.chatMessage.update({
                                            where: { message_id: msg.message_id },
                                            data: {
                                                points_earned: pointHistory.points_earned,
                                                points_reason: pointHistory.points_earned > 0 ? null : 'Already processed',
                                            },
                                        });
                                    }
                                    console.log(
                                        `✅ Message ${msg.message_id} already processed (points: ${pointHistory.points_earned})`
                                    );
                                } else {
                                    // Job completed but no point_history - mark job as failed and re-enqueue
                                    if (!DRY_RUN) {
                                        await prisma.pointAwardJob.update({
                                            where: { message_id: msg.message_id },
                                            data: { status: 'pending' },
                                        });
                                    }
                                    console.log(`🔧 Re-enqueuing completed job without point_history: ${msg.message_id}`);
                                }
                            } else {
                                // Job exists but not completed - skip (will be processed by worker)
                                skipped++;
                                return;
                            }
                        }

                        // Enqueue the job using direct Prisma upsert (idempotent)
                        if (!DRY_RUN) {
                            await prisma.pointAwardJob.upsert({
                                where: { message_id: msg.message_id },
                                update: {
                                    kick_user_id: BigInt(msg.sender_user_id),
                                    stream_session_id: msg.stream_session_id ? BigInt(msg.stream_session_id) : null,
                                    badges: msg.sender_badges,
                                    emotes: msg.emotes,
                                    status: 'pending',
                                    updated_at: new Date(),
                                },
                                create: {
                                    kick_user_id: BigInt(msg.sender_user_id),
                                    stream_session_id: msg.stream_session_id ? BigInt(msg.stream_session_id) : null,
                                    message_id: msg.message_id,
                                    badges: msg.sender_badges,
                                    emotes: msg.emotes,
                                    status: 'pending',
                                },
                            });
                        }

                        enqueued++;
                        if (enqueued % 100 === 0) {
                            console.log(`📊 Progress: ${enqueued}/${pendingMessages.length} enqueued`);
                        }
                    } catch (error) {
                        errors++;
                        console.error(`❌ Error processing message_id=${msg.message_id}:`, error.message);
                    }
                })
            );
        }

        console.log('\n📈 Repair Summary:');
        console.log(`  Enqueued: ${enqueued}`);
        console.log(`  Skipped (already processing): ${skipped}`);
        console.log(`  Errors: ${errors}`);

        if (DRY_RUN) {
            console.log('\n⚠️ DRY RUN - no changes were made. Run without --dry-run to apply changes.');
        } else {
            console.log('\n✅ Repair complete - jobs have been enqueued for processing');
        }
    } catch (error) {
        console.error('❌ Repair failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

repairPendingPoints();
