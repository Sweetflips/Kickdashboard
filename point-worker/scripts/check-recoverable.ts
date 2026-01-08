import { db } from '../lib/db';

async function checkRecoverable() {
  // Count jobs by session status
  const withSession = await (db as any).chatJob.count({
    where: { 
      status: 'pending',
      stream_session_id: { not: null }
    }
  });
  
  const withoutSession = await (db as any).chatJob.count({
    where: { 
      status: 'pending',
      stream_session_id: null
    }
  });
  
  console.log('Pending jobs with valid session (WILL earn coins):', withSession);
  console.log('Pending jobs without session (saved as offline, NO coins):', withoutSession);
  
  // Check which sessions the valid jobs belong to
  const sessionBreakdown = await (db as any).chatJob.groupBy({
    by: ['stream_session_id'],
    where: { 
      status: 'pending',
      stream_session_id: { not: null }
    },
    _count: true
  });
  
  console.log('\nBreakdown by session:');
  for (const s of sessionBreakdown) {
    const sessionId = (s as any).stream_session_id as bigint | null;
    if (!sessionId) continue;
    const session = await (db as any).streamSession.findUnique({
      where: { id: sessionId },
      select: { id: true, started_at: true, ended_at: true, session_title: true }
    });
    console.log(`  Session ${sessionId}: ${(s as any)._count} jobs`);
    if (session) {
      console.log(`    Title: ${session.session_title || 'N/A'}`);
      console.log(`    Started: ${session.started_at.toISOString()}`);
      console.log(`    Ended: ${session.ended_at?.toISOString() || 'ACTIVE'}`);
    }
  }
  
  // Check current active session
  const activeSession = await (db as any).streamSession.findFirst({
    where: { ended_at: null },
    orderBy: { started_at: 'desc' }
  });
  
  if (activeSession) {
    console.log('\nCurrent active session:', activeSession.id.toString());
    console.log('  Started:', activeSession.started_at.toISOString());
  }
  
  await (db as any).$disconnect();
}

checkRecoverable().catch(console.error);


