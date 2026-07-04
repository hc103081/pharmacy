require('ts-node').register();
const { repairGeminiJson } = require('./src/app/actions/import');
const broken = `{\n  "order_number": "R123"\n  "delivery_date": "2021-01-01"\n}`;
console.log('result:', repairGeminiJson(broken));
