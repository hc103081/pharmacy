#!/usr/bin/env deno
// Test CSV parser
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = line.length;
  while (i < len) {
    const ch = line[i];
    if (ch === '"') {
      if (i + 1 < len && line[i + 1] === '"') {
        // escaped quote
        field += '"';
        i += 2;
      } else {
        // toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  fields.push(field); // last field
  return fields;
}

// Test line from earlier
const line = `,AC15265100,"CHLORPROMAZINE TABLETS \"\"Y.Y.\"\"","""應元""氯普麻口秦錠",CHLORPROMAZINE (HCL) 100 MG,,,單方,1.57,1030801,1040331,應元化學製藥股份有限公司,應元化學製藥股份有限公司,錠劑,一般學名藥,"CHLORPROMAZINE , 一般錠劑膠囊劑 , 100.00 MG",N05AA01,,https://lmspiq.fda.gov.tw/web/DRPIQ/DRPIQ1000Result?licId=01015265,`;
console.log(parseLine(line));