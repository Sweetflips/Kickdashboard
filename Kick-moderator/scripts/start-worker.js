#!/usr/bin/env node

// Start HTTP health check server IMMEDIATELY (before ANY other code)
// This ensures Railway can verify the service is up within seconds
const http = require('http');
const { exec, spawn } = require('child_process');
const path = require('path');

// Use port 3000 as default to match Next.js and Railway conventions
const port = parseInt(process.env.PORT || '3000', 10);

console.log(`🔧 Worker starting, PORT=${port}`);

// Prepare environment with node_modules/.bin in PATH
const binPath = path.join(process.cwd(), 'node_modules', '.bin');
const envWithPath = {
  ...process.env,
  PATH: `${binPath}:${process.env.PATH || ''}`
};

const healthServer = http.createServer((req, res) => {
  // Support both /health and /api/health for Railway compatibility
  // Use a more flexible check for the URL
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/health' || url === '/api/health' || url === '/healthz') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'worker',
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Bind to 0.0.0.0 to ensure it's accessible from outside the container
healthServer.listen(port, '0.0.0.0', () => {
  console.log(`✅ Health check server listening on 0.0.0.0:${port}`);
});

// Handle server errors
healthServer.on('error', (err) => {
  console.error('⚠️ Health check server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
  }
  process.exit(1);
});

// Start other initialization
(async () => {
  try {
    const { PrismaClient } = require('@prisma/client');

    // Run migrations asynchronously to not block the event loop
    console.log('🔄 Scheduling database migrations...');
    setTimeout(() => {
      console.log('🔄 Running database migrations...');
      exec('npx prisma migrate deploy', { env: envWithPath }, (error, stdout, stderr) => {
        if (error) {
          console.error('⚠️ Migration failed:', error.message);
          if (stderr) console.error(stderr);
        } else {
          console.log('✅ Migrations completed');
          if (stdout) console.log(stdout);
        }
      });
    }, 2000); // 2 second delay to let health server settle

    // Wait for database to be reachable with retries
    async function waitForDatabase(maxRetries = 15, delayMs = 2000) {
      const prisma = new PrismaClient();
      for (let i = 0; i < maxRetries; i++) {
        try {
          await prisma.$queryRaw`SELECT 1`;
          console.log('✅ Database connection established');
          await prisma.$disconnect();
          return true;
        } catch (error) {
          console.log(`⏳ Waiting for database... (attempt ${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      console.error('❌ Could not connect to database after retries');
      await prisma.$disconnect();
      return false;
    }

    // Safety net: Ensure required tables exist
    async function ensureTables() {
      const prisma = new PrismaClient();
      try {
        console.log('🔄 Verifying database tables...');

        // Check for chat_jobs table
        const chatJobsCheck = await prisma.$queryRaw`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'chat_jobs'
        `;

        if (Array.isArray(chatJobsCheck) && chatJobsCheck.length > 0) {
          console.log('✅ chat_jobs table exists');
        } else {
          console.log('⚠️ chat_jobs table missing, creating it...');
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "chat_jobs" (
              "id" BIGSERIAL NOT NULL,
              "message_id" TEXT NOT NULL,
              "payload" JSONB NOT NULL,
              "sender_user_id" BIGINT NOT NULL,
              "broadcaster_user_id" BIGINT NOT NULL,
              "stream_session_id" BIGINT,
              "status" TEXT NOT NULL DEFAULT 'pending',
              "attempts" INTEGER NOT NULL DEFAULT 0,
              "locked_at" TIMESTAMP(3),
              "processed_at" TIMESTAMP(3),
              "last_error" TEXT,
              "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "chat_jobs_pkey" PRIMARY KEY ("id")
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "chat_jobs_message_id_key" ON "chat_jobs"("message_id");
            CREATE INDEX IF NOT EXISTS "chat_jobs_status_created_at_idx" ON "chat_jobs"("status", "created_at");
            CREATE INDEX IF NOT EXISTS "chat_jobs_status_locked_at_idx" ON "chat_jobs"("status", "locked_at");
          `);
          console.log('✅ Created chat_jobs table');
        }

        // Also check point_award_jobs for backward compatibility
        const pointJobsCheck = await prisma.$queryRaw`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'point_award_jobs'
        `;

        if (Array.isArray(pointJobsCheck) && pointJobsCheck.length > 0) {
          console.log('✅ point_award_jobs table exists');
        }

      } catch (error) {
        console.error('⚠️ Table check failed (continuing anyway):', error.message);
      } finally {
        await prisma.$disconnect();
      }
    }

    // Wait for database to be reachable first
    const dbReady = await waitForDatabase();
    if (!dbReady) {
      console.error('❌ Database not reachable, exiting...');
      process.exit(1);
    }

    await ensureTables();

    // Check if this is a moderation-only service
    const moderationOnly = String(process.env.MODERATION_ONLY || '').toLowerCase() === 'true';

    if (moderationOnly) {
      // Moderation-only mode - only run moderation worker
      console.log('');
      console.log('========================================');
      console.log('🛡️ STARTING MODERATION WORKER');
      console.log('========================================');
      console.log('');
      console.log('📝 Moderation Worker: Starting (moderation only, no message/point processing)...');
      const moderationWorkerProcess = spawn('npx', ['tsx', 'scripts/moderation-worker.ts'], {
        stdio: 'inherit',
        env: envWithPath
      });

      console.log('');
      console.log('✅ Moderation worker spawned successfully');
      console.log('   Waiting for database connections...');
      console.log('');

      moderationWorkerProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`⚠️ Moderation worker exited with code ${code}`);
        }
        healthServer.close(() => {
          console.log('✅ Health check server closed');
          process.exit(code || 0);
        });
      });

      moderationWorkerProcess.on('error', (err) => {
        console.error('❌ Failed to start moderation worker:', err.message);
        healthServer.close();
        process.exit(1);
      });

      // Handle graceful shutdown
      const shutdown = (signal) => {
        console.log(`\n${signal} received, shutting down moderation worker...`);
        healthServer.close(() => {
          console.log('✅ Health check server closed');
        });
        moderationWorkerProcess.kill(signal);
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
      return;
    }

    // Normal mode - start all workers
    // Start chat worker (handles all writes: users, messages, points)
    console.log('');
    console.log('========================================');
    console.log('🚀 STARTING WORKERS');
    console.log('========================================');
    console.log('');
    console.log('📝 Chat Worker: Starting (handles users, messages, points)...');
    const chatWorkerProcess = spawn('npx', ['tsx', 'scripts/chat-worker.ts'], {
      stdio: 'inherit',
      env: envWithPath
    });

    // Session tracker (polling) is optional. For true event-driven tracking,
    // rely on Kick webhook events (livestream.status.updated).
    const sessionTrackerEnabled = String(process.env.SESSION_TRACKER_ENABLED || '').toLowerCase() === 'true';
    const sessionTrackerProcess = sessionTrackerEnabled
      ? spawn('npx', ['tsx', 'scripts/session-tracker.ts'], { stdio: 'inherit', env: envWithPath })
      : null;
    if (sessionTrackerEnabled) {
      console.log('📝 Session Tracker: Starting (polling fallback enabled)...');
    } else {
      console.log('📝 Session Tracker: Disabled (webhook-driven mode)');
    }

    // Start point worker (processes point_award_jobs queue)
    // NOTE: Currently idle - nothing enqueues to point_award_jobs anymore.
    // Chat-worker handles points inline. Keeping this worker for potential future use.
    console.log('📝 Point Worker: Starting (currently idle - no jobs enqueued)...');
    const pointWorkerProcess = spawn('npx', ['tsx', 'scripts/point-worker.ts'], {
      stdio: 'inherit',
      env: envWithPath
    });

    console.log('');
    console.log('✅ Workers spawned successfully');
    console.log('   Waiting for database connections...');
    console.log('');

    let chatWorkerExited = false;
    let sessionTrackerExited = !sessionTrackerEnabled;
    let pointWorkerExited = false;

    const checkExit = () => {
      if (chatWorkerExited && sessionTrackerExited && pointWorkerExited) {
        healthServer.close(() => {
          console.log('✅ Health check server closed');
          process.exit(0);
        });
      }
    };

    chatWorkerProcess.on('exit', (code) => {
      chatWorkerExited = true;
      if (code !== 0 && code !== null) {
        console.error(`⚠️ Chat worker exited with code ${code}`);
        // Don't exit immediately - let point worker continue
      }
      checkExit();
    });

    if (sessionTrackerProcess) {
      sessionTrackerProcess.on('exit', (code) => {
        sessionTrackerExited = true;
        if (code !== 0 && code !== null) {
          console.error(`⚠️ Session tracker exited with code ${code}`);
          // Don't exit immediately - let other workers continue
        }
        checkExit();
      });
    }

    pointWorkerProcess.on('exit', (code) => {
      pointWorkerExited = true;
      if (code !== 0 && code !== null) {
        console.error(`⚠️ Point worker exited with code ${code}`);
        // Don't exit immediately - let chat worker continue
      }
      checkExit();
    });

    chatWorkerProcess.on('error', (err) => {
      console.error('❌ Failed to start chat worker:', err.message);
      if (sessionTrackerProcess) sessionTrackerProcess.kill('SIGTERM');
      pointWorkerProcess.kill('SIGTERM');
      healthServer.close();
      process.exit(1);
    });

    if (sessionTrackerProcess) {
      sessionTrackerProcess.on('error', (err) => {
        console.error('❌ Failed to start session tracker:', err.message);
        chatWorkerProcess.kill('SIGTERM');
        pointWorkerProcess.kill('SIGTERM');
        healthServer.close();
        process.exit(1);
      });
    }

    pointWorkerProcess.on('error', (err) => {
      console.error('❌ Failed to start point worker:', err.message);
      chatWorkerProcess.kill('SIGTERM');
      if (sessionTrackerProcess) sessionTrackerProcess.kill('SIGTERM');
      healthServer.close();
      process.exit(1);
    });

    // Handle graceful shutdown
    const shutdown = (signal) => {
      console.log(`\n${signal} received, shutting down workers...`);
      healthServer.close(() => {
        console.log('✅ Health check server closed');
      });
      chatWorkerProcess.kill(signal);
      if (sessionTrackerProcess) sessionTrackerProcess.kill(signal);
      pointWorkerProcess.kill(signal);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('⚠️ Error starting workers:', err.message);
    process.exit(1);
  }
})();
