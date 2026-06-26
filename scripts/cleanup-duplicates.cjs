/**
 * Database cleanup script: Merge duplicate disciplines and topics.
 * 
 * Problem: Multiple disciplines with the same name exist, each with their own
 * copies of topics. This causes the total question count to be double-counted.
 * 
 * Solution: For each set of duplicate disciplines, keep the one with the lowest ID
 * (oldest), merge all topics into it, and remove the duplicate disciplines.
 * For duplicate topics within the same discipline, keep the one with the highest
 * questionsResolved count and remove the others.
 */
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(process.cwd(), 'data', 'database.json');
const BACKUP_FILE = path.join(process.cwd(), 'data', 'database.backup.json');

function normalize(s) {
  if (!s) return '';
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Read database
const raw = fs.readFileSync(DB_FILE, 'utf-8');
const db = JSON.parse(raw);

// Backup first
fs.writeFileSync(BACKUP_FILE, raw);
console.log(`✓ Backup saved to ${BACKUP_FILE}`);

const disciplines = db.disciplines || [];
const topics = db.topics || [];
const revisions = db.revisions || [];

console.log(`\nBefore cleanup:`);
console.log(`  Disciplines: ${disciplines.length}`);
console.log(`  Topics: ${topics.length}`);
const totalBefore = topics.reduce((s, t) => s + (t.performance?.questionsResolved || 0), 0);
console.log(`  Total questionsResolved: ${totalBefore}`);

// Step 1: Group disciplines by normalized name + userId
const discGroups = {};
for (const d of disciplines) {
  const key = `${d.userId}_${normalize(d.name)}`;
  if (!discGroups[key]) discGroups[key] = [];
  discGroups[key].push(d);
}

// Build a mapping: old disc ID -> canonical disc ID (lowest ID in each group)
const discIdMap = {}; // oldId -> canonicalId
const discIdsToRemove = new Set();

for (const [key, group] of Object.entries(discGroups)) {
  if (group.length <= 1) continue;
  
  // Keep the one with lowest ID
  group.sort((a, b) => a.id - b.id);
  const canonical = group[0];
  
  console.log(`\n  Merging discipline "${canonical.name}" (keeping ID ${canonical.id}, removing IDs ${group.slice(1).map(d => d.id).join(', ')})`);
  
  for (let i = 1; i < group.length; i++) {
    discIdMap[group[i].id] = canonical.id;
    discIdsToRemove.add(group[i].id);
  }
}

// Step 2: Reassign topics from duplicate disciplines to canonical ones
for (const t of topics) {
  if (discIdMap[t.disciplineId] !== undefined) {
    t.disciplineId = discIdMap[t.disciplineId];
  }
}

// Step 3: Now merge duplicate topics within the same discipline
const topicGroups = {};
for (const t of topics) {
  const key = `${t.disciplineId}_${t.userId}_${normalize(t.name)}`;
  if (!topicGroups[key]) topicGroups[key] = [];
  topicGroups[key].push(t);
}

const topicIdsToRemove = new Set();
const topicIdMap = {}; // oldId -> canonicalId

for (const [key, group] of Object.entries(topicGroups)) {
  if (group.length <= 1) continue;
  
  // Keep the one with the highest questionsResolved
  group.sort((a, b) => {
    const aRes = a.performance?.questionsResolved || 0;
    const bRes = b.performance?.questionsResolved || 0;
    return bRes - aRes || a.id - b.id; // highest resolved first, then lowest ID
  });
  
  const canonical = group[0];
  
  for (let i = 1; i < group.length; i++) {
    topicIdMap[group[i].id] = canonical.id;
    topicIdsToRemove.add(group[i].id);
    console.log(`    Removing duplicate topic "${group[i].name}" (ID ${group[i].id}, resolved=${group[i].performance?.questionsResolved || 0}) → keeping ID ${canonical.id} (resolved=${canonical.performance?.questionsResolved || 0})`);
  }
}

// Step 4: Reassign revisions from duplicate topics to canonical ones
let revisionsReassigned = 0;
let revisionsRemoved = 0;
const seenRevisionKeys = new Set();

for (const r of revisions) {
  if (topicIdMap[r.topicId] !== undefined) {
    r.topicId = topicIdMap[r.topicId];
    revisionsReassigned++;
  }
}

// Step 5: Remove duplicate disciplines and topics
db.disciplines = disciplines.filter(d => !discIdsToRemove.has(d.id));
db.topics = topics.filter(t => !topicIdsToRemove.has(t.id));

// Step 6: Deduplicate revisions (same topicId + scheduledDate + revisionNumber)
const uniqueRevisions = [];
const revKeySet = new Set();
for (const r of db.revisions || []) {
  const key = `${r.topicId}_${r.scheduledDate}_${r.revisionNumber}_${r.type}`;
  if (!revKeySet.has(key)) {
    revKeySet.add(key);
    uniqueRevisions.push(r);
  } else {
    revisionsRemoved++;
  }
}
db.revisions = uniqueRevisions;

console.log(`\nAfter cleanup:`);
console.log(`  Disciplines: ${db.disciplines.length} (removed ${discIdsToRemove.size})`);
console.log(`  Topics: ${db.topics.length} (removed ${topicIdsToRemove.size})`);
const totalAfter = db.topics.reduce((s, t) => s + (t.performance?.questionsResolved || 0), 0);
console.log(`  Total questionsResolved: ${totalAfter} (was ${totalBefore}, diff=${totalBefore - totalAfter})`);
console.log(`  Revisions reassigned: ${revisionsReassigned}`);
console.log(`  Duplicate revisions removed: ${revisionsRemoved}`);

// Write cleaned database
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log(`\n✓ Database cleaned and saved!`);
