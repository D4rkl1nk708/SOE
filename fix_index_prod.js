const fs = require('fs');

let content = fs.readFileSync('server/_core/index.prod.ts', 'utf8');

content = content.replace(/await storage\.createDiscipline\(\{/g, 'await storage.createDiscipline(user.id, {');
content = content.replace(/await storage\.createTopic\(\{/g, 'await storage.createTopic(user.id, {');
content = content.replace(/await storage\.createRevisions\(([^,]+)\)/g, 'await storage.createRevisions(user.id, $1)');
content = content.replace(/await storage\.createRevision\(\{/g, 'await storage.createRevision(user.id, {');

fs.writeFileSync('server/_core/index.prod.ts', content);
