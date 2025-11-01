#!/usr/bin/env node
const { spawn } = require('child_process');

const port = process.env.PORT || '3000';
const nextProcess = spawn('next', ['start', '-p', port], {
  stdio: 'inherit',
  env: process.env
});

nextProcess.on('exit', (code) => {
  process.exit(code || 0);
});

process.on('SIGTERM', () => {
  nextProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  nextProcess.kill('SIGINT');
});
