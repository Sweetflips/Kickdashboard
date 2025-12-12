#!/usr/bin/env node

// Force immediate output
process.stdout.write('🔧 start.js: Script starting...\n');

try {
  const { spawn, exec } = require('child_process');
  const path = require('path');

  process.stdout.write('🔧 start.js: Modules loaded\n');
  process.stdout.write('📍 CWD: ' + process.cwd() + '\n');
  process.stdout.write('📍 PORT: ' + process.env.PORT + '\n');
  process.stdout.write('📍 RUN_AS_WORKER: ' + process.env.RUN_AS_WORKER + '\n');

  // Check if this should run as worker instead of web server
  if (process.env.RUN_AS_WORKER === 'true') {
    process.stdout.write('🔧 RUN_AS_WORKER=true, starting worker mode...\n');
    require('./start-worker.js');
  } else {
    startWebServer();
  }
} catch (err) {
  process.stdout.write('❌ FATAL ERROR: ' + err.message + '\n');
  process.stdout.write('❌ Stack: ' + err.stack + '\n');
  process.exit(1);
}

function startWebServer() {
  try {
    const { spawn, exec } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    const port = process.env.PORT || '3000';
    const hostname = process.env.HOSTNAME || '0.0.0.0';

    // Add node_modules/.bin to PATH so 'next' command is found
    const binPath = path.join(process.cwd(), 'node_modules', '.bin');
    const envWithPath = {
      ...process.env,
      PATH: `${binPath}:${process.env.PATH || ''}`
    };

    process.stdout.write('🚀 Starting Next.js on port ' + port + '...\n');
    process.stdout.write('📂 PATH includes: ' + binPath + '\n');

    // Prefer standalone server output when present.
    // This avoids "Failed to find Server Action" issues that happen when deploying only standalone artifacts
    // but starting with `next start` (which expects .next/server/server-reference-manifest.json in the root build).
    const rootStandaloneServer = path.join(process.cwd(), 'server.js');
    const nextStandaloneServer = path.join(process.cwd(), '.next', 'standalone', 'server.js');

    const spawnNode = (args, extraEnv = {}) =>
      spawn(process.execPath, args, {
        stdio: 'inherit',
        env: { ...envWithPath, ...extraEnv },
        cwd: process.cwd(),
      });

    let nextProcess = null;

    if (fs.existsSync(rootStandaloneServer)) {
      process.stdout.write('🚀 Using standalone server (server.js)\n');
      nextProcess = spawnNode(['server.js'], { PORT: port, HOSTNAME: hostname });
    } else if (fs.existsSync(nextStandaloneServer)) {
      process.stdout.write('🚀 Using standalone server (.next/standalone/server.js)\n');
      nextProcess = spawnNode([path.join('.next', 'standalone', 'server.js')], { PORT: port, HOSTNAME: hostname });
    } else {
      // Fallback to `next start` (works when the full `.next` directory is present).
      // Use sh -c which works reliably in Linux containers.
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        // Windows fallback: run the local next binary directly.
        const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next.cmd');
        nextProcess = spawn(nextBin, ['start', '-H', hostname, '-p', port], {
          stdio: 'inherit',
          env: { ...envWithPath, HOSTNAME: hostname },
          cwd: process.cwd(),
        });
      } else {
        nextProcess = spawn('sh', ['-c', `next start -H ${hostname} -p ${port}`], {
          stdio: 'inherit',
          env: {
            ...envWithPath,
            HOSTNAME: hostname,
          },
          cwd: process.cwd(),
        });
      }
    }

    if (!nextProcess) {
      throw new Error('Failed to start Next.js (no start command selected)');
    }

    nextProcess.on('exit', (code) => {
      process.stdout.write('⚠️ Next.js exited with code: ' + code + '\n');
      process.exit(code || 0);
    });

    nextProcess.on('error', (err) => {
      process.stdout.write('❌ Spawn error: ' + err.message + '\n');
      process.exit(1);
    });

    // Handle graceful shutdown
    const shutdown = (signal) => {
      process.stdout.write('\n' + signal + ' received, shutting down...\n');
      nextProcess.kill(signal);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Run migrations in background after 5 seconds
    setTimeout(() => {
      process.stdout.write('🔄 Running background migrations...\n');
      exec('prisma migrate deploy', { env: envWithPath, timeout: 30000 }, (error) => {
        if (error) {
          process.stdout.write('⚠️ Migration failed: ' + error.message + '\n');
        } else {
          process.stdout.write('✅ Migrations completed\n');
        }
      });
    }, 5000);

  } catch (err) {
    process.stdout.write('❌ startWebServer error: ' + err.message + '\n');
    process.exit(1);
  }
}
