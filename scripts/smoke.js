// scripts/smoke.js
// Manual end-to-end check against real provider APIs. Run with real keys in .env:
//   node scripts/smoke.js gemini-3-pro-image "a red apple on a table"
//   node scripts/smoke.js gpt-image-2 "a red apple on a table"
require('dotenv').config();
const fs = require('fs');
const providers = require('../providers');

async function main() {
  const model = process.argv[2] || 'gemini-3-pro-image';
  const prompt = process.argv[3] || 'a single red apple on a wooden table, studio lighting';
  console.log(`Smoke test: model=${model}`);
  const { images } = await providers.generate(model, { prompt, inputImages: [], options: { resolution: '1K', size: '1024x1024' } });
  console.log(`Returned ${images.length} image(s).`);
  if (images.length === 0) throw new Error('No images returned — check SDK field names / model id.');
  const b64 = images[0].split(',')[1];
  fs.writeFileSync('smoke-output.png', Buffer.from(b64, 'base64'));
  console.log('Wrote smoke-output.png');
}
main().catch(e => { console.error('SMOKE FAILED:', e.message); process.exit(1); });
