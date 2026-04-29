const fs = require('fs');

function repl(file, search, replace) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(search, replace);
    fs.writeFileSync(file, content);
  }
}

// client/src/_core/hooks/useAuth.ts
repl('client/src/_core/hooks/useAuth.ts', /supabase\.auth\.getSession\(\)\.then\(\(\{ data: \{ session \} \}\) =>/g, 'supabase.auth.getSession().then(({ data: { session } }: any) =>');

// client/src/components/AuthGuard.tsx
repl('client/src/components/AuthGuard.tsx', /supabase\.auth\.getSession\(\)\.then\(\(\{ data: \{ session \} \}\) =>/g, 'supabase.auth.getSession().then(({ data: { session } }: any) =>');
repl('client/src/components/AuthGuard.tsx', /supabase\.auth\.onAuthStateChange\(\(_event, session\) =>/g, 'supabase.auth.onAuthStateChange((_event: any, session: any) =>');

// client/src/components/GlobalSearch.tsx
repl('client/src/components/GlobalSearch.tsx', /disciplines\.map\(\(d\) =>/g, 'disciplines.map((d: any) =>');
repl('client/src/components/GlobalSearch.tsx', /topics\.map\(\(t\) =>/g, 'topics.map((t: any) =>');

// client/src/hooks/useDiarioOficial.ts
let useDOU = fs.readFileSync('client/src/hooks/useDiarioOficial.ts', 'utf8');
if (!useDOU.includes('results?: any[]')) {
  useDOU = useDOU.replace(/seenIds\?: string\[\];/g, 'seenIds?: string[]; results?: any[];');
  useDOU = useDOU.replace(/const DEFAULT_INTERVAL_MINUTES/, 'export const DEFAULT_INTERVAL_MINUTES');
  fs.writeFileSync('client/src/hooks/useDiarioOficial.ts', useDOU);
}

// client/src/hooks/usePresence.ts
repl('client/src/hooks/usePresence.ts', /Object\.entries\(newPresences\)\.forEach\(\(\[key, newPresences\]\) =>/g, 'Object.entries(newPresences).forEach(([key, newPresences]: any) =>');
repl('client/src/hooks/usePresence.ts', /Object\.entries\(leftPresences\)\.forEach\(\(\[key, leftPresences\]\) =>/g, 'Object.entries(leftPresences).forEach(([key, leftPresences]: any) =>');
repl('client/src/hooks/usePresence.ts', /supabase\.channel\("online-users"\)\.on\("presence", \{ event: "sync" \}, \(\) =>/g, 'supabase.channel("online-users").on("presence", { event: "sync" } as any, () =>');
repl('client/src/hooks/usePresence.ts', /supabase\.channel\("online-users"\)\.on\(\s*"presence",\s*\{ event: "join" \},\s*\(\{ key, newPresences \}\) =>/g, 'supabase.channel("online-users").on("presence" as any, { event: "join" } as any, ({ key, newPresences }: any) =>');
repl('client/src/hooks/usePresence.ts', /supabase\.channel\("online-users"\)\.on\(\s*"presence",\s*\{ event: "leave" \},\s*\(\{ key, leftPresences \}\) =>/g, 'supabase.channel("online-users").on("presence" as any, { event: "leave" } as any, ({ key, leftPresences }: any) =>');
repl('client/src/hooks/usePresence.ts', /const updateStatus = async \(status\) =>/g, 'const updateStatus = async (status: any) =>');

// client/src/hooks/useProfile.ts
repl('client/src/hooks/useProfile.ts', /supabase\.auth\.onAuthStateChange\(\(_event, session\) =>/g, 'supabase.auth.onAuthStateChange((_event: any, session: any) =>');

// client/src/pages/QuestionSession.tsx
repl('client/src/pages/QuestionSession.tsx', /const \[discipline\] = disciplines\.filter\(\(d\) =>/g, 'const [discipline] = disciplines.filter((d: any) =>');

// client/src/pages/SOEAnalytics.tsx
repl('client/src/pages/SOEAnalytics.tsx', /discTopics\.forEach\(\(t\) =>/g, 'discTopics.forEach((t: any) =>');
repl('client/src/pages/SOEAnalytics.tsx', /topicRevs\.forEach\(\(t\) =>/g, 'topicRevs.forEach((t: any) =>');
repl('client/src/pages/SOEAnalytics.tsx', /topicErrors\.forEach\(\(t\) =>/g, 'topicErrors.forEach((t: any) =>');

// server/_core/index.prod.ts
let indexProd = fs.readFileSync('server/_core/index.prod.ts', 'utf8');
indexProd = indexProd.replace(/export async function saveQuestionError\(/g, 'export async function createQuestionError(');
indexProd = indexProd.replace(/storage\.saveQuestionError\(/g, 'storage.createQuestionError(');
indexProd = indexProd.replace(/storage\.getDashboardStats\(user\.id\)/g, 'storage.getDashboardStats(user.id as any)');
indexProd = indexProd.replace(/storage\.getPeakHoursAnalysis\(user\.id\)/g, 'storage.getPeakHoursAnalysis(user.id as any)');
indexProd = indexProd.replace(/storage\.getWeakTopicsFromSnapshot\(user\.id\)/g, 'storage.getWeakTopicsFromSnapshot(user.id as any)');
indexProd = indexProd.replace(/storage\.createDiscipline\(user\.id, \{/g, 'storage.createDiscipline({');
indexProd = indexProd.replace(/storage\.createTopic\(user\.id, \{/g, 'storage.createTopic({');
indexProd = indexProd.replace(/storage\.createRevision\(user\.id, \{/g, 'storage.createRevision({');
indexProd = indexProd.replace(/storage\.createRevisions\(user\.id, ([^\)]+)\)/g, 'storage.createRevisions($1)');
fs.writeFileSync('server/_core/index.prod.ts', indexProd);

// server/_core/index.ts
let indexDev = fs.readFileSync('server/_core/index.ts', 'utf8');
indexDev = indexDev.replace(/storage\.createTopic\(ctx\.user\.id, \{/g, 'storage.createTopic({');
fs.writeFileSync('server/_core/index.ts', indexDev);

