const fs = require('fs');

function replaceImplicitAny(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\.reduce\(\(([a-z]), ([a-z])\) =>/g, '.reduce(($1: any, $2: any) =>');
  content = content.replace(/\.map\(\(([a-z])\) =>/g, '.map(($1: any) =>');
  content = content.replace(/\.filter\(\(([a-z])\) =>/g, '.filter(($1: any) =>');
  content = content.replace(/\.then\(\(([a-z])\) =>/g, '.then(($1: any) =>');
  content = content.replace(/\.every\(\(([a-z])\) =>/g, '.every(($1: any) =>');
  content = content.replace(/\.find\(\(([a-z])\) =>/g, '.find(($1: any) =>');
  content = content.replace(/\.some\(\(([a-z])\) =>/g, '.some(($1: any) =>');
  content = content.replace(/\.sort\(\(([a-z]), ([a-z])\) =>/g, '.sort(($1: any, $2: any) =>');
  content = content.replace(/\(([a-z]): any\) => \1\.items/g, '($1: any) => $1.items');
  content = content.replace(/catch \((err|e)\) \{/g, 'catch ($1: any) {');
  
  // Specific to components and hooks
  if (file.includes('useAuth.ts')) {
    content = content.replace(/authListener = supabase\.auth\.onAuthStateChange\(\s*\(_event, session\)/, 'authListener = supabase.auth.onAuthStateChange( (_event: any, session: any)');
  }
  if (file.includes('AuthGuard.tsx')) {
    content = content.replace(/supabase\.auth\.onAuthStateChange\(\s*\(_event, session\)/, 'supabase.auth.onAuthStateChange( (_event: any, session: any)');
  }
  if (file.includes('analyticsService.ts')) {
     content = content.replace(/export async function getUserByOpenId\(openId: string\)/, 'export async function getUserByOpenId(openId: string | number)');
     // I'll run this logic on db.ts too
  }
  fs.writeFileSync(file, content);
}

const files = [
  'client/src/pages/CienciaDosEstudos.tsx',
  'client/src/pages/Home.tsx',
  'client/src/pages/Sync.tsx',
  'client/src/pages/SOEAnalytics.tsx',
  'server/analyticsService.ts',
  'server/routers.ts',
  'server/tecImportService.ts',
  'server/_core/index.ts',
  'server/_core/index.prod.ts',
  'server/jsonStorage.ts',
  'client/src/_core/hooks/useAuth.ts',
  'client/src/components/AuthGuard.tsx',
  'server/db.ts',
  'client/src/hooks/useDiarioOficial.ts'
];

files.forEach(replaceImplicitAny);
