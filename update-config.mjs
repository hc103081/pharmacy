import fs from 'fs';
const filePath = 'c:\\project_Code\\pharmacy\\next.config.js';
let content = fs.readFileSync(filePath, 'utf8');
content = content.replace("turbopack: {}", "turbopack: false");
fs.writeFileSync(filePath, content, 'utf8');
console.log('Updated next.config.js');