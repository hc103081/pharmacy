import { repairGeminiJson } from './src/app/actions/import';
const broken = `{\n  "order_number": "R123"\n  "delivery_date": "2021-01-01"\n}`;
console.log('input:', broken);
const cleaned = repairGeminiJson(broken);
console.log('cleaned:', cleaned);
try { console.log('parsed:', JSON.parse(cleaned)); } catch(e:any){ console.error('parse error', e.message); }
