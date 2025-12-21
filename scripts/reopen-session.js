const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function reopenSession() {
  const sessionId = process.argv[2] || '319';

  console.log(`Reopening session ${sessionId}...`);

  // Reopen the session
  const result = await db.streamSession.update({
    where: { id: BigInt(sessionId) },
    data: {
      ended_at: null,
      duration_seconds: null,
      last_live_check_at: new Date(),
      updated_at: new Date(),
    },
  });

  console.log(`✅ Reopened session ${sessionId}`);

  // Check current state
  const active = await db.streamSession.findFirst({
    where: { ended_at: null },
    select: { id: true, session_title: true, started_at: true }
  });

  console.log('Active session:', active ? {
    id: active.id.toString(),
    title: active.session_title,
    started: active.started_at.toISOString()
  } : 'None');

  await db.$disconnect();
}

reopenSession().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
