const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function endSession(sessionId) {
    try {
        const session = await (db).streamSession.update({
            where: { id: BigInt(sessionId) },
            data: {
                ended_at: new Date(),
                updated_at: new Date()
            }
        });
        console.log(`✅ Session ${sessionId} ended at:`, session.ended_at.toISOString());
    } catch (error) {
        console.error('Error ending session:', error);
    } finally {
        await (db).$disconnect();
    }
}

const sessionId = process.argv[2];
if (!sessionId) {
    console.error('Usage: node end-session.js <sessionId>');
    process.exit(1);
}

endSession(sessionId);
