const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function touchSession() {
  const sessionId = BigInt(320);

  // Update the session to mark it as recently checked (active)
  await db.streamSession.update({
    where: { id: sessionId },
    data: {
      last_live_check_at: new Date(),
      updated_at: new Date(),
    }
  });

  console.log(`✅ Session 320 touched at ${new Date().toISOString()}`);

  // Verify it's still the active session
  const session = await db.streamSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      ended_at: true,
      last_live_check_at: true,
      total_messages: true,
      session_title: true,
    }
  });

  console.log(`\nSession 320:`);
  console.log(`  Status: ${session.ended_at ? '🔴 ENDED' : '🟢 ACTIVE'}`);
  console.log(`  Last check: ${session.last_live_check_at.toISOString()}`);
  console.log(`  Messages: ${session.total_messages}`);

  await db.$disconnect();
}

touchSession().catch(console.error);
