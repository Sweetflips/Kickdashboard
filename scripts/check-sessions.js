const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function checkSessions() {
  // Get all recent sessions
  const sessions = await db.streamSession.findMany({
    orderBy: { id: 'desc' },
    take: 10,
    select: {
      id: true,
      session_title: true,
      started_at: true,
      ended_at: true,
      duration_seconds: true,
      total_messages: true,
      last_live_check_at: true,
    }
  });

  console.log('\n=== Recent Sessions ===\n');

  for (const s of sessions) {
    const isActive = s.ended_at === null;
    console.log(`Session ${s.id.toString()}: ${isActive ? '🟢 ACTIVE' : '🔴 ENDED'}`);
    console.log(`  Title: ${s.session_title || 'N/A'}`);
    console.log(`  Started: ${s.started_at.toISOString()}`);
    console.log(`  Ended: ${s.ended_at?.toISOString() || 'N/A'}`);
    console.log(`  Duration: ${s.duration_seconds || 0}s`);
    console.log(`  Messages: ${s.total_messages}`);
    console.log(`  Last check: ${s.last_live_check_at?.toISOString() || 'N/A'}`);
    console.log('');
  }

  // Check for active session
  const active = await db.streamSession.findFirst({
    where: { ended_at: null }
  });

  if (active) {
    console.log(`\n✅ Active session: ${active.id.toString()}`);
  } else {
    console.log('\n❌ No active session found');
  }

  await db.$disconnect();
}

checkSessions().catch(console.error);
