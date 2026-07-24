import https from 'https';
import http from 'http';

const BACKEND_URL = process.env.BACKEND_URL || 'https://lms-thpt-camau.onrender.com';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sfanqrirgbxpgrhcamit.supabase.co';

const ping = (url) => new Promise((resolve, reject) => {
  const agent = url.startsWith('https') ? https : http;
  const req = agent.get(url, { timeout: 15000 }, (res) => {
    res.resume();
    resolve(res.statusCode);
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
});

async function main() {
  const now = new Date().toISOString();
  console.log(`[${now}] Ping targets...`);

  try {
    const code = await ping(`${BACKEND_URL}/health`);
    console.log(`  ✓ Backend /health → ${code}`);
  } catch (e) {
    console.log(`  ✗ Backend failed: ${e.message}`);
  }

  try {
    const code = await ping(`${SUPABASE_URL}/rest/v1/`);
    console.log(`  ✓ Supabase REST → ${code}`);
  } catch (e) {
    console.log(`  ✗ Supabase failed: ${e.message}`);
  }
}

main().catch(console.error);