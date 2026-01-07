const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function updateSessionStats() {
  const sessionId = BigInt(320);

  console.log(`\nUpdating stats for session ${sessionId}...\n`);

  // Count total messages
  const totalMessages = await (db).chatMessage.count({
    where: { stream_session_id: sessionId }
  });

  // Count unique chatters
  const uniqueChatters = await (db).chatMessage.groupBy({
    by: ['sender_user_id'],
    where: {
      stream_session_id: sessionId,
      sender_user_id: { gt: BigInt(0) }
    }
  });

  // Get total sweet coins earned
  const coinsResult = await (db).sweetCoinHistory.aggregate({
    where: { stream_session_id: sessionId },
    _sum: { sweet_coins_earned: true }
  });

  // Get peak viewer count from session
  const session = await (db).streamSession.findUnique({
    where: { id: sessionId },
    select: {
      started_at: true,
      peak_viewer_count: true,
      session_title: true
    }
  });

  // Calculate duration from start until now (stream is live)
  const now = new Date();
  const durationSeconds = Math.floor((now.getTime() - session.started_at.getTime()) / 1000);
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);

  // Update the session
  await (db).streamSession.update({
    where: { id: sessionId },
    data: {
      total_messages: totalMessages,
      last_live_check_at: now,
      updated_at: now,
    }
  });

  console.log('=== Session 320 Stats ===\n');
  console.log(`Title: ${session.session_title}`);
  console.log(`Started: ${session.started_at.toISOString()}`);
  console.log(`Duration: ${hours}h ${minutes}m (and counting...)`);
  console.log(`Total Messages: ${totalMessages.toLocaleString()}`);
  console.log(`Unique Chatters: ${uniqueChatters.length.toLocaleString()}`);
  console.log(`Sweet Coins Earned: ${(coinsResult._sum.sweet_coins_earned || 0).toLocaleString()}`);
  console.log(`Peak Viewers: ${session.peak_viewer_count}`);
  console.log(`\n✅ Session 320 is ACTIVE and tracking!`);

  await (db).$disconnect();
}

updateSessionStats().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
