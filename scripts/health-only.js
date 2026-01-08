#!/usr/bin/env node

// Minimal health check server for debugging
const http = require('http');
const port = parseInt(process.env.PORT || '3000', 10);

console.log('Starting minimal health server on port', port);

const server = http.createServer((req, res) => {
  console.log('Request:', req.method, req.url);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', port: port }));
});

server.listen(port, '0.0.0.0', () => {
  console.log('Health server listening on 0.0.0.0:' + port);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
