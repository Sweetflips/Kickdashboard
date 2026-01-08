import 'dotenv/config';

async function test() {
  console.log('Testing /livestreams endpoint...');
  console.log('KICK_CLIENT_ID:', process.env.KICK_CLIENT_ID?.substring(0, 10) + '...');
  
  const tokenRes = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.KICK_CLIENT_ID!,
      client_secret: process.env.KICK_CLIENT_SECRET!,
    }),
  });
  const tokenData = await tokenRes.json() as any;
  console.log('Token status:', tokenRes.status);
  
  const lsRes = await fetch('https://api.kick.com/public/v1/livestreams?limit=100', {
    headers: {
      'Authorization': 'Bearer ' + tokenData.access_token,
      'Accept': 'application/json',
    }
  });
  const lsData = await lsRes.json() as any;
  
  console.log('Livestreams status:', lsRes.status);
  console.log('Response is array:', Array.isArray(lsData.data));
  console.log('Total livestreams:', lsData.data?.length || 0);
  
  if (Array.isArray(lsData.data)) {
    const sf = lsData.data.find((ls: any) => 
      String(ls.broadcaster_user_id) === '42962282'
    );
    
    if (sf) {
      console.log('\n=== Found sweetflips ===');
      console.log(JSON.stringify(sf, null, 2));
    } else {
      console.log('sweetflips not found in', lsData.data.length, 'livestreams');
      if (lsData.data[0]) {
        console.log('\nSample entry:');
        console.log(JSON.stringify(lsData.data[0], null, 2));
      }
    }
  }
}

test().catch(console.error);

