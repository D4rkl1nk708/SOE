const fs = require('fs');
let content = fs.readFileSync('server/db.ts', 'utf8');

// replace userId: number with userId: string | number
content = content.replace(/userId: number/g, 'userId: string | number');
content = content.replace(/openId: string/g, 'openId: string | number');

fs.writeFileSync('server/db.ts', content);
