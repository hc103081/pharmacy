const { repairGeminiJson } = require('../src/app/actions/import');

const assert = require('assert');

describe('repairGeminiJson', () => {
  it('should fix missing commas between properties', async () => {
    const broken = `{\n      "order_number": "R123"\n      "delivery_date": "2021-01-01"\n    }`;
    const cleaned = await repairGeminiJson(broken);
    const parsed = JSON.parse(cleaned);
    assert.deepStrictEqual(parsed, { order_number: 'R123', delivery_date: '2021-01-01' });
  });
});
