import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const DB_FILE = path.join(process.cwd(), "data", "database.json");

async function migrate() {
  if (!fs.existsSync(DB_FILE)) {
    console.error("Arquivo database.json não encontrado!");
    return;
  }

  console.log(
    "Lendo banco de dados local (isso pode demorar alguns segundos)...",
  );
  const rawData = fs.readFileSync(DB_FILE, "utf-8");
  const db = JSON.parse(rawData);

  console.log("--- Resumo Local ---");
  console.log(`Usuários: ${db.users.length}`);
  console.log(`Disciplinas: ${db.disciplines.length}`);
  console.log(`Tópicos: ${db.topics.length}`);
  console.log(`Revisões: ${db.revisions.length}`);
  console.log(`Flashcards: ${db.flashcards.length}`);
  console.log(`Questões com Erro: ${db.questionErrors.length}`);
  console.log("--------------------");

  // 1. Migrar Usuários
  const userMap = new Map<number, any>();
  for (const user of db.users) {
    console.log(`Migrando usuário: ${user.name}...`);
    const { data, error } = await supabase
      .from("users")
      .upsert(
        {
          open_id: user.openId,
          name: user.name,
          email: user.email,
          login_method: user.loginMethod,
          role: user.role,
          settings: user.settings,
          last_signed_in: user.lastSignedIn,
          created_at: user.createdAt,
          updated_at: user.updatedAt,
        },
        { onConflict: "open_id" },
      )
      .select();

    if (error) {
      console.error(`Erro usuário ${user.name}:`, error.message);
      continue;
    }
    userMap.set(user.id, data[0]);
  }

  // 2. Migrar Disciplinas
  const disciplineMap = new Map<number, any>();
  for (const disc of db.disciplines) {
    const newUser = userMap.get(disc.userId);
    if (!newUser) continue;

    const { data, error } = await supabase
      .from("disciplines")
      .insert({
        user_id: newUser.id,
        name: disc.name,
        color: disc.color,
        weight: disc.weight,
        order: disc.order,
        performance: disc.performance,
        study_time_seconds: disc.studyTimeSeconds,
        created_at: disc.createdAt,
        updated_at: disc.updatedAt,
      })
      .select();

    if (error) {
      console.error(`Erro disciplina ${disc.name}:`, error.message);
    } else {
      disciplineMap.set(disc.id, data[0]);
    }
  }

  // 3. Migrar Tópicos
  const topicMap = new Map<number, any>();
  console.log("Migrando tópicos (em lotes)...");
  for (const topic of db.topics) {
    const newUser = userMap.get(topic.userId);
    const newDisc = disciplineMap.get(topic.disciplineId);
    if (!newUser || !newDisc) continue;

    const { data, error } = await supabase
      .from("topics")
      .insert({
        user_id: newUser.id,
        discipline_id: newDisc.id,
        name: topic.name,
        order: topic.order,
        study_date: topic.studyDate,
        notes: topic.notes,
        performance: topic.performance,
        study_time_seconds: topic.studyTimeSeconds,
        topic_notes: topic.topicNotes,
        created_at: topic.createdAt,
        updated_at: topic.updatedAt,
      })
      .select();

    if (error) {
      console.error(`Erro tópico ${topic.name}:`, error.message);
    } else {
      topicMap.set(topic.id, data[0]);
    }
  }

  // 4. Migrar Revisões
  console.log("Migrando revisões...");
  const revisionBatches = chunkArray(db.revisions, 100);
  for (const batch of revisionBatches) {
    const records = batch
      .map((rev: any) => {
        const newUser = userMap.get(rev.userId);
        const newTopic = topicMap.get(rev.topicId);
        if (!newUser || !newTopic) return null;
        return {
          user_id: newUser.id,
          topic_id: newTopic.id,
          scheduled_date: rev.scheduledDate,
          type: rev.type,
          revision_number: rev.revisionNumber,
          completed: rev.completed,
          ignored: rev.ignored,
          completed_at: rev.completedAt,
          recall_rating: rev.recallRating,
          free_recall_text: rev.freeRecallText,
          link: rev.link,
          created_at: rev.createdAt,
          updated_at: rev.updatedAt,
        };
      })
      .filter(Boolean);

    if (records.length > 0) {
      const { error } = await supabase.from("revisions").insert(records);
      if (error) console.error("Erro lote revisões:", error.message);
    }
  }

  console.log("Migração concluída com sucesso!");
}

function chunkArray(array: any[], size: number) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

migrate().catch((err) => console.error("Erro fatal na migração:", err));
