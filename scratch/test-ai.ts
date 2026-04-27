const apiKey = process.env.GEMINI_API_KEY || "YOUR_API_KEY_HERE";

const prompt = `INSTRUÇÕES DE RESPOSTA:
- Seja um Mentor de Elite: analise os dados fornecidos e aponte exatamente o que está dando errado.
- O "diagnostic" deve ser um esporro técnico: diga com precisão onde o aluno está falhando e por quê (ex: "Você despencou 10% em Controle de Constitucionalidade focando em teoria enquanto erra a base").
- O "actionPlan" deve ser uma tarefa de 15-30 min para corrigir essa falha agora.
- O "prediction" deve prever os erros futuros e o custo na prova (ex: "Ignorar isso vai custar sua aprovação, pois essa matéria representa 15% da prova").

ATENÇÃO: É ESTRITAMENTE PROIBIDO usar aspas duplas (") dentro dos seus textos (use aspas simples se precisar).
IMPORTANTE: Retorne APENAS um bloco JSON válido no formato abaixo. Não adicione nenhum texto antes ou depois.
\`\`\`json
{
  "disciplineName": "Nome da Matéria",
  "diagnostic": "Análise técnica granular baseada nos dados",
  "actionPlan": "Passo a passo prático e imediato",
  "prediction": "Previsão exata do impacto e risco na prova",
  "priority": "alta",
  "contextTag": "Estatística rápida"
}
\`\`\`
`;

async function main() {
  console.log("Chamando AI...");
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE",
            },
          ],
        }),
      },
    );
    const data = await res.json();
    console.log("=== RAW API RESPONSE ===");
    console.log(JSON.stringify(data, null, 2));
    console.log("=====================");
  } catch (e: any) {
    console.error("ERRO:", e.message);
  }
}

main();
