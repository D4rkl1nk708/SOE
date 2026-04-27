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
      console.log(
        `[Lab] Processando PDF: ${input.fileName} (${(input.base64.length / 1024).toFixed(1)} KB)`,
      );
      try {
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        const pdfParse = require("pdf-parse/lib/pdf-parse.js");

        const buffer = Buffer.from(input.base64, "base64");
        const data = await pdfParse(buffer);
        const fullText = data.text;

        if (!fullText || fullText.trim().length < 50) {
          throw new Error("O PDF parece não conter texto extraível.");
        }

        console.log(`[Lab] Texto extraído: ${fullText.length} caracteres.`);

        // Estratégia de Chunks (Pedaços) para lidar com PDFs grandes (200+ questões)
        const CHUNK_SIZE = 35000;
        const chunks: string[] = [];
        for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
          chunks.push(fullText.substring(i, i + CHUNK_SIZE + 2000)); // Pequeno overlap de 2k para não cortar questões
        }

        console.log(`[Lab] PDF dividido em ${chunks.length} partes.`);
        const allQuestions: any[] = [];

        for (let i = 0; i < chunks.length; i++) {
          console.log(`[Lab] Processando parte ${i + 1}/${chunks.length}...`);
          const chunkText = chunks[i];
          const prompt = `Você é um minerador de questões de elite. Extraia TODAS as questões deste pedaço de PDF.
REGRAS:
1. Identifique statement, alternatives, correctAnswer (letra), subject e topic.
2. Se encontrar textos de apoio, inclua em "supportText".
3. Retorne APENAS um array JSON. Se não houver questões completas, retorne [].

TEXTO DO PDF (PARTE ${i + 1}):
${chunkText}`;

          const rawAiResponse = await callAiProvider(
            input.provider,
            input.apiKey,
            prompt,
            12000,
          );

          try {
            const chunkQuestions = extractJSON(rawAiResponse);
            if (Array.isArray(chunkQuestions)) {
              // Evitar duplicatas causadas pelo overlap (pelo enunciado)
              for (const q of chunkQuestions) {
                if (
                  !allQuestions.some(
                    (existing) => existing.statement === q.statement,
                  )
                ) {
                  allQuestions.push(q);
                }
              }
            }
          } catch (e) {
            console.warn(
              `[Lab] Falha ao extrair JSON da parte ${i + 1}, pulando...`,
            );
          }
        }

        if (allQuestions.length === 0) {
          throw new Error("Não consegui identificar questões válidas.");
        }

        console.log(
          `[Lab] Mineração concluída. Total: ${allQuestions.length} questões.`,
        );

        const storagePath = path.join(process.cwd(), "data", "mined_exams");
        if (!fs.existsSync(storagePath))
          fs.mkdirSync(storagePath, { recursive: true });

        const safeName = input.fileName
          .replace(".pdf", "")
          .replace(/[^a-z0-9]/gi, "_");
        const outputFileName = `questoes_${safeName}_${Date.now()}.json`;
        fs.writeFileSync(
          path.join(storagePath, outputFileName),
          JSON.stringify(allQuestions, null, 2),
        );

        return {
          success: true,
          count: allQuestions.length,
          fileName: outputFileName,
        };
      } catch (err: any) {
        console.error(`[Lab Error] ${err.message}`);
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

  getIntegratedQuestions: protectedProcedure
    .input(z.object({ topicId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
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

      // Filter by topic if requested.
      // We try to match the topic name from the mined question with the topic name in the DB.
      if (input?.topicId) {
        const topic = await db.getTopicById(input.topicId, ctx.user.id);
        if (topic) {
          const topicNameLower = topic.name.toLowerCase();
          return allQuestions.filter(
            (q) =>
              (q.topic && q.topic.toLowerCase() === topicNameLower) ||
              (q.subject && q.subject.toLowerCase() === topicNameLower),
          );
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
      const topicList = topics.map((t: any) => t.name).join(", ");
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

  registerIntegratedResponse: protectedProcedure
    .input(
      z.object({
        topicId: z.number(),
        isCorrect: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const storage = await import("./jsonStorage");
      await storage.updateTopicPerformance(input.topicId, ctx.user.id, {
        correctCount: input.isCorrect ? 1 : 0,
        errorCount: input.isCorrect ? 0 : 1,
      });
      return { success: true };
    }),
});
