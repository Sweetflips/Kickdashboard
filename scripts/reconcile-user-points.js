#!/usr/bin/env node
/**
 * Reconcile user_points table with point_history
 * This script recomputes total_points from point_history as ground truth
 * Idempotent - safe to run multiple times
 *
 * Usage: node scripts/reconcile-user-points.js [--dry-run]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function reconcileUserPoints() {
    try {
        console.log('🔄 Starting user_points reconciliation...');
        if (DRY_RUN) {
            console.log('⚠️ DRY RUN MODE - no changes will be made');
        }

        // Get all users with point history
        const usersWithHistory = await prisma.pointHistory.groupBy({
            by: ['user_id'],
            _sum: {
                points_earned: true,
            },
        });

        console.log(`📊 Found ${usersWithHistory.length} users with point history`);

        let updated = 0;
        let created = 0;
        let unchanged = 0;
        let errors = 0;

        // Process in batches to avoid memory issues
        const BATCH_SIZE = 100;
        for (let i = 0; i < usersWithHistory.length; i += BATCH_SIZE) {
            const batch = usersWithHistory.slice(i, i + BATCH_SIZE);

            await Promise.all(
                batch.map(async (agg) => {
                    const userId = agg.user_id;
                    const calculatedTotal = agg._sum.points_earned || 0;

                    try {
                        // Get current user_points record
                        const currentPoints = await prisma.userPoints.findUnique({
                            where: { user_id: userId },
                            select: { total_points: true },
                        });

                        if (!currentPoints) {
                            // Create if doesn't exist
                            if (!DRY_RUN) {
                                await prisma.userPoints.create({
                                    data: {
                                        user_id: userId,
                                        total_points: calculatedTotal,
                                        total_emotes: 0,
                                    },
                                });
                            }
                            created++;
                            console.log(`✅ Created user_points for user_id=${userId}, total=${calculatedTotal}`);
                        } else if (currentPoints.total_points !== calculatedTotal) {
                            // Update if mismatch
                            if (!DRY_RUN) {
                                await prisma.userPoints.update({
                                    where: { user_id: userId },
                                    data: {
                                        total_points: calculatedTotal,
                                    },
                                });
                            }
                            updated++;
                            console.log(
                                `🔧 Fixed user_id=${userId}: ${currentPoints.total_points} → ${calculatedTotal} (diff: ${calculatedTotal - currentPoints.total_points})`
                            );
                        } else {
                            unchanged++;
                        }
                    } catch (error) {
                        errors++;
                        console.error(`❌ Error processing user_id=${userId}:`, error.message);
                    }
                })
            );
        }

        // Handle users with user_points but no point_history (should be 0, but handle gracefully)
        const allUserPoints = await prisma.userPoints.findMany({
            select: { user_id: true, total_points: true },
        });

        const usersWithHistoryIds = new Set(usersWithHistory.map((agg) => Number(agg.user_id)));
        const orphanedPoints = allUserPoints.filter((up) => !usersWithHistoryIds.has(Number(up.user_id)));

        if (orphanedPoints.length > 0) {
            console.log(`⚠️ Found ${orphanedPoints.length} user_points records with no point_history`);
            // Don't delete them - they might have emotes or be legitimate zero-point users
            // Just log for visibility
        }

        console.log('\n📈 Reconciliation Summary:');
        console.log(`  Created: ${created}`);
        console.log(`  Updated: ${updated}`);
        console.log(`  Unchanged: ${unchanged}`);
        console.log(`  Errors: ${errors}`);
        console.log(`  Orphaned user_points: ${orphanedPoints.length}`);

        if (DRY_RUN) {
            console.log('\n⚠️ DRY RUN - no changes were made. Run without --dry-run to apply changes.');
        } else {
            console.log('\n✅ Reconciliation complete');
        }
    } catch (error) {
        console.error('❌ Reconciliation failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

reconcileUserPoints();







