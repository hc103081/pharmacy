const { repairGeminiJson } = require('./src/app/actions/import');
const broken = `{
  "order_number": "R123"
  "delivery_date": "2021-01-01"
}`;
console.log('cleaned:', repairGeminiJson(broken));
