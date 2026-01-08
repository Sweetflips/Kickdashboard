// Minimal health check server
const http = require('http');
const port = parseInt(process.env.PORT || '3000', 10);

console.log('Starting health server on port', port);

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(port, '0.0.0.0', () => {
  console.log('Listening on', port);
});
