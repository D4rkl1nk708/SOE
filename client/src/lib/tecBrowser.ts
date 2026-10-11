import { registerPlugin, Capacitor } from "@capacitor/core";
import { toast } from "sonner";

export interface TecBrowserPluginInterface {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
  sync(): Promise<void>;
  addListener(
    eventName: "soeTecEvent",
    listenerFunc: (event: any) => void
  ): Promise<any>;
  addListener(
    eventName: "browserClosed",
    listenerFunc: () => void
  ): Promise<any>;
}

export const TecBrowser = registerPlugin<TecBrowserPluginInterface>("TecBrowser");

export async function handleTecEvent(eventData: any, pushToken?: string) {
  if (!eventData) return;
  const { type, payload } = eventData;
  console.log("[SOE TEC Handler] Evento recebido:", type, payload);

  // 1. Obter URL base do servidor configurado se houver (para sincronizar com PC se online)
  let serverUrl = "";
  try {
    serverUrl = (localStorage.getItem("soe_tec_server_url") || "").trim().replace(/\/$/, "");
  } catch {}

  if (serverUrl) {
    try {
      let endpoint = "";
      if (type === "SOE_TEC_INCREMENT_STATS") endpoint = "/api/tec/increment";
      else if (type === "SOE_TEC_WRONG_QUESTION") endpoint = "/api/tec/wrong-question";
      else if (type === "SOE_TEC_DATA") endpoint = "/api/tec/caderno-push";
      else if (type === "SOE_TEC_BANCA_INCREMENT") endpoint = "/api/tec/banca-increment";
      else if (type === "SOE_TEC_CADERNOS_LIST") endpoint = "/api/tec/cadernos-list";

      if (endpoint) {
        fetch(`${serverUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-SOE-Token": pushToken || "MOBILE_NATIVE",
          },
          body: JSON.stringify(payload),
        }).catch((err) => console.warn("[SOE Server Sync] PC Offline:", err));
      }
    } catch (e) {
      // Ignora falhas de rede com o PC
    }
  }

  // 2. Grava no banco de dados local do app (IndexedDB via localDb.ts)
  // para que o aluno não perca nenhuma questão, tempo ou erro mesmo offline.
  try {
    const {
      localDisciplineList,
      localDisciplineCreate,
      localTopicList,
      localTopicCreate,
      localTopicSetPerformance,
      localTopicAddStudyTime,
      localSaveQuestionError,
    } = await import("./localDb");

    if (type === "SOE_TEC_INCREMENT_STATS" && payload?.assunto) {
      const discName = payload.disciplina || "TEC Concursos";
      const discList = await localDisciplineList();
      const foundDisc = discList.find(
        (d: any) => d.name.toLowerCase() === discName.toLowerCase(),
      );
      const discId = foundDisc
        ? foundDisc.id
        : (
            await localDisciplineCreate({
              name: discName,
              color: "#6366f1",
              weight: 1,
            })
          ).id;

      if (discId) {
        const topicData = await localTopicList({ disciplineId: discId });
        const foundTopic = topicData.topics.find(
          (t: any) => t.name.toLowerCase() === payload.assunto.toLowerCase(),
        );
        const topicId = foundTopic
          ? foundTopic.id
          : (
              await localTopicCreate({
                name: payload.assunto,
                disciplineId: discId,
              })
            ).id;

        if (topicId) {
          const prevCorrect = foundTopic?.performance?.correctCount ?? 0;
          const prevErrors = foundTopic?.performance?.errorCount ?? 0;
          await localTopicSetPerformance({
            topicId,
            correctCount: prevCorrect + (payload.correctAdd || 0),
            errorCount: prevErrors + (payload.errorAdd || 0),
          });
          if (payload.timeSpentSeconds) {
            await localTopicAddStudyTime({
              topicId,
              seconds: payload.timeSpentSeconds,
            });
          }
          toast.success(
            payload.correctAdd > 0
              ? "✓ Acerto registrado no SOE!"
              : "✗ Erro registrado no SOE!",
            { position: "bottom-center" }
          );
        }
      }
    } else if (type === "SOE_TEC_WRONG_QUESTION" && payload?.statement) {
      const discName = payload.disciplina || "TEC Concursos";
      const discList = await localDisciplineList();
      const foundDisc = discList.find(
        (d: any) => d.name.toLowerCase() === discName.toLowerCase(),
      );
      const discId = foundDisc
        ? foundDisc.id
        : (
            await localDisciplineCreate({
              name: discName,
              color: "#6366f1",
              weight: 1,
            })
          ).id;

      const topicData = discId
        ? await localTopicList({ disciplineId: discId })
        : { topics: [] };
      const foundTopic = topicData.topics.find(
        (t: any) =>
          t.name.toLowerCase() === (payload.assunto || "").toLowerCase(),
      );
      const topicId = foundTopic
        ? foundTopic.id
        : (
            await localTopicCreate({
              name: payload.assunto || "Geral",
              disciplineId: discId || 1,
            })
          ).id;

      await localSaveQuestionError({
        disciplineId: discId || 1,
        topicId: topicId || 1,
        questionId: payload.questionId,
        banca: payload.banca,
        year: payload.year,
        contest: payload.contest,
        statement: payload.statement || "",
        alternatives: payload.alternatives || [],
        correctAnswer: payload.correctAnswer,
        userAnswer: payload.userAnswer,
      });
      toast.error("Questão salva no Caderno de Erros!", {
        position: "bottom-center",
      });
    } else if (type === "SOE_TEC_DATA" && payload?.rows) {
      for (const row of payload.rows) {
        if (!row.assunto) continue;
        const discName = row.disciplina || "TEC Concursos";
        const discList = await localDisciplineList();
        const foundDisc = discList.find(
          (d: any) => d.name.toLowerCase() === discName.toLowerCase(),
        );
        const discId = foundDisc
          ? foundDisc.id
          : (
              await localDisciplineCreate({
                name: discName,
                color: "#6366f1",
                weight: 1,
              })
            ).id;

        if (discId) {
          const topicData = await localTopicList({ disciplineId: discId });
          const foundTopic = topicData.topics.find(
            (t: any) => t.name.toLowerCase() === row.assunto.toLowerCase(),
          );
          const topicId = foundTopic
            ? foundTopic.id
            : (
                await localTopicCreate({
                  name: row.assunto,
                  disciplineId: discId,
                })
              ).id;

          if (topicId) {
            await localTopicSetPerformance({
              topicId,
              correctCount: row.acertos || 0,
              errorCount: row.erros || 0,
            });
          }
        }
      }
      toast.success(`${payload.rows.length} tópicos sincronizados no app!`);
    }
  } catch (err) {
    console.error("[SOE localDb Sync Error]", err);
  }
}

let isListenerActive = false;
export function initTecBrowserListener(pushToken?: string) {
  if (isListenerActive) return;
  isListenerActive = true;

  if (Capacitor.isNativePlatform()) {
    try {
      TecBrowser.addListener("soeTecEvent", (event: any) => {
        handleTecEvent(event, pushToken);
      });
    } catch (e) {
      console.warn("[TecBrowser] Falha ao registrar addListener:", e);
    }
  }

  // Compatibilidade com eventos via postMessage (modo iframe/desktop)
  window.addEventListener("message", (e) => {
    if (e.data && e.data._soe_internal) {
      handleTecEvent(e.data, pushToken);
    }
  });
}
