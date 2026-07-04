function repairGeminiJson(text){
  let cleaned = text.replace(/```json|```/g, '').trim();
  cleaned = cleaned.replace(/"([^\"]+)"\s+"([^\"]+)"/g, '"$1": "$2"');
  cleaned = cleaned.replace(/"([^\"]+)"\s*(,|\})/g, '"$1": ""$2');
  cleaned = cleaned.replace(/"\s*\r?\n\s*"/g, '",\n"');
  cleaned = cleaned.replace(/,\s*}/g, '}');
  cleaned = cleaned.replace(/,\s*\]/g, ']');
  cleaned = cleaned.replace(/,\s*,/g, ',');
  cleaned = cleaned.replace(/}\s*"/g, '}, "');
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace !== -1 && lastBrace < cleaned.length - 1) cleaned = cleaned.slice(0, lastBrace + 1);
  try { JSON.parse(cleaned); } catch { cleaned = '{}'; }
  return cleaned;
}
const broken = `{\n  "order_number": "R123"\n  "delivery_date": "2021-01-01"\n}`;
console.log('output:', repairGeminiJson(broken));
