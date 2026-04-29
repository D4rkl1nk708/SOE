const fs = require('fs');

function fix(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\.reduce\(\(([a-zA-Z_]+), ([a-zA-Z_]+)\) =>/g, '.reduce(($1: any, $2: any) =>');
  content = content.replace(/\.map\(\(([a-zA-Z_]+)\) =>/g, '.map(($1: any) =>');
  content = content.replace(/\.map\(\(([a-zA-Z_]+), ([a-zA-Z_]+)\) =>/g, '.map(($1: any, $2: any) =>');
  content = content.replace(/\.filter\(\(([a-zA-Z_]+)\) =>/g, '.filter(($1: any) =>');
  content = content.replace(/\.filter\(\(([a-zA-Z_]+), ([a-zA-Z_]+)\) =>/g, '.filter(($1: any, $2: any) =>');
  content = content.replace(/\.then\(\(([a-zA-Z_]+)\) =>/g, '.then(($1: any) =>');
  content = content.replace(/\.every\(\(([a-zA-Z_]+)\) =>/g, '.every(($1: any) =>');
  content = content.replace(/\.find\(\(([a-zA-Z_]+)\) =>/g, '.find(($1: any) =>');
  content = content.replace(/\.some\(\(([a-zA-Z_]+)\) =>/g, '.some(($1: any) =>');
  content = content.replace(/\.sort\(\(([a-zA-Z_]+), ([a-zA-Z_]+)\) =>/g, '.sort(($1: any, $2: any) =>');
  content = content.replace(/catch \((err|e)\) \{/g, 'catch ($1: any) {');
  
  if (file.includes('useAuth.ts')) {
    content = content.replace(/authListener = supabase\.auth\.onAuthStateChange\(\s*\(_event, session\)/, 'authListener = supabase.auth.onAuthStateChange( (_event: any, session: any)');
  }
  if (file.includes('AuthGuard.tsx')) {
    content = content.replace(/supabase\.auth\.onAuthStateChange\(\s*\(_event, session\)/, 'supabase.auth.onAuthStateChange( (_event: any, session: any)');
  }

  // Also replace (t) when there are no parens, e.g. .map(t =>
  content = content.replace(/\.map\(([a-zA-Z_]+) =>/g, '.map(($1: any) =>');
  content = content.replace(/\.filter\(([a-zA-Z_]+) =>/g, '.filter(($1: any) =>');
  content = content.replace(/\.reduce\(([a-zA-Z_]+) =>/g, '.reduce(($1: any) =>');
  content = content.replace(/\.find\(([a-zA-Z_]+) =>/g, '.find(($1: any) =>');
  content = content.replace(/\.some\(([a-zA-Z_]+) =>/g, '.some(($1: any) =>');

  fs.writeFileSync(file, content);
}

const frontendFiles = [
  'client/src/_core/hooks/useAuth.ts',
  'client/src/components/AuthGuard.tsx',
  'client/src/components/ConfusionMatrixWidget.tsx',
  'client/src/components/GlobalSearch.tsx',
  'client/src/components/PlateauRadarWidget.tsx',
  'client/src/components/ShareProgress.tsx',
  'client/src/components/WeakProfileChart.tsx',
  'client/src/hooks/useDiarioOficial.ts',
  'client/src/hooks/usePresence.ts',
  'client/src/hooks/useProfile.ts',
  'client/src/hooks/useSyncEngine.ts',
  'client/src/pages/CienciaDosEstudos.tsx',
  'client/src/pages/Home.tsx',
  'client/src/pages/Profile.tsx',
  'client/src/pages/QuestionSession.tsx',
  'client/src/pages/SOEAnalytics.tsx',
  'client/src/pages/Sync.tsx',
  'server/_core/context.ts',
  'server/_core/index.prod.ts',
  'server/_core/index.ts',
  'server/analyticsService.ts',
  'server/editalRouter.ts',
  'server/jsonStorage.ts',
  'server/labRouter.ts',
  'server/mentorRouter.ts',
  'server/routers.ts',
  'server/tecImportService.ts'
];

frontendFiles.forEach(f => {
  if (fs.existsSync(f)) {
     fix(f);
  }
});
