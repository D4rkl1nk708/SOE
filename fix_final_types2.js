const fs = require('fs');

function fix(file) {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Any remaining generic array method implicit any
  const arrayMethods = ['map', 'filter', 'reduce', 'forEach', 'some', 'find', 'every'];
  arrayMethods.forEach(method => {
    // pattern: .method((char) =>
    const regex1 = new RegExp(`\\.${method}\\(\\(([a-zA-Z0-9_]+)\\) =>`, 'g');
    content = content.replace(regex1, `.${method}(($1: any) =>`);
    // pattern: .method((char, char) =>
    const regex2 = new RegExp(`\\.${method}\\(\\(([a-zA-Z0-9_]+), ([a-zA-Z0-9_]+)\\) =>`, 'g');
    content = content.replace(regex2, `.${method}(($1: any, $2: any) =>`);
    // pattern: .method(char =>
    const regex3 = new RegExp(`\\.${method}\\(([a-zA-Z0-9_]+) =>`, 'g');
    content = content.replace(regex3, `.${method}(($1: any) =>`);
  });

  fs.writeFileSync(file, content);
}

const files = [
  'client/src/components/GlobalSearch.tsx',
  'client/src/hooks/usePresence.ts',
  'client/src/pages/QuestionSession.tsx',
  'client/src/pages/SOEAnalytics.tsx',
  'server/_core/index.ts',
  'server/analyticsService.ts',
  'server/mentorRouter.ts',
  'server/tecImportService.ts'
];
files.forEach(fix);

// Fix jsonStorage.ts specific errors
if (fs.existsSync('server/jsonStorage.ts')) {
  let jsonStorage = fs.readFileSync('server/jsonStorage.ts', 'utf8');
  jsonStorage = jsonStorage.replace(/export async function updateUserSettings\(/, 'export async function updateUserSettings(userId: string | number, settingsUpdate: Partial<UserSettings>) {\n  return db.updateUserSettings(userId as number, settingsUpdate as any);\n}\nasync function updateUserSettings_old(');
  jsonStorage = jsonStorage.replace(/topics\[topicId\]/g, 'topics[topicId as any]');
  jsonStorage = jsonStorage.replace(/topics\[t\.topicId\]/g, 'topics[t.topicId as any]');
  jsonStorage = jsonStorage.replace(/disciplines\[d\.id\]/g, 'disciplines[d.id as any]');
  fs.writeFileSync('server/jsonStorage.ts', jsonStorage);
}

// Fix index.prod.ts missing arguments
if (fs.existsSync('server/_core/index.prod.ts')) {
  let indexProd = fs.readFileSync('server/_core/index.prod.ts', 'utf8');
  indexProd = indexProd.replace(/storage\.exportDatabase\(\)/g, 'storage.exportDatabase(user.id)');
  indexProd = indexProd.replace(/storage\.importDatabase\(input\.json\)/g, 'storage.importDatabase(user.id, input.json)');
  indexProd = indexProd.replace(/storage\.updateTopic\(\{/g, 'storage.updateTopic(user.id, {');
  indexProd = indexProd.replace(/storage\.updateRevision\(\{/g, 'storage.updateRevision(user.id, {');
  indexProd = indexProd.replace(/storage\.deleteRevision\(\{/g, 'storage.deleteRevision(user.id, {');
  indexProd = indexProd.replace(/storage\.upsertNote\(\{/g, 'storage.upsertNote(user.id, {');
  indexProd = indexProd.replace(/storage\.saveEssay\(\{/g, 'storage.saveEssay(user.id, {');
  fs.writeFileSync('server/_core/index.prod.ts', indexProd);
}

// Fix index.ts missing arguments
if (fs.existsSync('server/_core/index.ts')) {
  let indexDev = fs.readFileSync('server/_core/index.ts', 'utf8');
  indexDev = indexDev.replace(/storage\.updateTopic\(\{/g, 'storage.updateTopic(user.id, {');
  indexDev = indexDev.replace(/storage\.updateRevision\(\{/g, 'storage.updateRevision(user.id, {');
  indexDev = indexDev.replace(/storage\.deleteRevision\(\{/g, 'storage.deleteRevision(user.id, {');
  indexDev = indexDev.replace(/storage\.upsertNote\(\{/g, 'storage.upsertNote(user.id, {');
  indexDev = indexDev.replace(/storage\.saveEssay\(\{/g, 'storage.saveEssay(user.id, {');
  indexDev = indexDev.replace(/storage\.saveQuestionError\(\{/g, 'storage.saveQuestionError(user.id as any, {');
  fs.writeFileSync('server/_core/index.ts', indexDev);
}

