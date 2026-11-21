# Changelog do SOE

Notas por versão. Releases anteriores (binários e descrição) estão no GitHub:
https://github.com/D4rkl1nk708/SOE/releases

## 6.9.8 — o fim das "monstruosidades" do aluno

Origem: o dono concluiu a revisão de "Conceitos e Princípios das Metodologias
Ágeis" **9 vezes** no mesmo dia e o "Próximo no plano" continuou sendo o mesmo
tópico. A investigação na base real (em cópia) mostrou um tópico com 149
revisões pendentes, 82 vencidas, e 8.450 vencidas no total.

### Fim do plano repetido

- O plano do dia ignora tópicos que já tiveram revisão concluída **hoje** (dia
  local). Concluiu, o tema sai da frente — no servidor e no modo offline, com a
  mesma regra em `shared/planRules.ts`.
- Pontuação de atraso com **teto de 30 dias**: a revisão mais atrasada não vence
  sempre.
- No máximo **2 blocos de revisão seguidos**, depois um de ponto fraco/conteúdo
  novo.
- Rótulo honesto: até 30 dias "vencida há N dias", acima disso "atrasada
  (backlog)". O "por quê" mostra acerto e volume do tópico, não o total absoluto
  de vencidas ("8.458 revisões vencidas" nunca mais).
- Quando todas as vencidas do dia foram concluídas: "Revisões do dia em dia" e
  o próximo passo de conteúdo novo.

### Um único fechamento de sessão

- Sessão guiada ganhou o bloco **"Fechar o ciclo"**: concluir também as N
  revisões anteriores do tópico (só as que já venceram), concluir a revisão de
  teoria pendente e o botão primário **"Encerrar sessão e concluir"**.
- O toast solto "Concluir revisão de ...?" do painel do TEC foi removido.
- **Um** toast final, com id fixo, e botão desabilitado depois do clique.
- Recibo aponta um bloco de **outro tópico** com "Iniciar próximo".

### Conclusão em lote respeitando o calendário

- `revision.completeTopicBacklog`: conclui só as pendentes com data **até hoje
  local** daquele tópico. Não cria, não reagenda, não toca em futuras. A regra
  25/50 continua intacta. Idempotente, com backup antes de gravar.

### Travas para não voltar

- `client/src/lib/studyState.ts`: **uma** função invalida o conjunto completo de
  caches (overview, dashboard, revisões, calendário, histórico, TEC). As seis
  telas passaram a usá-la — antes cinco deixavam o plano desatualizado e a
  sessão guiada não invalidava nada. Um teste varre o código e falha se alguém
  voltar a fazer à mão.
- "Hoje" é sempre **dia local** (`shared/localDay.ts`): 33 pontos trocados de
  UTC para dia local. Antes, depois das 21h em Brasília, o app já achava que era
  amanhã. Regra ESLint proíbe o padrão de voltar.
- **Saúde dos dados**: verificadores novos (erro sem enunciado, simulado sem
  resposta, flashcard vencido há 90+ dias, `order` duplicado, backlog, performance
  incoerente, tentativa sem tópico) e cartão em Sync & Backup com correções
  seguras — todas com backup.
- **Uma ação, um toast**: `notify.once(id, ...)`.

### Testes

- `tests/journeys/`: router tRPC real contra SQLite temporário com fixture
  realista (3 disciplinas, 20 tópicos, ~150 revisões por tópico). Jornadas de
  conclusão pelos 6 caminhos, lote, questões, virada do dia e desfazer.
- `tests/tz/`: relógio fixo às 23:30 com `TZ=America/Sao_Paulo`.
- Portão de release (`quality`) roda a suíte nova.
