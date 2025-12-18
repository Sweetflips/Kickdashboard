#!/usr/bin/env node

/**
 * Test CDN worker CORS headers
 */

const https = require('https');

const testUrl = process.argv[2] || 'https://cdn.kickdashboard.com/avatars/23392400/1765562922737_869e4711f0b6cc66.webp?exp=1765731900&sig=KhxtqZ3Wh2hN8-2t1ZHIkHEd5B9gUDH3Al_JWGbqQ70';

console.log('🔍 Testing CDN CORS Headers\n');
console.log(`URL: ${testUrl}\n`);

const options = {
  headers: {
    'Origin': 'https://www.kickdashboard.com',
    'User-Agent': 'Mozilla/5.0'
  }
};

https.get(testUrl, options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log('\nResponse Headers:');
  console.log(JSON.stringify(res.headers, null, 2));
  
  const corsHeader = res.headers['access-control-allow-origin'];
  if (corsHeader) {
    console.log(`\n✅ CORS Header Found: ${corsHeader}`);
  } else {
    console.log('\n❌ NO CORS HEADER FOUND!');
    console.log('\nThis means the worker deployment might not have updated,');
    console.log('or Cloudflare is caching the old response.');
  }
  
  res.on('data', () => {}); // Consume data
  res.on('end', () => {
    process.exit(corsHeader ? 0 : 1);
  });
}).on('error', (err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});











