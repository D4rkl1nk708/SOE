const fs = require('fs');
let indexProd = fs.readFileSync('server/_core/index.prod.ts', 'utf8');
indexProd = indexProd.replace(/storage\.createDiscipline\(\{/g, 'storage.createDiscipline(user.id, {');
indexProd = indexProd.replace(/storage\.createTopic\(\{/g, 'storage.createTopic(user.id, {');
indexProd = indexProd.replace(/storage\.createRevisions\(([^,]+)\)/g, 'storage.createRevisions(user.id, $1)');
indexProd = indexProd.replace(/storage\.createRevision\(\{/g, 'storage.createRevision(user.id, {');
indexProd = indexProd.replace(/storage\.createQuestionError\(\{/g, 'storage.createQuestionError(user.id, {');
fs.writeFileSync('server/_core/index.prod.ts', indexProd);

let indexDev = fs.readFileSync('server/_core/index.ts', 'utf8');
indexDev = indexDev.replace(/storage\.createTopic\(ctx\.user\.id, \{/g, 'storage.createTopic({');
fs.writeFileSync('server/_core/index.ts', indexDev);
