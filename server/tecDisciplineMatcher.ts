import { normalizeString } from "../shared/utils";

const STOP_WORDS = new Set([
  "e",
  "de",
  "da",
  "do",
  "dos",
  "das",
  "em",
  "para",
  "com",
  "no",
  "na",
  "nos",
  "nas",
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "por",
  "sobre",
]);

const SYNONYM_GROUPS: string[][] = [
  ["tecnologia da informacao", "ti", "informatica", "computacao"],
  [
    "inteligencia artificial",
    "ia",
    "ai",
    "ciencia de dados e inteligencia artificial",
    "aprendizado de maquina",
    "machine learning",
  ],
  [
    "ciencia de dados",
    "data science",
    "cd",
    "ciencia de dados e inteligencia artificial",
  ],
  ["banco de dados", "bancos de dados", "sgbd", "bd"],
  ["redes", "redes de computadores"],
  [
    "seguranca da informacao",
    "seguranca da info",
    "seguranca cibernetica",
    "cybersecurity",
  ],
  ["engenharia de software", "eng de software"],
  [
    "raciocinio logico",
    "raciocinio logico matematico",
    "rlm",
    "matematica e raciocinio logico",
    "logica",
  ],
  ["lingua portuguesa", "portugues", "gramatica", "interpretacao de texto"],
  ["direito constitucional", "dir constitucional", "constitucional"],
  ["direito administrativo", "dir administrativo", "administrativo"],
  ["direito tributario", "dir tributario", "tributario"],
  ["direito penal", "dir penal", "penal"],
  [
    "direito processual penal",
    "dir processual penal",
    "processo penal",
    "proc penal",
  ],
  [
    "direito processual civil",
    "dir processual civil",
    "processo civil",
    "proc civil",
  ],
  ["direito civil", "dir civil", "civil"],
  ["direito do trabalho", "dir do trabalho", "trabalho"],
  ["direito previdenciario", "dir previdenciario", "previdenciario"],
  ["administracao financeira e orcamentaria", "afo", "orcamento publico"],
  ["contabilidade geral", "contabilidade", "contabilidade basica"],
  ["contabilidade publica", "contabilidade aplicada ao setor publico", "casp"],
  ["auditoria", "auditoria governamental", "auditoria privada"],
  ["administracao geral", "administracao publica", "gestao publica"],
];

export function getMeaningfulTokens(s: string): string[] {
  const norm = normalizeString(s);
  return norm.split(" ").filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

// Normalizado uma única vez para não repetir normalizeString em cada comparação.
const NORMALIZED_SYNONYM_GROUPS = SYNONYM_GROUPS.map((group) =>
  Array.from(
    new Set(group.map((item) => normalizeString(item)).filter(Boolean)),
  ),
);

/**
 * Grupos de sinônimos do termo. Aliases de uma palavra ("ia", "ti", "civil")
 * só valem por igualdade exata; antes o `includes` fazia "ciência" casar com
 * "ia" e "inteligência" casar com "ia", unindo disciplinas diferentes.
 */
export function getSynonymGroups(value: string): Set<number> {
  const normalized = normalizeString(value);
  const groups = new Set<number>();
  if (!normalized) return groups;

  for (let index = 0; index < NORMALIZED_SYNONYM_GROUPS.length; index++) {
    for (const item of NORMALIZED_SYNONYM_GROUPS[index]) {
      if (!item) continue;
      if (normalized === item) {
        groups.add(index);
        break;
      }
      if (item.includes(" ") && ` ${normalized} `.includes(` ${item} `)) {
        groups.add(index);
        break;
      }
    }
  }
  return groups;
}

export function areDisciplineSynonyms(s1: string, s2: string): boolean {
  const n1 = normalizeString(s1);
  const n2 = normalizeString(s2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;

  const groups1 = getSynonymGroups(n1);
  if (groups1.size === 0) return false;
  const groups2 = getSynonymGroups(n2);
  for (const group of groups1) {
    if (groups2.has(group)) return true;
  }
  return false;
}

export function isTokenSubset(s1: string, s2: string): boolean {
  const t1 = getMeaningfulTokens(s1);
  const t2 = getMeaningfulTokens(s2);
  if (t1.length === 0 || t2.length === 0) return false;

  const set1 = new Set(t1);
  const set2 = new Set(t2);

  const s1InS2 = t1.every((tok) => set2.has(tok));
  if (s1InS2) return true;

  const s2InS1 = t2.every((tok) => set1.has(tok));
  if (s2InS1) return true;

  return false;
}

export function calculateTokenSimilarity(s1: string, s2: string): number {
  const t1 = getMeaningfulTokens(s1);
  const t2 = getMeaningfulTokens(s2);
  if (t1.length === 0 || t2.length === 0) return 0;

  const set1 = new Set(t1);
  const set2 = new Set(t2);

  let intersection = 0;
  for (const tok of set1) {
    if (set2.has(tok)) intersection++;
  }

  const union = new Set([...t1, ...t2]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface DisciplineMatchResult {
  discipline: { id: number; name: string } | null;
  confidence: number;
  matchType:
    | "exact"
    | "alias"
    | "synonym"
    | "subset"
    | "similarity"
    | "cross_topic"
    | "none";
  reason?: string;
}

export function findBestDisciplineMatch(
  disciplines: Array<{ id: number; name: string }>,
  incomingDiscipline: string,
  incomingTopic?: string,
  aliases?: Record<string, number>,
  existingTopics?: Array<{ id: number; name: string; disciplineId: number }>,
): DisciplineMatchResult {
  if (!disciplines || disciplines.length === 0) {
    return { discipline: null, confidence: 0, matchType: "none" };
  }

  const cleanIncoming = incomingDiscipline ? incomingDiscipline.trim() : "";
  if (!cleanIncoming) {
    return {
      discipline: disciplines[0] || null,
      confidence: 0.1,
      matchType: "none",
    };
  }

  const normIncoming = normalizeString(cleanIncoming);

  // 1. Check user aliases
  if (aliases && aliases[normIncoming]) {
    const targetId = aliases[normIncoming];
    const found = disciplines.find((d) => d.id === targetId);
    if (found) {
      return {
        discipline: found,
        confidence: 1.0,
        matchType: "alias",
        reason: "Alias configurado pelo usuário",
      };
    }
  }

  // 2. Exact match after normalization
  for (const d of disciplines) {
    if (normalizeString(d.name) === normIncoming) {
      return {
        discipline: d,
        confidence: 1.0,
        matchType: "exact",
        reason: "Nome exato",
      };
    }
  }

  // 3. Known Synonyms / Acronyms (melhor correspondência, não a primeira)
  let bestSynonym: {
    discipline: { id: number; name: string };
    similarity: number;
  } | null = null;
  for (const d of disciplines) {
    if (!areDisciplineSynonyms(d.name, cleanIncoming)) continue;
    const similarity = calculateTokenSimilarity(d.name, cleanIncoming);
    if (!bestSynonym || similarity > bestSynonym.similarity) {
      bestSynonym = { discipline: d, similarity };
    }
  }
  if (bestSynonym) {
    return {
      discipline: bestSynonym.discipline,
      confidence: 0.95,
      matchType: "synonym",
      reason: `Sinônimo ou sigla de '${bestSynonym.discipline.name}'`,
    };
  }

  // 4. Token subset (exige >= 2 palavras de cada lado para não fundir
  // disciplinas genéricas de uma palavra, como "Direito")
  let bestSubset: {
    discipline: { id: number; name: string };
    similarity: number;
  } | null = null;
  const incomingTokens = getMeaningfulTokens(cleanIncoming);
  for (const d of disciplines) {
    const existingTokens = getMeaningfulTokens(d.name);
    if (Math.min(incomingTokens.length, existingTokens.length) < 2) continue;
    if (!isTokenSubset(d.name, cleanIncoming)) continue;
    const similarity = calculateTokenSimilarity(d.name, cleanIncoming);
    if (!bestSubset || similarity > bestSubset.similarity) {
      bestSubset = { discipline: d, similarity };
    }
  }
  if (bestSubset) {
    return {
      discipline: bestSubset.discipline,
      confidence: 0.9,
      matchType: "subset",
      reason: `Subconjunto de palavras de '${bestSubset.discipline.name}'`,
    };
  }

  // 5. High Token Similarity (>= 0.6)
  let bestSim = 0;
  let bestSimDisc: { id: number; name: string } | null = null;
  for (const d of disciplines) {
    const sim = calculateTokenSimilarity(d.name, cleanIncoming);
    if (sim > bestSim && sim >= 0.6) {
      bestSim = sim;
      bestSimDisc = d;
    }
  }
  if (bestSimDisc) {
    return {
      discipline: bestSimDisc,
      confidence: bestSim,
      matchType: "similarity",
      reason: `Similaridade de ${Math.round(bestSim * 100)}% com '${bestSimDisc.name}'`,
    };
  }

  // 6. Cross-topic match
  if (incomingTopic && incomingTopic.trim().length > 3) {
    const normTopic = normalizeString(incomingTopic);

    const discFromTopic = disciplines.find((d) => {
      const n = normalizeString(d.name);
      return (
        n === normTopic ||
        isTokenSubset(d.name, incomingTopic) ||
        areDisciplineSynonyms(d.name, incomingTopic)
      );
    });
    if (discFromTopic) {
      return {
        discipline: discFromTopic,
        confidence: 0.85,
        matchType: "cross_topic",
        reason: `O assunto '${incomingTopic}' corresponde à disciplina existente '${discFromTopic.name}'`,
      };
    }

    if (existingTopics && existingTopics.length > 0) {
      const matchingTopic = existingTopics.find((t) => {
        const n = normalizeString(t.name);
        return n === normTopic || isTokenSubset(t.name, incomingTopic);
      });
      if (matchingTopic) {
        const parentDisc = disciplines.find(
          (d) => d.id === matchingTopic.disciplineId,
        );
        if (parentDisc) {
          return {
            discipline: parentDisc,
            confidence: 0.8,
            matchType: "cross_topic",
            reason: `O tema '${incomingTopic}' já está cadastrado sob a disciplina '${parentDisc.name}'`,
          };
        }
      }
    }
  }

  return { discipline: null, confidence: 0, matchType: "none" };
}

export interface TopicMatchResult<
  T extends { id: number; name: string; disciplineId: number } = {
    id: number;
    name: string;
    disciplineId: number;
  },
> {
  topic: T | null;
  confidence: number;
  matchType: "exact" | "subset" | "similarity" | "none";
  reason?: string;
}

export function findBestTopicMatch<
  T extends { id: number; name: string; disciplineId: number } = {
    id: number;
    name: string;
    disciplineId: number;
  },
>(
  topics: T[],
  incomingTopic: string,
  disciplineId?: number,
): TopicMatchResult<T> {
  if (!topics || topics.length === 0 || !incomingTopic) {
    return { topic: null, confidence: 0, matchType: "none" };
  }

  const cleanIncoming = incomingTopic.trim();
  const normIncoming = normalizeString(cleanIncoming);

  const candidates = disciplineId
    ? topics.filter((t) => t.disciplineId === disciplineId)
    : topics;
  if (candidates.length === 0) {
    return { topic: null, confidence: 0, matchType: "none" };
  }

  for (const t of candidates) {
    if (normalizeString(t.name) === normIncoming) {
      return {
        topic: t,
        confidence: 1.0,
        matchType: "exact",
        reason: "Nome exato",
      };
    }
  }

  let bestSubset: { topic: T; similarity: number } | null = null;
  for (const t of candidates) {
    if (!isTokenSubset(t.name, cleanIncoming)) continue;
    const similarity = calculateTokenSimilarity(t.name, cleanIncoming);
    if (!bestSubset || similarity > bestSubset.similarity) {
      bestSubset = { topic: t, similarity };
    }
  }
  if (bestSubset) {
    return {
      topic: bestSubset.topic,
      confidence: 0.88,
      matchType: "subset",
      reason: `Subconjunto de palavras de '${bestSubset.topic.name}'`,
    };
  }

  let bestSim = 0;
  let bestTopic: (typeof candidates)[0] | null = null;
  for (const t of candidates) {
    const sim = calculateTokenSimilarity(t.name, cleanIncoming);
    if (sim > bestSim && sim >= 0.5) {
      bestSim = sim;
      bestTopic = t;
    }
  }

  if (bestTopic) {
    return {
      topic: bestTopic,
      confidence: bestSim,
      matchType: "similarity",
      reason: `Similaridade de ${Math.round(bestSim * 100)}% com '${bestTopic.name}'`,
    };
  }

  return { topic: null, confidence: 0, matchType: "none" };
}

export async function analyzeDisciplineOrTopicWithAI(params: {
  incomingDiscipline: string;
  incomingTopic: string;
  existingDisciplines: Array<{ id: number; name: string }>;
  existingTopics: Array<{ id: number; name: string; disciplineId: number }>;
  userSettings?: any;
}): Promise<{
  matchedDisciplineId: number | null;
  matchedTopicId: number | null;
  confidence: number;
  reasoning: string;
  shouldCreateNew: boolean;
}> {
  const {
    incomingDiscipline,
    incomingTopic,
    existingDisciplines,
    existingTopics,
  } = params;

  const heuristicDisc = findBestDisciplineMatch(
    existingDisciplines,
    incomingDiscipline,
    incomingTopic,
    params.userSettings?.tecDisciplineAliases,
    existingTopics,
  );

  // If heuristic match is strong enough, use it without AI
  if (heuristicDisc.discipline && heuristicDisc.confidence >= 0.85) {
    const heuristicTopic = findBestTopicMatch(
      existingTopics,
      incomingTopic,
      heuristicDisc.discipline.id,
    );
    return {
      matchedDisciplineId: heuristicDisc.discipline.id,
      matchedTopicId: heuristicTopic.topic ? heuristicTopic.topic.id : null,
      confidence: heuristicDisc.confidence,
      reasoning:
        heuristicDisc.reason ||
        "Correspondência semântica heurística com alta confiança",
      shouldCreateNew: false,
    };
  }

  // If heuristic match is moderate (0.5-0.85), use it without creating new
  if (heuristicDisc.discipline && heuristicDisc.confidence >= 0.5) {
    const heuristicTopic = findBestTopicMatch(
      existingTopics,
      incomingTopic,
      heuristicDisc.discipline.id,
    );
    return {
      matchedDisciplineId: heuristicDisc.discipline.id,
      matchedTopicId: heuristicTopic.topic ? heuristicTopic.topic.id : null,
      confidence: heuristicDisc.confidence,
      reasoning:
        heuristicDisc.reason ||
        "Correspondência semântica heurística com confiança moderada",
      shouldCreateNew: false,
    };
  }

  try {
    const { invokeLLM } = await import("./_core/llm");
    const discList = existingDisciplines
      .map((d) => `- ID ${d.id}: "${d.name}"`)
      .join("\n");
    const topicList = existingTopics
      .slice(0, 40)
      .map((t) => `- ID ${t.id} (Disciplina ${t.disciplineId}): "${t.name}"`)
      .join("\n");

    const prompt = `Você é o classificador semântico de matérias de concurso do SOE.
O usuário está no TEC Concursos e a plataforma enviou uma questão com:
|- Disciplina TEC: "${incomingDiscipline}"
|- Assunto TEC: "${incomingTopic}"

Disciplinas já existentes no sistema do usuário:
${discList}

Tópicos já existentes:
${topicList}

Tarefa:
Analise se esta questão pertence conceitualmente a alguma DISCIPLINA ou TÓPICO já existente.

Regras CRÍTICAS:
1. NUNCA crie uma nova disciplina se existir uma disciplina similar (ex: se existe "Ciência de Dados e Inteligência Artificial", não crie "Inteligência Artificial" separadamente).
2. Se a disciplina do TEC for um subconjunto de uma disciplina existente (ex: "Inteligência Artificial" dentro de "Ciência de Dados e Inteligência Artificial"), use a disciplina existente.
3. Apenas retorne shouldCreateNew: true se a disciplina for completamente nova e não tiver nenhuma relação com as existentes.
4. Dê preferência para agrupar disciplinas relacionadas em vez de criar novas.

Responda estritamente em JSON no formato:
|{
  "matchedDisciplineId": number | null,
  "matchedTopicId": number | null,
  "confidence": number (0.0 a 1.0),
  "reasoning": "uma frase curta explicando",
  "shouldCreateNew": boolean (true apenas se for uma disciplina completamente nova)
}`;

    const res = await invokeLLM({
      messages: [
        { role: "system", content: "Você responde apenas em JSON válido." },
        { role: "user", content: prompt },
      ],
      responseFormat: { type: "json_object" },
    });

    const choiceContent = res.choices?.[0]?.message?.content;
    const text =
      typeof choiceContent === "string"
        ? choiceContent
        : JSON.stringify(choiceContent || "");
    const parsed = JSON.parse(text);

    // Double-check: if AI suggests creating new but there's a heuristic match with decent confidence, prefer heuristic
    if (
      parsed.shouldCreateNew &&
      heuristicDisc.discipline &&
      heuristicDisc.confidence >= 0.4
    ) {
      console.log(
        `[AI Override] AI suggested creating new discipline, but heuristic found ${heuristicDisc.discipline.name} with ${heuristicDisc.confidence} confidence. Using heuristic match.`,
      );
      const heuristicTopic = findBestTopicMatch(
        existingTopics,
        incomingTopic,
        heuristicDisc.discipline.id,
      );
      return {
        matchedDisciplineId: heuristicDisc.discipline.id,
        matchedTopicId: heuristicTopic.topic ? heuristicTopic.topic.id : null,
        confidence: heuristicDisc.confidence,
        reasoning:
          heuristicDisc.reason ||
          "Heurística preferida sobre sugestão de criação da IA",
        shouldCreateNew: false,
      };
    }

    return {
      matchedDisciplineId:
        typeof parsed.matchedDisciplineId === "number"
          ? parsed.matchedDisciplineId
          : (heuristicDisc.discipline?.id ?? null),
      matchedTopicId:
        typeof parsed.matchedTopicId === "number"
          ? parsed.matchedTopicId
          : null,
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : 0.75,
      reasoning: parsed.reasoning || "Classificado via IA",
      shouldCreateNew: parsed.shouldCreateNew === true,
    };
  } catch (err: any) {
    console.error("[AI Analysis Error]", err);
    return {
      matchedDisciplineId: heuristicDisc.discipline
        ? heuristicDisc.discipline.id
        : null,
      matchedTopicId: null,
      confidence: heuristicDisc.confidence,
      reasoning: heuristicDisc.reason || "Heurística padrão (erro na IA)",
      shouldCreateNew: false,
    };
  }
}
