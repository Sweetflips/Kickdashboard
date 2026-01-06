import { db } from '../lib/db';

async function checkPayload() {
  // Get a few pending jobs with their payloads
  const jobs = await db.chatJob.findMany({
    where: { status: 'pending' },
    select: { 
      id: true,
      stream_session_id: true,
      payload: true 
    },
    take: 5
  });
  
  for (const job of jobs) {
    const payload = job.payload as any;
    console.log('Job ID:', job.id.toString());
    console.log('  DB stream_session_id:', job.stream_session_id?.toString() || 'NULL');
    console.log('  Payload stream_session_id:', payload?.stream_session_id?.toString() || 'NULL');
    console.log('');
  }
  
  await db.$disconnect();
}

checkPayload().catch(console.error);

