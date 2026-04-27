import "dotenv/config"; // Restart trigger: 2026-04-22T15:55
import os from "os";
import path from "path";
import fs from "fs";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./serveStatic";
import * as storage from "../jsonStorage";
import tecProxy from "../tecProxy";
import { normalizeString, isFuzzyMatch } from "../../shared/utils";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function createApp() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ── Global CORS for all /api/sync/* routes (needed for Android → PC) ──
  app.use("/api/sync", (req: any, res: any, next: any) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization",
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Also apply CORS to /api/backup/* routes
  app.use("/api/backup", (req: any, res: any, next: any) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // CORS for TEC real-time push (userscript Tampermonkey)
  app.use("/api/tec", (req: any, res: any, next: any) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, X-SOE-Token",
    );
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // OAuth callback under /api/oauth/callback
  // ── Proxy Diário Oficial da União (evita CORS no browser) ─────────────────
  // Route for capturing debug logs from the TEC content script
  app.post("/api/_debug_log", (req: any, res: any) => {
    const { msg } = req.body;
    if (msg) {
      // console.log(`[TEC CONTENT SCRIPT] ${msg}`);
    }
    res.json({ ok: true });
  });

  app.use("/api/dou-proxy", async (req: any, res: any) => {
    try {
      const name = req.query.name as string;
      if (!name || name.trim().length < 3) {
        return res.status(400).json({ error: "Nome inválido" });
      }

      const trimmed = name.trim();

      // O DOU expõe uma API JSON interna usada pelo portal.
      // Endpoint descoberto inspecionando as requisições XHR do site.
      const apiURL = "https://www.in.gov.br/consulta/-/buscar/dou";
      const params = new URLSearchParams({
        q: `"${trimmed}"`,
        s: "todos",
        exactDate: "all",
        sortType: "0",
        delta: "20",
        currentPage: "1",
      });

      const response = await fetch(`${apiURL}?${params.toString()}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "application/json, text/html, */*",
          "Accept-Language": "pt-BR,pt;q=0.9",
          Referer: "https://www.in.gov.br/",
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: AbortSignal.timeout(25000),
      });

      const contentType = response.headers.get("content-type") ?? "";

      // Se retornou JSON direto, ótimo
      if (contentType.includes("application/json")) {
        const json = await response.json();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.json(json);
      }

      // Senão, tenta a API de busca interna (endpoint AJAX do Liferay que o DOU usa)
      const ajaxURL = `https://www.in.gov.br/consulta/-/buscar/dou`;
      const ajaxParams = new URLSearchParams({
        q: `"${trimmed}"`,
        s: "todos",
        exactDate: "all",
        sortType: "0",
      });

      const ajaxResp = await fetch(`${ajaxURL}?${ajaxParams}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(25000),
      });

      if (!ajaxResp.ok) {
        return res
          .status(ajaxResp.status)
          .json({ error: `DOU retornou ${ajaxResp.status}` });
      }

      const html = await ajaxResp.text();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });

  // ── Proxy TEC para Mobile (Navegador Integrado) ───────────────────────────
  app.use("/api/tec-browser", tecProxy);

  // ── Proxy DOU via API de pesquisa JSON ─────────────────────────────────────
  // O portal in.gov.br usa uma API REST interna. Este endpoint a chama
  // diretamente e devolve JSON estruturado pro cliente.
  app.get("/api/dou-search", async (req: any, res: any) => {
    try {
      const name = req.query.name as string;
      if (!name || name.trim().length < 3) {
        return res.status(400).json({ error: "Nome inválido" });
      }

      const trimmed = name.trim();

      // API de busca JSON do DOU (endpoint interno do Liferay/portal)
      // Descoberto via DevTools no portal in.gov.br
      const endpoints = [
        // Endpoint 1: API REST do DOU
        `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(`"${trimmed}"`)}&s=todos&exactDate=all&sortType=0&delta=20&currentPage=1`,
        // Endpoint 2: versão alternativa
        `https://in.gov.br/web/guest/consulta/-/buscar/dou?q=${encodeURIComponent(`"${trimmed}"`)}&s=todos`,
      ];

      let lastError = "";
      for (const url of endpoints) {
        try {
          const r = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible)",
              Accept: "application/json,text/html,*/*",
              "Accept-Language": "pt-BR",
            },
            signal: AbortSignal.timeout(20000),
          });

          const ct = r.headers.get("content-type") ?? "";
          if (ct.includes("json")) {
            const json = await r.json();
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Access-Control-Allow-Origin", "*");
            return res.json({ source: "json", data: json });
          }

          const html = await r.text();

          // Extrai dados do HTML usando regex (mais robusto que DOMParser no Node)
          const results: any[] = [];

          // Padrão 1: data-id nos elementos
          const dataIdPattern =
            /data-id="([^"]+)"[^>]*>[\s\S]*?<[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/[^>]*>/gi;
          let m;
          while ((m = dataIdPattern.exec(html)) !== null) {
            results.push({
              id: m[1],
              title: m[2].replace(/<[^>]+>/g, "").trim(),
            });
          }

          // Padrão 2: links de resultados /web/dou/-/...
          const linkPattern =
            /href="(\/web\/dou\/-\/[^"]+)"[^>]*>\s*<[^>]*>([\s\S]*?)<\/[^>]*>/gi;
          while ((m = linkPattern.exec(html)) !== null) {
            const title = m[2].replace(/<[^>]+>/g, "").trim();
            if (title.length > 5) {
              results.push({
                id: m[1],
                title,
                url: `https://www.in.gov.br${m[1]}`,
              });
            }
          }

          // Padrão 3: contar total de resultados
          const totalMatch =
            html.match(/(\d+)\s+resultado[s]?\s+encontrado/i) ||
            html.match(/"total"\s*:\s*(\d+)/i) ||
            html.match(/totalHits["']?\s*:\s*(\d+)/i) ||
            html.match(/(\d+)\s+publicaç/i);
          const total = totalMatch ? parseInt(totalMatch[1]) : results.length;

          // Padrão 4: extrair JSON embutido no HTML (scripts com dados)
          const jsonScriptMatch =
            html.match(
              /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/i,
            ) || html.match(/var\s+resultados\s*=\s*(\[[\s\S]*?\]);\s*</i);
          if (jsonScriptMatch) {
            try {
              const parsed = JSON.parse(jsonScriptMatch[1]);
              const items =
                parsed.results ||
                parsed.items ||
                (Array.isArray(parsed) ? parsed : []);
              items.forEach((item: any, i: number) => {
                results.push({
                  id: item.id || item.urlTitle || `json-${i}`,
                  title: item.title || item.titulo || item.name || "",
                  date: item.pubDate || item.data || "",
                  url: item.url || item.urlTitle || "",
                });
              });
            } catch {
              /* ignora */
            }
          }

          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          return res.json({
            source: "html-parsed",
            results,
            total,
            rawLength: html.length,
          });
        } catch (err: any) {
          lastError = String(err?.message ?? err);
          continue;
        }
      }

      return res
        .status(502)
        .json({ error: `Todos os endpoints falharam: ${lastError}` });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });

  registerOAuthRoutes(app);

  // ── TEC Caderno Push (userscript Tampermonkey → SOE em tempo real) ────────
  app.post("/api/_debug_log", express.json(), (req: any, res: any) => {
    require("fs").appendFileSync(
      "/tmp/soe_webview.log",
      JSON.stringify(req.body) + "\n",
    );
    res.json({ ok: true });
  });

  /**
   * POST /api/tec/caderno-push
   * Recebe estatísticas de um caderno TEC enviadas pelo userscript.
   * Autenticado via header X-SOE-Token (gerado em import.generatePushToken).
   *
   * Body: { cadernoId, cadernoUrl, disciplina, rows: [{ disciplina, assunto, acertos, erros }] }
   */
  app.post("/api/tec/caderno-push", async (req: any, res: any) => {
    try {
      const token =
        (req.headers["x-soe-token"] as string) || (req.query.token as string);
      if (!token)
        return res.status(401).json({
          error: "Header X-SOE-Token ausente ou query ?token= não informado",
        });

      const user = await storage.getUserByPushToken(token);
      if (!user)
        return res.status(401).json({
          error:
            "Token inválido. Gere um novo token em: Mentor → Cadernos Tempo Real → Gerar Token.",
        });

      const {
        cadernoId,
        cadernoUrl,
        disciplina: disciplinaHint,
        rows,
      } = req.body as {
        cadernoId: string;
        cadernoUrl: string;
        disciplina: string;
        rows: Array<{
          disciplina: string;
          assunto: string;
          acertos: number;
          erros: number;
          total?: number;
          incidencia?: number; // 0–100 ou 0.0–1.0 do TEC
          totalQuestoesBanca?: number;
          bancaDominante?: string;
          dificuldade?: number;
        }>;
      };

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res
          .status(400)
          .json({ error: "Nenhum dado recebido no campo 'rows'" });
      }

      const fmtDate = (d: Date) => d.toISOString().split("T")[0];

      // Helpers reusados do fluxo XLSX
      function getScheduleParamsLocal(settings: any) {
        return {
          testIntervalDays: settings?.testIntervalDays ?? 3,
          revisionIntervalDays: settings?.revisionIntervalDays ?? 25,
          revisionSecondPhaseDays: settings?.revisionSecondPhaseDays ?? 50,
        };
      }

      function calculateRevisionDatesLocal(studyDate: Date, p: any) {
        const revisions: any[] = [];
        let cur = new Date(studyDate);
        const ms = (d: number) => d * 86400000;
        for (let i = 1; i <= 5; i++) {
          cur = new Date(cur.getTime() + ms(p.revisionIntervalDays));
          revisions.push({
            date: new Date(cur),
            revisionNumber: i,
            type: "revision",
          });
        }
        for (let i = 6; i <= 15; i++) {
          cur = new Date(cur.getTime() + ms(p.revisionSecondPhaseDays));
          revisions.push({
            date: new Date(cur),
            revisionNumber: i,
            type: "revision",
          });
        }
        return revisions;
      }

      function generateTestsLocal(
        studyDate: Date,
        revisions: any[],
        intervalDays: number,
      ) {
        const tests: any[] = [];
        let prev = new Date(studyDate);
        let n = 1;
        const ms = (d: number) => d * 86400000;
        for (const rev of revisions) {
          let cur = new Date(prev.getTime() + intervalDays * ms(1));
          while (cur.getTime() < rev.date.getTime() - 2 * ms(1)) {
            tests.push({
              date: new Date(cur),
              revisionNumber: n++,
              type: "test",
            });
            cur = new Date(
              cur.getTime() +
                (intervalDays +
                  Math.floor(Math.random() * Math.max(1, intervalDays))) *
                  ms(1),
            );
          }
          prev = rev.date;
        }
        return tests;
      }

      let disciplines = await storage.getDisciplinesByUser(user.id);
      let topics = await storage.getTopicsByUser(user.id);
      let updated = 0,
        created = 0;
      const topicsWithNewErrors: {
        topicId: number;
        topicName: string;
        newErrors: number;
      }[] = [];

      for (const row of rows) {
        const discName = (
          row.disciplina ||
          disciplinaHint ||
          "TEC Concursos"
        ).trim();
        const assuntoName = (row.assunto || "").trim();
        if (!assuntoName) continue;

        // Match or create discipline
        let disc = disciplines.find((d) => isFuzzyMatch(d.name, discName));
        if (!disc) {
          const { id } = await storage.createDiscipline({
            userId: user.id,
            name: discName,
            color: "#6366f1",
            weight: 1,
          });
          disciplines = await storage.getDisciplinesByUser(user.id);
          disc = disciplines.find((d) => d.id === id)!;
        }

        // Match or create topic
        let topic = topics.find(
          (t) =>
            t.disciplineId === disc!.id && isFuzzyMatch(t.name, assuntoName),
        );

        if (topic) {
          const prevCorrect = topic.performance?.correctCount ?? 0;
          const prevErrors = topic.performance?.errorCount ?? 0;

          if (row.acertos === prevCorrect && row.erros === prevErrors) {
            // Nada mudou no desempenho comparado ao salvo no sistema.
            continue;
          }

          const newErrors = row.erros - prevErrors;
          await storage.setTopicPerformance(topic.id, user.id, {
            correctCount: row.acertos,
            errorCount: row.erros,
            ...(row.incidencia !== undefined
              ? {
                  incidencia:
                    row.incidencia > 1 ? row.incidencia / 100 : row.incidencia,
                }
              : {}),
            ...(row.totalQuestoesBanca !== undefined
              ? { totalQuestoesBanca: row.totalQuestoesBanca }
              : {}),
            ...(row.bancaDominante
              ? { bancaDominante: row.bancaDominante }
              : {}),
            ...(row.dificuldade !== undefined
              ? { dificuldade: row.dificuldade }
              : {}),
          });
          if (newErrors > 0)
            topicsWithNewErrors.push({
              topicId: topic.id,
              topicName: topic.name,
              newErrors,
            });
          updated++;
        } else {
          const studyDate = fmtDate(new Date());
          const { id: topicId } = await storage.createTopic({
            userId: user.id,
            disciplineId: disc!.id,
            name: assuntoName,
            studyDate,
            notes: null,
          });
          const settings = await storage.getUserSettings(user.id);
          const params = getScheduleParamsLocal(settings);
          const studyDateObj = new Date(studyDate);
          const revisions = calculateRevisionDatesLocal(studyDateObj, params);
          const tests = generateTestsLocal(
            studyDateObj,
            revisions,
            params.testIntervalDays,
          );
          const allActs = [...revisions, ...tests].sort(
            (a, b) => a.date.getTime() - b.date.getTime(),
          );
          await storage.createRevisions(
            allActs.map((a) => ({
              userId: user.id,
              topicId,
              scheduledDate: fmtDate(a.date),
              type: a.type as "revision" | "test",
              revisionNumber: a.revisionNumber,
              completed: false,
            })),
          );
          await storage.setTopicPerformance(topicId, user.id, {
            correctCount: row.acertos,
            errorCount: row.erros,
          });
          topics = await storage.getTopicsByUser(user.id);
          created++;
        }
      }

      // Salva snapshot TEC (igual ao fluxo XLSX)
      const allTopicsNow = await storage.getTopicsByUser(user.id);
      const allDiscsNow = await storage.getDisciplinesByUser(user.id);
      const snapshotTopics = allTopicsNow
        .filter((t) => t.performance && t.performance.questionsResolved > 0)
        .map((t) => ({
          topicName: t.name,
          disciplineName:
            allDiscsNow.find((d) => d.id === t.disciplineId)?.name ??
            "Desconhecida",
          questionsResolved: t.performance!.questionsResolved,
          correctCount: t.performance!.correctCount,
          errorCount: t.performance!.errorCount,
          accuracy: t.performance!.accuracy,
        }));
      await storage.saveTecSnapshot(user.id, snapshotTopics);

      // Registra caderno como conhecido
      await storage.saveCadernoTec(user.id, {
        cadernoId: cadernoId || "unknown",
        cadernoUrl: cadernoUrl || "",
        disciplina: disciplinaHint || rows[0]?.disciplina || "Desconhecida",
        lastSync: new Date().toISOString(),
        topicsCount: rows.length,
      });

      res.json({
        success: true,
        updated,
        created,
        topicsWithNewErrors,
        message: `✓ ${updated} assunto(s) atualizado(s), ${created} criado(s). Snapshot salvo.`,
      });
    } catch (e: any) {
      console.error("[TEC Push]", e);
      res.status(500).json({ error: e.message ?? "Erro interno" });
    }
  });

  // Tracker de alertas (User -> Topic -> Timestamps de erros)
  const userErrorTracker = new Map<number, Map<number, number[]>>();

  // Cache de deduplicação em memória (Key -> Timestamp)
  const tecDedupCache = new Map<string, number>();

  app.post(
    "/api/tec/increment",
    express.json({ limit: "2mb" }),
    async (req: any, res: any) => {
      try {
        const token =
          (req.headers["x-soe-token"] as string) || (req.query.token as string);
        if (!token) return res.status(401).json({ error: "Token ausente" });

        const user = await storage.getUserByPushToken(token);
        if (!user)
          return res.status(401).json({ error: "Push Token inválido" });

        const {
          cadernoId,
          cadernoUrl,
          disciplina: rawDisciplina,
          assunto: assuntoName,
          correctAdd,
          errorAdd,
          timeSpentSeconds,
          dedupKey,
        } = req.body;

        const disciplinaName = rawDisciplina || "TEC Concursos";

        // Deduplicação básica: se a mesma questão for enviada em menos de 15s, ignora
        if (dedupKey) {
          const now = Date.now();
          const lastSeen = tecDedupCache.get(dedupKey);
          if (lastSeen && now - lastSeen < 15000) {
            console.log(
              `[TEC SERVER] Deduplicando requisição para ${dedupKey}`,
            );
            return res.json({ ok: true, duplicated: true });
          }
          tecDedupCache.set(dedupKey, now);
          if (tecDedupCache.size > 1000) tecDedupCache.clear();
        }

        console.log(
          `[TEC SERVER] Incremento: ${assuntoName} [${disciplinaName}] (+${correctAdd}a, +${errorAdd}e, ${timeSpentSeconds}s)`,
        );

        if (!assuntoName)
          return res.status(400).json({ error: "Assunto obrigatório" });

        let disciplines = await storage.getDisciplinesByUser(user.id);
        let disc = disciplines.find((d) =>
          isFuzzyMatch(d.name, disciplinaName),
        );

        if (!disc) {
          const created = await storage.createDiscipline({
            userId: user.id,
            name: disciplinaName,
            color: "#6366f1",
            weight: 1,
          });
          disc = Object.assign({}, created, { id: created.id }) as any;
          disciplines = await storage.getDisciplinesByUser(user.id);
        }

        // Add time to discipline
        if (timeSpentSeconds && timeSpentSeconds > 0) {
          await storage.updateDiscipline(disc!.id, user.id, {
            studyTimeSeconds: (disc!.studyTimeSeconds || 0) + timeSpentSeconds,
          });
        }

        let topics = await storage.getTopicsByUser(user.id);
        let topic = topics.find(
          (t) =>
            t.disciplineId === disc!.id && isFuzzyMatch(t.name, assuntoName),
        );

        let topicId = 0;
        if (topic) {
          console.log(
            `[TEC SERVER] Topico encontrado: ${topic.name} (ID: ${topic.id})`,
          );
          topicId = topic.id;
          const prevCorrect = topic.performance?.correctCount ?? 0;
          const prevErrors = topic.performance?.errorCount ?? 0;
          const newCorrect = prevCorrect + (correctAdd || 0);
          const newErrors = prevErrors + (errorAdd || 0);

          await storage.setTopicPerformance(topic.id, user.id, {
            correctCount: newCorrect,
            errorCount: newErrors,
          });
          if (timeSpentSeconds && timeSpentSeconds > 0) {
            await storage.updateTopic(topic.id, user.id, {
              studyTimeSeconds:
                (topic.studyTimeSeconds || 0) + timeSpentSeconds,
            });
          }
        } else {
          const studyDate = new Date().toISOString();
          const created = await storage.createTopic({
            userId: user.id,
            disciplineId: disc!.id,
            name: assuntoName,
            studyDate,
            notes: null,
          });
          topicId = created.id;
          await storage.setTopicPerformance(created.id, user.id, {
            correctCount: correctAdd || 0,
            errorCount: errorAdd || 0,
          });
          if (timeSpentSeconds && timeSpentSeconds > 0) {
            await storage.updateTopic(created.id, user.id, {
              studyTimeSeconds: timeSpentSeconds,
            });
          }
        }

        // Feature 3: Sirene de Ilusão de Competência
        let blockPage = false;
        let alertMessage = "";
        if (errorAdd && errorAdd > 0) {
          let topicsMap = userErrorTracker.get(user.id);
          if (!topicsMap) {
            topicsMap = new Map();
            userErrorTracker.set(user.id, topicsMap);
          }
          let times = topicsMap.get(topicId) || [];
          const now = Date.now();
          // Keep only errors from the last 3 minutes
          times = times.filter((t) => now - t < 3 * 60 * 1000);
          times.push(now);
          topicsMap.set(topicId, times);

          if (times.length >= 3) {
            blockPage = true;
            alertMessage = `⚠️ SOE Mentor: Sinto uma deficiência teórica de base aguda no assunto '${assuntoName}'. Você errou ${times.length} vezes em um curto espaço de tempo. Sugiro estancar o cansaço. Por favor, vá ler seu resumo / Grife a teoria novamente!`;
            topicsMap.set(topicId, []); // reseta
          }
        } else if (correctAdd && correctAdd > 0) {
          // Se acertou, pode limpar o contador daquele assunto
          const topicsMap = userErrorTracker.get(user.id);
          if (topicsMap && topicsMap.has(topicId)) {
            topicsMap.set(topicId, []);
          }
        }

        res.json({
          success: true,
          message: "Estatística incrementada com sucesso",
          blockPage,
          alertMessage,
        });
      } catch (e: any) {
        console.error("[TEC Increment]", e);
        res.status(500).json({ error: e.message ?? "Erro interno" });
      }
    },
  );

  /**
   * POST /api/tec/wrong-question
   * Recebe dados de uma questão que o usuário errou diretamente da extensão.
   */
  app.post(
    "/api/tec/wrong-question",
    express.json({ limit: "2mb" }),
    async (req: any, res: any) => {
      try {
        const token =
          (req.headers["x-soe-token"] as string) || (req.query.token as string);
        if (!token) return res.status(401).json({ error: "Token ausente" });

        const user = await storage.getUserByPushToken(token);
        if (!user)
          return res.status(401).json({ error: "Push Token inválido" });

        const {
          questionId,
          banca,
          year,
          contest,
          statement,
          alternatives,
          correctAnswer,
          userAnswer,
          resolution,
          disciplina: disciplinaName,
          assunto: assuntoName,
        } = req.body;

        if (!statement)
          return res.status(400).json({ error: "Statement is required" });

        let disciplines = await storage.getDisciplinesByUser(user.id);
        let discId = disciplines[0]?.id; // fallback
        let topId: number | undefined = undefined;

        // Match or create discipline and topic based on the names provided by the extension
        if (disciplinaName) {
          let disc = disciplines.find((d) =>
            isFuzzyMatch(d.name, disciplinaName),
          );
          if (!disc) {
            const created = await storage.createDiscipline({
              userId: user.id,
              name: disciplinaName,
              color: "#e74c3c",
              weight: 1,
            });
            discId = created.id;
            disciplines = await storage.getDisciplinesByUser(user.id);
          } else {
            discId = disc.id;
          }

          if (assuntoName && discId) {
            let topics = await storage.getTopicsByUser(user.id);
            let topic = topics.find(
              (t) =>
                t.disciplineId === discId && isFuzzyMatch(t.name, assuntoName),
            );
            if (!topic) {
              const created = await storage.createTopic({
                userId: user.id,
                disciplineId: discId,
                name: assuntoName,
                studyDate: new Date().toISOString(),
                notes: null,
              });
              topId = created.id;
            } else {
              topId = topic.id;
            }
          }
        }

        // Garantir que o topicId e disciplineId sejam passados corretamente para o storage
        await storage.saveQuestionError({
          userId: user.id,
          disciplineId: discId || 0,
          topicId: topId || 0,
          questionId,
          banca,
          year:
            typeof year === "number" ? year : parseInt(year, 10) || undefined,
          contest,
          statement,
          alternatives: alternatives || [],
          correctAnswer,
          userAnswer,
          resolution,
        });

        res.json({
          success: true,
          message: "Questão salva em Questões Erradas!",
        });
      } catch (e: any) {
        console.error("[TEC Wrong Question]", e);
        res.status(500).json({ error: e.message ?? "Erro interno" });
      }
    },
  );

  /**
   * POST /api/tec/ai-mentor
   * Consulta a IA do Mentor diretamente do Widget do TEC
   */
  app.post(
    "/api/tec/generate-flashcard",
    express.json({ limit: "2mb" }),
    async (req: any, res: any) => {
      try {
        const token =
          (req.headers["x-soe-token"] as string) || (req.query.token as string);
        if (!token) return res.status(401).json({ error: "Token ausente" });
        const user = await storage.getUserByPushToken(token);
        if (!user) return res.status(401).json({ error: "Token inválido" });

        const { questionId } = req.body;
        if (!questionId)
          return res.status(400).json({ error: "ID da questão ausente" });

        const errors = await storage.getQuestionErrorsByUser(user.id);
        const e = errors.items.find(
          (err: any) => err.questionId === questionId,
        );
        if (!e)
          return res
            .status(404)
            .json({ error: "Questão não encontrada no banco de erros." });

        const userKey = user?.settings?.aiApiKey;
        const userProv = user?.settings?.aiProvider || "gemini";
        const apiKey =
          userKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
        const finalProvider = userKey
          ? userProv
          : process.env.GEMINI_API_KEY
            ? "gemini"
            : "openai";

        if (!apiKey)
          return res
            .status(500)
            .json({ error: "Chave de API não configurada." });

        const correctText =
          e.alternatives?.find((a: any) => a.letter === e.correctAnswer)
            ?.text || "";
        const prompt = `Você é um professor de concursos públicos especialista em memorização ativa. 
Com base na questão abaixo que o aluno errou, crie UM flashcard (pergunta e resposta) para ajudar na memorização do conceito chave.

Questão: ${e.statement}
Gabarito: ${e.correctAnswer}${correctText ? ` — "${correctText}"` : ""}
${e.resolution ? `Resolução técnica: ${e.resolution.substring(0, 1000)}` : ""}

Retorne APENAS um JSON válido, sem blocos de código markdown, sem explicações extras, seguindo este formato:
{"front": "pergunta direta e objetiva (máx 2 linhas)", "back": "resposta clara com a regra fundamental (máx 3 linhas)"}`;

        let raw = "";
        if (finalProvider === "gemini") {
          const GEMINI_MODELS = [
            "gemini-3-flash-preview",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
          ];
          for (const model of GEMINI_MODELS) {
            try {
              const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                      maxOutputTokens: 512,
                      temperature: 0.4,
                    },
                  }),
                  signal: AbortSignal.timeout(30000),
                },
              );
              const d = (await r.json()) as any;
              if (d.candidates?.[0]?.content?.parts?.[0]?.text) {
                raw = d.candidates[0].content.parts[0].text;
                break;
              }
            } catch (e) {
              console.warn(`Flashcard: falha no modelo ${model}`, e);
            }
          }
        } else if (finalProvider === "openai") {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 512,
              temperature: 0.4,
            }),
            signal: AbortSignal.timeout(30000),
          });
          const d = await r.json();
          raw = d.choices?.[0]?.message?.content || "";
        }

        if (!raw) throw new Error("IA falhou ao gerar flashcard.");
        const clean = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);

        await storage.createFlashcard({
          userId: user.id,
          disciplineId: e.disciplineId,
          topicId: e.topicId || undefined,
          front: parsed.front,
          back: parsed.back,
        });
        await storage.markQuestionErrorFlashcardGenerated(e.id, user.id);

        res.json({ success: true, front: parsed.front, back: parsed.back });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    },
  );

  app.post(
    "/api/tec/ai-mentor",
    express.json({ limit: "2mb" }),
    async (req: any, res: any) => {
      try {
        const token =
          (req.headers["x-soe-token"] as string) || (req.query.token as string);
        let user = null;
        if (token) user = await storage.getUserByPushToken(token);

        const { questionText, subject, fatigue, discipline, questionId } =
          req.body;
        if (!questionText)
          return res.status(400).json({ error: "Texto da questão ausente" });

        // Fallback para API configurada pelo usuário, ou env
        const userKey = user?.settings?.aiApiKey;
        const userProv = user?.settings?.aiProvider || "gemini";

        const apiKey =
          userKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
        const finalProvider = userKey
          ? userProv
          : process.env.GEMINI_API_KEY
            ? "gemini"
            : "openai";

        if (!apiKey) {
          return res.status(500).json({
            error:
              "❌ Chave de API da IA não configurada. Por favor, adicione sua chave Gemini ou OpenAI na aba Perfil > Configurações de IA no SOE Desktop.",
          });
        }

        // Memory fetch (procurar notas de sobrevivência)
        let survivalNotes = "";
        let topicObj = null;
        if (user && subject && discipline) {
          const discs = await storage.getDisciplinesByUser(user.id);
          const disc = discs.find((d) => isFuzzyMatch(d.name, discipline));
          if (disc) {
            const topics = await storage.getTopicsByUser(user.id);
            topicObj = topics.find(
              (t) =>
                t.disciplineId === disc.id && isFuzzyMatch(t.name, subject),
            );
            if (topicObj && topicObj.notes) {
              survivalNotes = topicObj.notes;
              const mentorTipIdx = survivalNotes.indexOf("💡 Dica do Mentor:");
              if (mentorTipIdx !== -1) {
                survivalNotes = survivalNotes.substring(0, mentorTipIdx);
              }
            }
          }
        }

        let fatiguePrompt = "";
        if (fatigue && fatigue >= 2) {
          fatiguePrompt = `\n[ALERTA DE FADIGA: O aluno errou VÁRIAS opções recentemente] Ele está frustrado. Seja mais direto, acalme o aluno e foque apenas no pilar principal da teoria.`;
        }

        const prompt = `Você é o "Mentor SOE", o Assistente de Estudos focado em aprovação.
	O aluno errou ou travou nesta questão específica de ${subject || "concurso"} e precisa da sua ajuda urgente. Seu objetivo é fazer o aluno entender o ERRO dele de forma muito clara. Não poupe palavras necessárias para ele aprender de fato, mas não divague nem use jargões desnecessários. Seja incisivo, técnico e focado na resolução.
	
	REGRAS OBRIGATÓRIAS:
	1. NUNCA comece com saudações vazias (ex: "Olá", "Entendo a dificuldade").
	2. Explique exatamente o princípio ou a regra que resolve a questão. Use exemplos simples se ajudar.
	3. Se houver pegadinhas clássicas da banca sobre esse assunto, alerte-o!
	4. Estruture muito bem sua resposta usando markdown e parágrafos curtos. Destaque em **negrito** as palavras-chave vitais.
	5. Se existir algum **MACETE** ou **MNEMÔNICO** útil relacionado ao assunto, faça questão de ensiná-lo ao aluno como 'Dica de Sobrevivência'.
	6. Seja completo e aprofunde-se na teoria. Não termine a explicação de forma incompleta. Termine todas as frases. Sem limite de palavras, escreva o quanto for necessário para o entendimento total.
${fatiguePrompt}
${survivalNotes ? `\nAnotações atuais do aluno sobre o tema:\n"${survivalNotes.substring(0, 500)}"\nApoie-se ou corrija o resumo dele se necessário.` : ""}

Questão em análise:
${questionText}`;

        // Fallback entre modelos Gemini para contornar cotas esgotadas ou modelos indisponíveis
        const GEMINI_MODELS_FALLBACK = [
          "gemini-3-flash-preview",
          "gemini-2.5-flash",
          "gemini-2.0-flash",
          "gemini-1.5-flash",
        ];
        const callGeminiWithFallback = async (
          apiKey: string,
          prompt: string,
          maxOutputTokens = 2000,
        ): Promise<string> => {
          let lastError = "";
          for (const model of GEMINI_MODELS_FALLBACK) {
            const r = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { maxOutputTokens, temperature: 0.7 },
                }),
              },
            );
            const d = (await r.json()) as any;
            if (d.error) {
              const msg: string = d.error.message || "Erro Gemini";
              const isQuota =
                msg.toLowerCase().includes("quota") ||
                msg.toLowerCase().includes("exceeded") ||
                r.status === 429;
              const isNotFound =
                msg.toLowerCase().includes("not found") ||
                msg.toLowerCase().includes("not supported") ||
                r.status === 404;
              if (isQuota || isNotFound) {
                lastError = `[${model}] ${msg}`;
                console.warn(
                  `[Gemini] Modelo ${model} indisponível, tentando próximo...`,
                );
                continue;
              }
              throw new Error(msg);
            }
            return d.candidates?.[0]?.content?.parts?.[0]?.text || "";
          }
          throw new Error(
            `Cota Gemini esgotada em todos os modelos. ${lastError}`,
          );
        };

        let responseText = "";
        if (finalProvider === "gemini") {
          responseText =
            (await callGeminiWithFallback(apiKey, prompt, 4096)) ||
            "A IA não conseguiu gerar uma dica para esta questão.";
        } else if (finalProvider === "openai") {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "Você é um mentor direto e técnico. Não use saudações.",
                },
                { role: "user", content: prompt },
              ],
              max_tokens: 4096,
            }),
          });
          const d = await r.json();
          if (d.error) throw new Error(d.error.message || "Erro OpenAI");
          responseText =
            d.choices?.[0]?.message?.content ||
            "A IA não conseguiu gerar uma dica para esta questão.";
        } else if (finalProvider === "claude") {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307",
              max_tokens: 2000,
              messages: [{ role: "user", content: prompt }],
            }),
          });
          const d = await r.json();
          if (d.error) throw new Error(d.error.message || "Erro Claude");
          responseText =
            d.content?.[0]?.text ||
            "A IA não conseguiu gerar uma dica para esta questão.";
        }

        // Feature: Salvar como explicação da questão errada (Questões Erradas)
        if (user && questionId) {
          try {
            const errors = await storage.getQuestionErrorsByUser(user.id);
            const match = errors.items.find(
              (e: any) => e.questionId === questionId,
            );
            if (match) {
              await storage.saveQuestionErrorAnalysis(
                match.id,
                user.id,
                responseText,
              );
            }
          } catch (e) {}
        }

        res.json({ success: true, text: responseText });
      } catch (e: any) {
        console.error("[TEC AI Mentor]", e);
        res.status(500).json({ error: e.message ?? "Erro interno na IA" });
      }
    },
  );

  /**
   * POST /api/tec/cadernos-list
   * Recebe a lista de todos os cadernos do usuário detectados pelo content script.
   * Armazena para exibição no SOE e para syncing em background.
   */
  app.post("/api/tec/cadernos-list", async (req: any, res: any) => {
    try {
      const token =
        (req.headers["x-soe-token"] as string) || (req.query.token as string);
      if (!token)
        return res.status(401).json({ ok: false, error: "Token ausente" });
      const user = await storage.getUserByPushToken(token);
      if (!user)
        return res.status(401).json({ ok: false, error: "Token inválido" });

      const { cadernos } = req.body as {
        cadernos: Array<{
          id: string;
          nome: string;
          disciplina?: string;
          url: string;
          totalQuestoes?: number;
          assuntos?: number;
        }>;
      };

      if (!Array.isArray(cadernos) || cadernos.length === 0) {
        return res
          .status(400)
          .json({ ok: false, error: "Lista de cadernos vazia" });
      }

      // Salva cada caderno com metadados básicos (sem dados de desempenho ainda)
      const existingCadernos = await storage.getCadernosTec(user.id);
      const existingIds = new Set(existingCadernos.map((c) => c.cadernoId));
      let newCount = 0;

      for (const c of cadernos) {
        if (!existingIds.has(c.id)) {
          await storage.saveCadernoTec(user.id, {
            cadernoId: c.id,
            cadernoUrl: c.url,
            disciplina: c.disciplina || c.nome || "TEC Concursos",
            lastSync: new Date().toISOString(),
            topicsCount: c.assuntos || 0,
          });
          newCount++;
        }
      }

      res.json({
        ok: true,
        total: cadernos.length,
        newCount,
        message: `${cadernos.length} caderno(s) detectado(s), ${newCount} novo(s) registrado(s).`,
      });
    } catch (e: any) {
      console.error("[TEC Cadernos List]", e);
      res.status(500).json({ ok: false, error: e.message ?? "Erro interno" });
    }
  });

  /**
   * POST /api/tec/banca-increment
   * Incrementa stats de banca por assunto (acertos/erros por banca).
   */
  app.post("/api/tec/banca-increment", async (req: any, res: any) => {
    try {
      const token =
        (req.headers["x-soe-token"] as string) || (req.query.token as string);
      if (!token)
        return res.status(401).json({ ok: false, error: "Token ausente" });
      const user = await storage.getUserByPushToken(token);
      if (!user)
        return res.status(401).json({ ok: false, error: "Token inválido" });

      const { assunto, disciplina, banca, correctAdd, errorAdd } = req.body as {
        assunto: string;
        disciplina: string;
        banca: string;
        correctAdd: number;
        errorAdd: number;
      };

      if (!assunto || !banca)
        return res
          .status(400)
          .json({ ok: false, error: "assunto e banca obrigatórios" });

      const disciplines = await storage.getDisciplinesByUser(user.id);
      const topics = await storage.getTopicsByUser(user.id);

      const disc = disciplines.find((d) =>
        isFuzzyMatch(d.name, disciplina || ""),
      );
      if (!disc)
        return res.json({
          ok: false,
          error: "Disciplina não encontrada no SOE",
        });

      const topic = topics.find(
        (t) => t.disciplineId === disc.id && isFuzzyMatch(t.name, assunto),
      );
      if (!topic)
        return res.json({ ok: false, error: "Assunto não encontrado no SOE" });

      const prev = topic.performance?.bancaStats || {};
      const bancaPrev = prev[banca] || { correct: 0, wrong: 0 };
      const bancaStats = {
        ...prev,
        [banca]: {
          correct: bancaPrev.correct + (correctAdd || 0),
          wrong: bancaPrev.wrong + (errorAdd || 0),
        },
      };

      // Find dominant banca
      const bancaDominante =
        Object.entries(bancaStats).sort(
          ([, a], [, b]) => b.correct + b.wrong - (a.correct + a.wrong),
        )[0]?.[0] ?? banca;

      await storage.setTopicPerformance(topic.id, user.id, {
        correctCount: topic.performance?.correctCount ?? 0,
        errorCount: topic.performance?.errorCount ?? 0,
        bancaDominante,
      } as Parameters<typeof storage.setTopicPerformance>[2]);

      // Update bancaStats in user settings too (global banca affinity)
      const settings = await storage.getUserSettings(user.id);
      const globalBanca = settings?.bancaStats || {};
      const gb = globalBanca[banca] || { correct: 0, wrong: 0 };
      await storage.updateUserSettings(user.id, {
        bancaStats: {
          ...globalBanca,
          [banca]: {
            correct: gb.correct + (correctAdd || 0),
            wrong: gb.wrong + (errorAdd || 0),
          },
        },
      });

      res.json({ ok: true });
    } catch (e: any) {
      console.error("[TEC Banca Increment]", e);
      res.status(500).json({ ok: false, error: e.message ?? "Erro interno" });
    }
  });

  /**
   * GET /api/tec/status
   * Retorna status rápido para o userscript verificar se o token é válido.
   */
  app.get("/api/tec/status", async (req: any, res: any) => {
    try {
      const token =
        (req.headers["x-soe-token"] as string) || (req.query.token as string);
      if (!token)
        return res.status(401).json({ ok: false, error: "Token ausente" });
      const user = await storage.getUserByPushToken(token);
      if (!user)
        return res.status(401).json({ ok: false, error: "Token inválido" });
      const cadernos = await storage.getCadernosTec(user.id);
      res.json({
        ok: true,
        userName: user.name,
        cadernosCount: cadernos.length,
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── iCal export (/api/ical/:userId) ───────────────────────────────────────
  // Gera um arquivo .ics compatível com Google Calendar, Apple Calendar e Outlook.
  // Autenticado via pushToken (mesmo mecanismo do userscript TEC).
  app.get("/api/ical/:token", async (req: any, res: any) => {
    try {
      const { token } = req.params;
      const user = await storage.getUserByPushToken(token);
      if (!user) return res.status(401).send("Token inválido");

      const [revisions, topics, disciplines] = await Promise.all([
        storage.getRevisionsByUser(user.id),
        storage.getTopicsByUser(user.id),
        storage.getDisciplinesByUser(user.id),
      ]);

      const topicMap = new Map(topics.map((t) => [t.id, t]));
      const disciplineMap = new Map(disciplines.map((d) => [d.id, d]));

      // Only export pending (not completed, not ignored) future revisions
      const today = new Date().toISOString().split("T")[0];
      const toExport = revisions.filter(
        (r) => !r.completed && !r.ignored && r.scheduledDate >= today,
      );

      function icsDate(dateStr: string): string {
        return dateStr.replace(/-/g, "") + "T080000Z";
      }
      function icsDateEnd(dateStr: string): string {
        return dateStr.replace(/-/g, "") + "T090000Z";
      }
      function escIcs(s: string): string {
        return s
          .replace(/\\/g, "\\\\")
          .replace(/;/g, "\\;")
          .replace(/,/g, "\\,")
          .replace(/\n/g, "\\n");
      }

      const uid_suffix = `@soe-${user.id}.local`;
      const now_stamp =
        new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

      const events = toExport.map((r) => {
        const topic = topicMap.get(r.topicId);
        const disc = topic ? disciplineMap.get(topic.disciplineId) : undefined;
        const typeLabel =
          r.type === "test" ? "🧪 Teste" : `📖 Revisão ${r.revisionNumber}`;
        const summary = escIcs(
          `${typeLabel}: ${topic?.name ?? "Tema"} (${disc?.name ?? "Disciplina"})`,
        );
        const description = escIcs(
          `Tipo: ${r.type === "test" ? "Teste aleatório" : `Revisão nº ${r.revisionNumber}`}\nDisciplina: ${disc?.name ?? "—"}\nTema: ${topic?.name ?? "—"}`,
        );
        return [
          "BEGIN:VEVENT",
          `UID:soe-rev-${r.id}${uid_suffix}`,
          `DTSTAMP:${now_stamp}`,
          `DTSTART;VALUE=DATE:${r.scheduledDate.replace(/-/g, "")}`,
          `DTEND;VALUE=DATE:${r.scheduledDate.replace(/-/g, "")}`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${description}`,
          "END:VEVENT",
        ].join("\r\n");
      });

      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SOE//Sistema de Organização de Estudos//PT",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:SOE - Revisões`,
        "X-WR-TIMEZONE:America/Sao_Paulo",
        ...events,
        "END:VCALENDAR",
      ].join("\r\n");

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=soe-revisoes.ics",
      );
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(ics);
    } catch (e: any) {
      res.status(500).send("Erro ao gerar iCal: " + e.message);
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );
  // development mode uses Vite, production mode uses static files

  // ── Sync/export route ──────────────────────────────────────────────────
  app.get("/api/sync/info", (_req, res) => {
    const ifaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const iface of Object.values(ifaces)) {
      for (const addr of iface ?? []) {
        if ((addr as any).family === "IPv4" && !(addr as any).internal)
          ips.push((addr as any).address);
      }
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ ips, port });
  });

  app.get("/api/sync/export", (_req, res) => {
    try {
      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
      const dbFile = path.join(dataDir, "database.json");
      if (!fs.existsSync(dbFile))
        return res.status(404).json({ error: "No database found" });
      const data = fs.readFileSync(dbFile, "utf-8");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(data);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/sync/import", (req, res) => {
    try {
      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
      const dbFile = path.join(dataDir, "database.json");
      fs.writeFileSync(dbFile, JSON.stringify(req.body, null, 2), "utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Receive from Android (Android → PC) ───────────────────────────────
  // SSE clients waiting for a push from Android
  const receiveSSEClients = new Set<any>();

  app.get("/api/sync/receive-listen", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.flushHeaders();
    res.write("data: connected\n\n");
    receiveSSEClients.add(res);
    req.on("close", () => receiveSSEClients.delete(res));
  });

  app.post("/api/sync/receive", (req, res) => {
    try {
      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
      const dbFile = path.join(dataDir, "database.json");
      // req.body pode ser objeto (express.json parseou) ou string (CapacitorHttp enviou string crua)
      const payload = req.body;
      const jsonStr =
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload, null, 2);
      fs.writeFileSync(dbFile, jsonStr, "utf-8");
      // Notify all SSE listeners that data arrived
      for (const client of receiveSSEClients) {
        try {
          client.write("data: received\n\n");
        } catch {}
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/backup/auto", (_req, res) => {
    try {
      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
      const dbFile = path.join(dataDir, "database.json");
      if (!fs.existsSync(dbFile)) return res.json({ skipped: true });
      const backupDir = path.join(dataDir, "backups");
      if (!fs.existsSync(backupDir))
        fs.mkdirSync(backupDir, { recursive: true });
      const date = new Date().toISOString().split("T")[0];
      const dest = path.join(backupDir, `backup_${date}.json`);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(dbFile, dest);
        const files = fs
          .readdirSync(backupDir)
          .filter((f: string) => f.startsWith("backup_"))
          .sort();
        if (files.length > 30) {
          for (const old of files.slice(0, files.length - 30))
            fs.unlinkSync(path.join(backupDir, old));
        }
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json({ success: true, file: dest });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/backup/list", (_req, res) => {
    try {
      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
      const backupDir = path.join(dataDir, "backups");
      if (!fs.existsSync(backupDir)) return res.json({ backups: [] });
      const files = fs
        .readdirSync(backupDir)
        .filter((f: string) => f.startsWith("backup_"))
        .sort()
        .reverse();
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json({
        backups: files.map((f: string) => ({
          name: f,
          date: f.replace("backup_", "").replace(".json", ""),
        })),
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/quit", (_req, res) => {
    res.json({ quitting: true });
    setTimeout(() => {
      process.exit(0);
    }, 500);
  });

  if (process.env.NODE_ENV === "development" && !process.env.VERCEL) {
    const viteMod = "./vite.js";
    const { setupVite } = await import(viteMod);
    await setupVite(app, server);
  } else {
    const publicDir =
      process.env.NODE_ENV === "development"
        ? path.join(process.cwd(), "dist", "public")
        : path.join(process.cwd(), "client", "public"); // default
    serveStatic(
      app,
      process.env.VERCEL
        ? path.join(process.cwd(), "dist", "public")
        : publicDir,
    );
  }

  let port = parseInt(process.env.PORT || "3000");
  if (!process.env.VERCEL) {
    const availablePort = await findAvailablePort(port);
    if (availablePort !== port) {
      console.log(`Port ${port} is busy, using port ${availablePort} instead`);
      port = availablePort;
    }

    server.listen(port, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${port}/`);
    });
  }

  return { app, server };
}

async function startServer() {
  await createApp();
}

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  startServer().catch(console.error);
}
