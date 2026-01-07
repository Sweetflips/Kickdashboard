import { db } from '../lib/db';

async function fixOrphanJobs() {
  console.log('Finding jobs with orphaned session IDs...');

  // Get all distinct session IDs from pending/failed jobs
  const jobs = await (db as any).chatJob.findMany({
    where: {
      status: { in: ['pending', 'failed'] },
      stream_session_id: { not: null }
    },
    select: { stream_session_id: true },
    distinct: ['stream_session_id'],
  });

  const sessionIds = jobs.map((j: any) => j.stream_session_id!).filter(Boolean);
  console.log(`Found ${sessionIds.length} unique session IDs in jobs`);

  // Check which sessions exist
  const existingSessions = await (db as any).streamSession.findMany({
    where: { id: { in: sessionIds } },
    select: { id: true }
  });

  const existingIds = new Set(existingSessions.map((s: any) => s.id.toString()));
  const missingIds = sessionIds.filter((id: any) => !existingIds.has(id.toString()));

  console.log(`Existing sessions: ${existingSessions.length}`);
  console.log(`Missing sessions: ${missingIds.length}`);
  console.log('Missing IDs:', missingIds.map((id: any) => id.toString()));

  if (missingIds.length === 0) {
    console.log('No orphaned jobs to fix!');
    await (db as any).$disconnect();
    return;
  }

  // Update jobs with missing sessions to have NULL stream_session_id
  // This will make them be treated as offline messages
  console.log('\nUpdating jobs with missing sessions to NULL...');

  const result = await (db as any).chatJob.updateMany({
    where: {
      stream_session_id: { in: missingIds },
      status: { in: ['pending', 'failed'] }
    },
    data: {
      stream_session_id: null,
      status: 'pending', // Reset failed jobs to pending
      attempts: 0,
      last_error: null,
    }
  });

  console.log(`Updated ${result.count} jobs`);

  // Verify
  const remainingOrphans = await (db as any).chatJob.count({
    where: {
      stream_session_id: { in: missingIds },
      status: { in: ['pending', 'failed'] }
    }
  });

  console.log(`Remaining orphaned jobs: ${remainingOrphans}`);

  await (db as any).$disconnect();
}

fixOrphanJobs().catch(console.error);
