import { db } from '../lib/db';

async function check() {
  // Get distinct session IDs from pending jobs
  const jobs = await (db as any).chatJob.findMany({
    where: { status: 'pending' },
    select: { stream_session_id: true },
    distinct: ['stream_session_id'],
    take: 10
  });

  console.log('Session IDs in pending jobs:', (jobs as any[]).map((j: any) => j.stream_session_id?.toString()));

  // Check if these sessions exist
  for (const job of jobs) {
    if (job.stream_session_id) {
      const session = await (db as any).streamSession.findUnique({
        where: { id: job.stream_session_id },
        select: { id: true, ended_at: true }
      });
      console.log('Session', job.stream_session_id.toString(), session ? 'EXISTS' : 'MISSING');
    }
  }

  // Count jobs by status
  const pending = await (db as any).chatJob.count({ where: { status: 'pending' } });
  const failed = await (db as any).chatJob.count({ where: { status: 'failed' } });
  console.log('\nJob counts: pending=', pending, ', failed=', failed);

  await (db as any).$disconnect();
}

check().catch(console.error);
