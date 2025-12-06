#!/usr/bin/env node
const { spawn, exec } = require('child_process');
const path = require('path');

console.log('🔧 start.js loaded');
console.log('📍 CWD:', process.cwd());
console.log('📍 PORT:', process.env.PORT);
console.log('📍 RUN_AS_WORKER:', process.env.RUN_AS_WORKER);

// Check if this should run as worker instead of web server
if (process.env.RUN_AS_WORKER === 'true') {
  console.log('🔧 RUN_AS_WORKER=true, starting worker mode...');
  require('./start-worker.js');
  // Worker script handles its own lifecycle, don't continue
} else {
  // Web server mode
  startWebServer();
}

function startWebServer() {
  const port = process.env.PORT || '3000';
  
  // Add node_modules/.bin to PATH so 'next' command is found
  // This is critical - npm does this automatically but we need to do it manually
  const binPath = path.join(process.cwd(), 'node_modules', '.bin');
  const envWithPath = {
    ...process.env,
    PATH: `${binPath}:${process.env.PATH || ''}`
  };

  console.log('🚀 Starting Next.js server on port ' + port + '...');
  console.log('📂 Adding to PATH: ' + binPath);
  
  // Use sh -c which works reliably in the container
  const nextProcess = spawn('sh', ['-c', `next start -p ${port}`], {
    stdio: 'inherit',
    env: envWithPath
  });

  // Handle process exits
  nextProcess.on('exit', (code) => {
    console.log('⚠️ Next.js exited with code:', code);
    process.exit(code || 0);
  });

  nextProcess.on('error', (err) => {
    console.error('❌ Failed to start Next.js:', err.message, err.code);
    process.exit(1);
  });

  // Handle graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    nextProcess.kill(signal);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Run migrations in background (non-blocking) after 5 seconds
  setTimeout(() => {
    console.log('🔄 Running background migrations...');
    
    exec('prisma migrate deploy', { env: envWithPath, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('⚠️ Background migration failed (non-critical):', error.message);
      } else {
        console.log('✅ Background migrations completed');
      }
    });
  }, 5000);
}
