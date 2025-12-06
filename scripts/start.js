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
    
    const port = process.env.PORT || '3000';
    
    // Add node_modules/.bin to PATH so 'next' command is found
    const binPath = path.join(process.cwd(), 'node_modules', '.bin');
    const envWithPath = {
      ...process.env,
      PATH: `${binPath}:${process.env.PATH || ''}`
    };

    process.stdout.write('🚀 Starting Next.js on port ' + port + '...\n');
    process.stdout.write('📂 PATH includes: ' + binPath + '\n');
    
    // Use sh -c which works reliably in the container
    const nextProcess = spawn('sh', ['-c', `next start -p ${port}`], {
      stdio: 'inherit',
      env: envWithPath
    });

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
