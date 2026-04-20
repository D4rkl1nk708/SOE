import fetch from 'node-fetch';

async function testAI() {
  const prompt = `Você é o "Mentor SOE", o Assistente Pessoal de Concursos do aluno. 
Ele está resolvendo a questão abaixo. SEJA SOCRÁTICO. NÃO entregue a resposta correta de bandeja. 
Explique um detalhe da teoria, dê uma dica importante ou peça pra ele refletir sobre um ponto crítico. 
Texto MÁXIMO de 300 palavras.

Questão:
Questão 30 de 509 (#2795691 CEBRASPE)
Assinale a opção que apresenta...
(A) Não paguei o café da manhã com o cartão de débito ou o almoço com o cartão de crédito.
(B) Paguei o café da manhã com o cartão de crédito e não paguei o almoço com o cartão de débito.`;

  console.log("Calling OpenAI...");
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
      }),
    });
    const d = await res.json();
    console.log("OpenAI:", d.choices?.[0]?.message?.content?.substring(0, 500));
  } catch(e) { console.error("OpenAI fail", e); }

}
testAI();
