require('ts-node').register();
const { repairGeminiJson } = require('./src/app/actions/import');
(async () => {
  const broken = `{\n  "order_number": "R123"\n  "delivery_date": "2021-01-01"\n}`;
  const cleaned = await repairGeminiJson(broken);
  console.log('cleaned result:', cleaned);
  try { console.log('parsed:', JSON.parse(cleaned)); } catch(e){ console.error('parse error', e.message); }
})();
