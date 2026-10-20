import fs from 'fs';
const filePath = 'c:\\project_Code\\pharmacy\\src\\app\\scan\\ScanContent.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: First IIFE - the original has }()}) at line ~884, should be })() then }
content = content.replace(
  '                  }()})',
  '                  })()'
);

// Fix 2: Second IIFE - same pattern at line ~1239
content = content.replace(
  '                  }()})',
  '                  })()'
);

// Fix 3: Replace the malformed closing section
const malformed = '                  })()\n                </div>\n              </div}>\n          </main>\n      {showCameraModal && (';

const fixed = '                  })()\n                }\n                </div>\n              )}\n            )}\n          )}\n        </div>\n      )}\n      {showCameraModal && (';

content = content.replace(malformed, fixed);

fs.writeFileSync(filePath, content, 'utf8');
console.log('All fixes applied');