import { db } from '../lib/db';

async function fixOrphanJobs() {
  console.log('Finding all existing session IDs...');

  // Get all existing session IDs
  const existingSessions = await (db as any).streamSession.findMany({
    select: { id: true }
  });
  const existingIds = new Set((existingSessions as any[]).map((s: any) => s.id.toString()));
  console.log(`Found ${existingIds.size} existing sessions`);

  // Get all pending/failed jobs
  console.log('\nFetching pending/failed jobs...');
  const jobs = await (db as any).chatJob.findMany({
    where: {
      status: { in: ['pending', 'failed'] }
    },
    select: {
      id: true,
      payload: true,
      stream_session_id: true
    }
  });

  console.log(`Found ${jobs.length} jobs to check`);

  let fixedCount = 0;
  let batchSize = 100;
  let batch: { id: bigint; payload: any }[] = [];

  for (const job of jobs) {
    const payload = job.payload as any;
    const payloadSessionId = payload?.stream_session_id?.toString();

    // Check if payload has a session ID that doesn't exist
    if (payloadSessionId && !existingIds.has(payloadSessionId)) {
      // Create updated payload with null session ID
      const updatedPayload = {
        ...payload,
        stream_session_id: null,
        is_stream_active: false
      };

      batch.push({ id: job.id, payload: updatedPayload });

      // Process in batches
      if (batch.length >= batchSize) {
        await processBatch(batch);
        fixedCount += batch.length;
        console.log(`Fixed ${fixedCount} jobs so far...`);
        batch = [];
      }
    }
  }

  // Process remaining batch
  if (batch.length > 0) {
    await processBatch(batch);
    fixedCount += batch.length;
  }

  console.log(`\nTotal fixed: ${fixedCount} jobs`);

  await (db as any).$disconnect();
}

async function processBatch(batch: { id: bigint; payload: any }[]) {
  // Update each job individually (Prisma doesn't support bulk JSON updates easily)
  await Promise.all(batch.map(job =>
    (db as any).chatJob.update({
      where: { id: job.id },
      data: {
        payload: job.payload,
        stream_session_id: null,
        status: 'pending',
        attempts: 0,
        last_error: null
      }
    })
  ));
}

fixOrphanJobs().catch(console.error);
