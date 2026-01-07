const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function mergeSessions() {
  const targetSessionId = BigInt(320); // The active session
  const sessionsToMerge = [BigInt(317), BigInt(318), BigInt(319)]; // Sessions to merge in

  console.log(`\nMerging sessions ${sessionsToMerge.join(', ')} into session ${targetSessionId}...\n`);

  // Get target session
  const target = await (db).streamSession.findUnique({
    where: { id: targetSessionId },
    select: { id: true, started_at: true, ended_at: true }
  });

  if (!target) {
    console.error('Target session not found!');
    process.exit(1);
  }

  // Get earliest start time from all sessions
  const allSessions = await (db).streamSession.findMany({
    where: { id: { in: [targetSessionId, ...sessionsToMerge] } },
    select: { id: true, started_at: true, total_messages: true }
  });

  const earliestStart = allSessions.reduce((earliest, s) => {
    return s.started_at < earliest ? s.started_at : earliest;
  }, allSessions[0].started_at);

  console.log(`Earliest start time: ${earliestStart.toISOString()}`);

  // Move all related records
  for (const sourceId of sessionsToMerge) {
    console.log(`\nProcessing session ${sourceId}...`);

    // Move chat messages
    const chatResult = await (db).chatMessage.updateMany({
      where: { stream_session_id: sourceId },
      data: { stream_session_id: targetSessionId },
    });
    console.log(`  Moved ${chatResult.count} chat messages`);

    // Move sweet coin history
    const coinResult = await (db).sweetCoinHistory.updateMany({
      where: { stream_session_id: sourceId },
      data: { stream_session_id: targetSessionId },
    });
    console.log(`  Moved ${coinResult.count} sweet coin records`);

    // Move award jobs
    const awardResult = await (db).sweetCoinAwardJob.updateMany({
      where: { stream_session_id: sourceId },
      data: { stream_session_id: targetSessionId },
    });
    console.log(`  Moved ${awardResult.count} award jobs`);

    // Move chat jobs
    const chatJobResult = await (db).chatJob.updateMany({
      where: { stream_session_id: sourceId },
      data: { stream_session_id: targetSessionId },
    });
    console.log(`  Moved ${chatJobResult.count} chat jobs`);

    // Delete the merged session
    await (db).streamSession.delete({ where: { id: sourceId } });
    console.log(`  Deleted session ${sourceId}`);
  }

  // Update target session with merged data
  const totalMessages = await (db).chatMessage.count({
    where: { stream_session_id: targetSessionId }
  });

  const peakViewers = Math.max(...allSessions.map(s => s.peak_viewer_count || 0), 0);

  await (db).streamSession.update({
    where: { id: targetSessionId },
    data: {
      started_at: earliestStart,
      last_live_check_at: new Date(),
      total_messages: totalMessages,
      updated_at: new Date(),
    }
  });

  console.log(`\n✅ Merge complete!`);
  console.log(`Session ${targetSessionId} now has ${totalMessages} messages`);
  console.log(`Started at: ${earliestStart.toISOString()}`);

  await (db).$disconnect();
}

mergeSessions().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
