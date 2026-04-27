import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { callAiProvider } from "./aiProviders";
import { extractJSON } from "./mentorRouter";
import path from "path";
import fs from "fs";

// User agent para evitar bloqueios
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const labRouter = router({
  processPdf: protectedProcedure
    .input(
      z.object({
        base64: z.string(),
        fileName: z.string(),
        apiKey: z.string(),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const buffer = Buffer.from(input.base64, "base64");
        // @ts-ignore
        const pdfParse =
          typeof require !== "undefined"
            ? require("pdf-parse")
            : (await import("pdf-parse")).default;
        const data = await pdfParse(buffer);
        const fullText = data.text;

        if (fullText.trim().length < 100) throw new Error("PDF sem texto.");

        const prompt = `Você é um minerador de questões de concursos de elite. 
Sua tarefa é extrair questões de um PDF com 100% de precisão.

REGRAS CRÍTICAS:
1. TEXTO DE APOIO (supportText): Identifique se existe um texto base (geralmente começando com "Texto I", "Leia o texto", ou um fragmento de lei) que serve para uma ou mais questões seguintes. Se houver, copie esse texto integralmente para o campo "supportText" de CADA questão que dependa dele.
2. ESTRUTURA: Extraia statement (enunciado), alternatives (A,B,C,D,E), correctAnswer (apenas a letra), subject (matéria) e topic (assunto).
3. FORMATO: Retorne APENAS um array JSON.

TEXTO DO PDF:
${fullText.substring(0, 25000)}`;

        const rawAiResponse = await callAiProvider(
          input.provider,
          input.apiKey,
          prompt,
          8192,
        );
        const questions = extractJSON(rawAiResponse) as any[];

        const storagePath = path.join(process.cwd(), "data", "mined_exams");
        if (!fs.existsSync(storagePath))
          fs.mkdirSync(storagePath, { recursive: true });

        const safeName = input.fileName
          .replace(".pdf", "")
          .replace(/[^a-z0-9]/gi, "_");
        const outputFileName = `questoes_${safeName}_${Date.now()}.json`;
        fs.writeFileSync(
          path.join(storagePath, outputFileName),
          JSON.stringify(questions, null, 2),
        );

        return {
          success: true,
          count: questions.length,
          fileName: outputFileName,
        };
      } catch (err: any) {
        throw new Error(err.message);
      }
    }),

  importJson: protectedProcedure
    .input(
      z.object({
        base64: z.string(),
        fileName: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const buffer = Buffer.from(input.base64, "base64");
        const storagePath = path.join(process.cwd(), "data", "mined_exams");
        if (!fs.existsSync(storagePath))
          fs.mkdirSync(storagePath, { recursive: true });

        const filePath = path.join(storagePath, input.fileName);
        fs.writeFileSync(filePath, buffer);
        return { success: true };
      } catch (err: any) {
        throw new Error(`Erro ao importar: ${err.message}`);
      }
    }),

  searchOnlineExams: protectedProcedure
    .input(z.object({ banca: z.string(), cargo: z.string(), ano: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const query =
          `${input.banca} ${input.cargo} ${input.ano} prova pdf download`.replace(
            / /g,
            "+",
          );

        // Tentamos o Google (modo mobile/simples) que é mais resiliente a buscas de PDF
        const searchUrl = `https://www.google.com/search?q=${query}&gbv=1`; // gbv=1 força versão sem JS

        const response = await fetch(searchUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          },
        });
        const html = await response.text();

        const results: { title: string; url: string }[] = [];
        const uniqueLinks = new Set<string>();

        // O Google retorna links no formato /url?q=LINK
        const linkRegex =
          /<a href="\/url\?q=([^&"]+\.pdf[^&"]*|[^&"]+provas[^&"]*)/gi;
        let match;

        while ((match = linkRegex.exec(html)) !== null) {
          let url = decodeURIComponent(match[1]);

          if (!uniqueLinks.has(url) && url.startsWith("http")) {
            uniqueLinks.add(url);

            // Tenta extrair um título amigável da URL
            let title =
              url
                .split("/")
                .pop()
                ?.replace(/(-|_|\.pdf)/g, " ")
                .toUpperCase() || "Prova Localizada";
            if (title.length > 60) title = title.substring(0, 57) + "...";

            results.push({ title, url });
          }
        }

        // Se não encontrar nada no Google, tentamos o DuckDuckGo como backup
        if (results.length === 0) {
          const ddgUrl = `https://html.duckduckgo.com/html/?q=${query}`;
          const ddgRes = await fetch(ddgUrl, {
            headers: { "User-Agent": USER_AGENT },
          });
          const ddgHtml = await ddgRes.text();
          const ddgRegex =
            /href="([^"]+\.pdf|[^"]+provas[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
          let ddgMatch;
          while ((ddgMatch = ddgRegex.exec(ddgHtml)) !== null) {
            let url = ddgMatch[1];
            if (url.includes("uddg="))
              url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]);
            if (!uniqueLinks.has(url) && url.startsWith("http")) {
              uniqueLinks.add(url);
              results.push({
                title: ddgMatch[2]
                  .replace(/<[^>]*>?/gm, "")
                  .trim()
                  .substring(0, 60),
                url,
              });
            }
          }
        }

        return results.slice(0, 10);
      } catch (err: any) {
        throw new Error(`Busca falhou: ${err.message}`);
      }
    }),

  downloadFromUrl: protectedProcedure
    .input(z.object({ url: z.string(), fileName: z.string() }))
    .mutation(async ({ input }) => {
      try {
        let finalPdfUrl = input.url;

        // Se NÃO for um link direto de PDF, tentamos "descobrir" o PDF dentro da página
        if (!input.url.toLowerCase().endsWith(".pdf")) {
          const detailRes = await fetch(input.url, {
            headers: { "User-Agent": USER_AGENT },
          });
          const detailHtml = await detailRes.text();

          // Busca por qualquer link que termine em .pdf na página
          const pdfRegex = /href="(https?:\/\/[^"]+\.pdf)"/i;
          const match = detailHtml.match(pdfRegex);

          if (match) {
            finalPdfUrl = match[1];
          } else {
            // Tenta uma busca mais agressiva por links relativos ou ocultos
            const fallbackRegex = /href="([^"]+\.pdf)"/i;
            const fallbackMatch = detailHtml.match(fallbackRegex);
            if (fallbackMatch) {
              const baseUrl = new URL(input.url).origin;
              finalPdfUrl = fallbackMatch[1].startsWith("http")
                ? fallbackMatch[1]
                : baseUrl + fallbackMatch[1];
            } else {
              throw new Error(
                "Não encontrei um link direto de PDF nesta página. Tente outro resultado.",
              );
            }
          }
        }

        // Passo Final: Baixar o PDF
        const pdfRes = await fetch(finalPdfUrl, {
          headers: { "User-Agent": USER_AGENT },
        });
        if (!pdfRes.ok)
          throw new Error("O link do PDF parece estar protegido ou offline.");

        const buffer = await pdfRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");

        return { base64, fileName: input.fileName };
      } catch (err: any) {
        throw new Error(`Erro no download: ${err.message}`);
      }
    }),

  integrateExam: protectedProcedure
    .input(z.object({ fileName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const storagePath = path.join(process.cwd(), "data", "mined_exams");
      const filePath = path.join(storagePath, input.fileName);
      const questions = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const userId = ctx.user.id;
      const db = await import("./db");
      const contestId = input.fileName.replace(".json", "");

      for (const q of questions) {
        const disciplines = await db.getDisciplinesByUser(userId);
        const subjectName = q.subject || "Geral";
        let disc = disciplines.find(
          (d) => d.name.toLowerCase() === subjectName.toLowerCase(),
        );
        if (!disc) {
          const { id } = await db.createDiscipline({
            userId,
            name: subjectName,
            color: "var(--primary)",
            weight: 1,
          });
          disc = { id } as any;
        }

        const topics = await db.getTopicsByUser(userId, {
          disciplineId: (disc as any).id,
        });
        const topicName = q.topic || "Geral";
        let top = topics.find(
          (t) => t.name.toLowerCase() === topicName.toLowerCase(),
        );
        if (!top) {
          const { id } = await db.createTopic({
            userId,
            disciplineId: (disc as any).id,
            name: topicName,
            studyDate: new Date().toISOString(),
            notes: `Minerado: ${contestId}`,
          });
          top = { id } as any;
        }

        await db.saveQuestionError({
          userId,
          topicId: (top as any).id,
          disciplineId: (disc as any).id,
          banca: "IA",
          contest: contestId,
          statement: q.statement,
          supportText: q.supportText,
          alternatives: Object.entries(q.alternatives || {}).map(
            ([letter, text]) => ({ letter, text: String(text) }),
          ),
          correctAnswer: q.correctAnswer,
          source: "mined",
        });
      }
      return { success: true };
    }),

  getIntegratedQuestions: protectedProcedure.query(async ({ ctx }) => {
    const db = await import("./db");
    const storagePath = path.join(process.cwd(), "data", "mined_exams");
    if (!fs.existsSync(storagePath)) return [];

    const files = fs
      .readdirSync(storagePath)
      .filter((f) => f.endsWith(".json"));
    const allQuestions: any[] = [];

    for (const f of files) {
      const contestId = f.replace(".json", "");
      if (await db.checkExamIntegrated(contestId, ctx.user.id)) {
        const content = JSON.parse(
          fs.readFileSync(path.join(storagePath, f), "utf-8"),
        );
        const questionsWithMeta = content.map((q: any, idx: number) => ({
          ...q,
          id: `${contestId}_${idx}`,
          contest: contestId,
          banca: "IA",
          alternatives: Array.isArray(q.alternatives)
            ? q.alternatives
            : Object.entries(q.alternatives || {}).map(([letter, text]) => ({
                letter,
                text: String(text),
              })),
        }));
        allQuestions.push(...questionsWithMeta);
      }
    }
    return allQuestions;
  }),

  deleteIntegratedExam: protectedProcedure
    .input(z.object({ fileName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await import("./db");
      const contestId = input.fileName.replace(".json", "");
      await db.deleteQuestionsByContest(contestId, ctx.user.id);
      return { success: true };
    }),

  listHistory: protectedProcedure.query(async ({ ctx }) => {
    const storagePath = path.join(process.cwd(), "data", "mined_exams");
    if (!fs.existsSync(storagePath)) return [];
    const db = await import("./db");
    const files = fs
      .readdirSync(storagePath)
      .filter((f) => f.endsWith(".json"));
    const history = [];

    for (const f of files) {
      const filePath = path.join(storagePath, f);
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const contestId = f.replace(".json", "");
      const isIntegrated = await db.checkExamIntegrated(contestId, ctx.user.id);

      history.push({
        name: f,
        date: fs.statSync(filePath).mtime.toLocaleDateString(),
        questionCount: content.length,
        isIntegrated,
        questions: content,
      });
    }
    return history.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }),

  deleteMinedFile: protectedProcedure
    .input(z.object({ fileName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await import("./db");
        const storagePath = path.join(process.cwd(), "data", "mined_exams");
        const filePath = path.join(storagePath, input.fileName);
        const contestId = input.fileName.replace(".json", "");
        await db.deleteQuestionsByContest(contestId, ctx.user.id);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return { success: true };
      } catch (err: any) {
        throw new Error(`Erro ao apagar: ${err.message}`);
      }
    }),

  analyzeBancaTrend: protectedProcedure
    .input(
      z.object({
        fileNames: z.array(z.string()),
        apiKey: z.string(),
        provider: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const storagePath = path.join(process.cwd(), "data", "mined_exams");
      let combinedContent = "";
      for (const f of input.fileNames) {
        const content = JSON.parse(
          fs.readFileSync(path.join(storagePath, f), "utf-8"),
        );
        combinedContent += `\nPROVA: ${f}\nQUESTÕES:\n${JSON.stringify(content.map((q: any) => ({ s: q.statement, t: q.topic, sub: q.subject })))}`;
      }
      const prompt = `Você é um Analista de Inteligência de Concursos. Analise os dados das provas e gere um relatório de "Raio-X de Tendência".\n\nDADOS:\n${combinedContent.substring(0, 15000)}`;
      const analysis = await callAiProvider(
        input.provider as any,
        input.apiKey,
        prompt,
        4000,
      );
      return { analysis };
    }),

  mapToEdital: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        apiKey: z.string(),
        provider: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await import("./db");
      const storagePath = path.join(process.cwd(), "data", "mined_exams");
      const questions = JSON.parse(
        fs.readFileSync(path.join(storagePath, input.fileName), "utf-8"),
      );
      const topics = await db.getTopicsByUser(ctx.user.id, {});
      const topicList = topics.map((t) => t.name).join(", ");
      const prompt = `Cruze as questões desta prova com os tópicos do meu Edital.\nQUESTÕES: ${questions
        .map((q: any) => q.statement)
        .join(" | ")
        .substring(0, 5000)}\nMEU EDITAL: ${topicList}`;
      const mappingRaw = await callAiProvider(
        input.provider as any,
        input.apiKey,
        prompt,
        2000,
      );
      return extractJSON(mappingRaw);
    }),

  getJson: protectedProcedure
    .input(z.object({ fileName: z.string() }))
    .query(async ({ input }) => {
      const filePath = path.join(
        process.cwd(),
        "data",
        "mined_exams",
        input.fileName,
      );
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }),
});
