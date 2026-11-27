export interface ChangelogItem {
  version: string;
  date: string;
  title: string;
  categories: {
    title: string;
    items: string[];
    type: "feature" | "fix" | "improvement";
  }[];
}

export const CHANGELOG_DATA: ChangelogItem[] = [
  {
    version: "6.9.15",
    date: "27/11/2026",
    title: "Julgamento atrasado, A/B interno e pendências",
    categories: [
      {
        title: "🧠 Julgar depois de corrigir",
        type: "feature",
        items: [
          'Em bloco de 5+ questões, a correção agora pergunta primeiro: "de 0 a 100, quantas dessas você acha que acertou?" — e só depois mostra o placar. Julgar com a tarefa já resolvida e sem a questão à vista é bem mais preciso que prever antes (g = 0,93).',
          "O card de calibração mostra três números lado a lado: previsto antes, estimado depois e real, cada um com o erro em p.p. O Brier é calculado separado por tipo — misturar os dois esconderia justamente o efeito.",
          "A estimativa é julgamento, não nota: ela não altera a acurácia do bloco.",
        ],
      },
      {
        title: "🧪 O app mede a própria política",
        type: "feature",
        items: [
          "Não existe estudo de gabarito em bloco × imediato em concurso público brasileiro. Então o SOE sorteia a variante por aluno (determinística), aplica como padrão e mede o resultado.",
          "Você pode trocar a correção no setup; a troca é registrada como override, nunca como erro.",
          'O card "Experimento interno" em Estatísticas mostra n por variante, acerto no bloco e acerto em questão nova 7+ dias depois. Com menos de 20 tentativas em cada variante ele não elege vencedor: diz "amostra insuficiente (n=X)".',
        ],
      },
      {
        title: "🧹 Pendências",
        type: "fix",
        items: [
          'A tela de questão ganhou "Me dá uma dica": o tutor responde com o movimento da coleira (dica → princípio → explicação) e, sem chave de IA, devolve a pergunta socrática padrão — inclusive no APK.',
          'No leitor, os dois seletores do topo mostravam o mesmo texto. Agora o da esquerda é o documento ("Doc · …") e o da direita é a seção ("Seção 1 · …"), sem mudar o layout.',
          "Página curta (menos de 60% do orçamento de palavras) não fica mais boiando num quadro alto: a altura mínima encolhe, e o paginador continua igual.",
          "Sobraram duas datas UTC: o tópico criado pelo TEC e o criado pelo classificador gravavam `studyDate` com ISO completo e podiam nascer no dia seguinte depois das 21h. Agora é dia local.",
        ],
      },
    ],
  },

  {
    version: "6.9.14",
    date: "27/11/2026",
    title: "Leitor paginado (e a republicação da entrega anterior)",
    categories: [
      {
        title: "📖 Leitura em páginas",
        type: "feature",
        items: [
          "O leitor deixou de rolar: cada página cabe inteira na tela, com 'X de Y', setas, teclado e swipe. A rolagem é o que mais prejudica a compreensão na tela (papel vence por g=0,35–0,48 quando há rolagem; sem rolagem, empatam).",
          "A posição fica guardada por documento e seção: você volta exatamente onde parou.",
          "Página sem enfeite: nada de ícone, gradiente ou divisória decorativa no corpo do texto.",
          "Esta versão republica o conteúdo da 6.9.13, que teve o release bloqueado por um erro de tipo no próprio teste.",
        ],
      },
    ],
  },

  {
    version: "6.9.13",
    date: "27/11/2026",
    title: "Leitor paginado: uma página por vez, sem rolagem",
    categories: [
      {
        title: "📖 Leitura em páginas",
        type: "feature",
        items: [
          'O Caderno Vivo deixou de rolar: cada seção é lida em páginas ("3 de 12"), com setas, teclado (← →) e swipe no celular. Sem rolagem, papel e tela empatam na compreensão; com rolagem, o papel vence (Clinton-Lisell & Litzinger, 2026).',
          "A página nunca corta: se o texto passar da altura da tela, o paginador reduz o orçamento de palavras e repagina sozinho, sempre cortando entre parágrafos ou entre frases.",
          "A posição fica salva por documento e seção: fechar o app e voltar abre na mesma página.",
          "Ao terminar a última página, o avanço para a próxima seção passa pela pergunta de recuperação da seção atual; pular é permitido, mas o app avisa uma vez que isso reduz a retenção.",
        ],
      },
      {
        title: "🧹 Corpo do texto limpo",
        type: "improvement",
        items: [
          "Nada de enfeite no corpo do texto: só título e o número da página do PDF na margem. Detalhe sedutor custa compreensão (g = −0,16).",
        ],
      },
    ],
  },
  {
    version: "6.9.12",
    date: "27/11/2026",
    title: "Tutor com coleira: a resposta sai do prompt",
    categories: [
      {
        title: "🛡️ Coleira do tutor",
        type: "feature",
        items: [
          "O tutor só entrega a resposta a partir da 3ª tentativa. A política vive em código (shared/tutorPolicy): pedido de gabarito é recusado com pergunta de volta, a 2ª tentativa libera o princípio e só a 3ª libera a explicação completa.",
          "Enquanto a resposta é proibida, gabarito, alternativa correta e explicação oficial não vão para o modelo: o contexto é montado por buildTutorContext e o modelo não recebe o que não pode entregar (Bastani et al., 2025: tutoria sem salvaguarda piora o desempenho depois que o acesso é removido).",
          "Novo endpoint mentor.tutorTurn: devolve o movimento (dica, princípio ou explicação) e a resposta. Sem chave de IA, devolve a pergunta socrática padrão em vez de erro.",
          "O chat do Mentor também segue a política: o turno é classificado e a instrução de tutoria entra acima do estilo.",
        ],
      },
      {
        title: "📊 Métrica de coleira",
        type: "feature",
        items: [
          'O card de Retenção mostra "Tutor entregou a resposta direto: X% (meta: 0%)" — uso normal deve ficar em 0%. Cada turno é registrado com intenção, movimento, nível de dica e se liberou a resposta.',
        ],
      },
      {
        title: "🌙 Datas UTC que sobraram",
        type: "fix",
        items: [
          '"Estudou hoje" e "aula estudada" gravavam o dia UTC: depois das 21h em Brasília o tópico caía no dia seguinte. Agora usam o dia local, no servidor e no modo offline.',
          "Aula concluída, mapa de consistência e correlação humor × sessão também passaram a agrupar pelo dia do aluno.",
          "Varredura nova (tests/localDaySweep): fatiar um timestamp ISO para tirar o dia, em código de produção, agora exige decisão explícita — ou o teste falha.",
        ],
      },
    ],
  },
  {
    version: "6.9.11",
    date: "27/11/2026",
    title: "O SOE implacável: espaçamento, diagnóstico e retenção medida",
    categories: [
      {
        title: "⏳ Intervalo mínimo de 3 dias",
        type: "feature",
        items: [
          "Um tópico não volta em menos de 3 dias: o guard empurra as revisões futuras que violavam o intervalo, com backup e registro em StudyEvents. A lógica 25/50 continua intocada.",
          "O guard roda sozinho uma vez por dia ao abrir o app e sempre que você entra na tela de Revisões; rodar de novo não move nada.",
        ],
      },
      {
        title: "🎯 Diagnóstico e domínio",
        type: "feature",
        items: [
          "Tema novo abre com um diagnóstico de 5 questões (erro esperado). Ele entra como linha de base — nunca como acurácia, proficiência ou domínio.",
          "Selo de domínio 0–4 por tópico: 2 recuperações espaçadas já valem, e o selo de dominado exige acerto em questão nova depois delas (estudante abandona o item cedo demais com 1 acerto).",
          "Aviso suave de consolidação quando o dia termina com tópicos em nível 0–1.",
        ],
      },
      {
        title: "🧠 Gabarito em bloco e auto-explicação",
        type: "feature",
        items: [
          "Sessões com 5+ questões corrigem no final: durante o bloco, sem gabarito nem explicação.",
          "Ao errar, o app pede uma frase explicando por que a alternativa marcada está errada. Sem a frase, a questão fica pendente.",
          "Erro marcado com certeza cria cartão corretivo na hora, agenda recuperação para o dia seguinte e faz uma rechecagem em 7 dias: a correção de erro confiante cai de ~86% para ~56% em uma semana.",
        ],
      },
      {
        title: "📊 Retenção, contraste e simulado",
        type: "feature",
        items: [
          "Novo card de Retenção: acerto em questão nova a 7/25/50 dias, retenção por hora, cobertura × proficiência, Brier e nota esperada com intervalo. Amostra pequena aparece como amostra insuficiente, não como número inventado.",
          "Blocos de contraste entre tópicos confundíveis da mesma disciplina, com ganho esperado por minuto como desempate.",
          "Simulado com régua da banca (Cebraspe anula 1 acerto por erro) e pós-prova de 6 perguntas para fechar o relatório.",
          "Conteúdo novo difícil não entra depois das 21h30; o plano oferece recall curto e a revisão de manhã.",
        ],
      },
      {
        title: "🧾 Caderno de erros",
        type: "improvement",
        items: [
          "Cada erro pode receber uma causa em 1 toque (conceito, literalidade, leitura, desatenção, banca). O deck de erros ordena pela causa dominante e respeita o intervalo de 3 dias.",
          "Micro-recuperação por seção no leitor: uma pergunta antes de liberar a próxima seção, com autoavaliação — sem IA obrigatória.",
        ],
      },
    ],
  },

  {
    version: "6.9.10",
    date: "24/11/2026",
    title: "No celular: importar PDF e contar as questões da sessão",
    categories: [
      {
        title: "📄 Ler PDF no APK",
        type: "feature",
        items: [
          "O botão de importar arquivo no modo leitura agora funciona no celular: o texto do PDF é extraído no próprio aparelho e dividido em seções, sem precisar do computador.",
          "O documento importado abre depois sem internet, com o sumário, a página na margem e o texto na medida de leitura.",
          "PDF digitalizado (sem texto) avisa com clareza em vez de falhar sem explicação.",
          "Gerar perguntas, analogias e micro-mundo continua usando a sua chave de IA e internet — e agora diz isso em vez de erro genérico.",
        ],
      },
      {
        title: "🧮 Questões contadas",
        type: "fix",
        items: [
          "A sessão fechada no celular passou a entrar no histórico com as questões, os acertos e a duração. Antes o fechamento falhava em silêncio e o relatório dizia que nenhuma questão tinha sido respondida.",
          "O retrato de domínio por tópico (antes e depois da sessão) também passou a existir no aparelho, que é o que alimenta a contagem do relatório.",
        ],
      },
    ],
  },

  {
    version: "6.9.9",
    date: "21/11/2026",
    title: "O aviso de novidades volta a mostrar a versão certa",
    categories: [
      {
        title: "🧹 Ajuste",
        type: "fix",
        items: [
          "A janela de novidades da 6.9.8 aparecia com o texto da 6.9.7. Corrigido, e um teste agora garante que a versão do app e a do aviso andam juntas.",
        ],
      },
    ],
  },
  {
    version: "6.9.8",
    date: "21/11/2026",
    title: "Fim de ficar preso no mesmo tópico, e o app erra menos o dia",
    categories: [
      {
        title: "🔁 Revisão que avança de verdade",
        type: "fix",
        items: [
          'O plano não volta para um tópico que você já concluiu hoje. Antes, concluir a revisão deixava a próxima do mesmo tema (cada tópico acumula dezenas) como "próximo".',
          "O atraso passou a pesar no máximo 30 dias e entram no máximo 2 revisões seguidas antes de um bloco de outro tipo, então conteúdo novo e pontos fracos aparecem.",
          '"Encerrar sessão e concluir" é um botão só, com a opção de concluir também as revisões anteriores do tópico. As futuras do calendário não são tocadas.',
          'Um aviso por ação: acabaram as duas mensagens "Revisão concluída" e o botão solto no canto da tela.',
        ],
      },
      {
        title: "🕘 Dia certo à noite",
        type: "fix",
        items: [
          "Depois das 21h o app achava que já era o dia seguinte (usava o relógio UTC). Revisões de amanhã apareciam como vencidas e o histórico gravava no dia errado. Agora tudo usa o dia local, em 37 pontos.",
        ],
      },
      {
        title: "🛡 Menos erros bobos",
        type: "improvement",
        items: [
          "Concluir uma revisão atualiza plano, calendário, fila e painel juntos, em qualquer tela. Antes cinco das seis telas deixavam o plano desatualizado.",
          'Cartão "Saúde dos dados" em Sync e Backup: encontra erro sem enunciado, simulado vazio, flashcards muito atrasados e disciplinas fora de ordem, e corrige com backup antes.',
          "Servidor local não cai mais ao abrir arquivos grandes (corrigido um erro do gzip).",
          "Testes que simulam o aluno concluindo revisão pelos seis caminhos e virando o dia às 23:59 entram no portão do release.",
        ],
      },
    ],
  },
  {
    version: "6.9.7",
    date: "21/11/2026",
    title:
      "Calibração do chute, lei seca do seu próprio material e ritmo de prova",
    categories: [
      {
        title: "🎯 Calibração certeza × acerto",
        type: "feature",
        items: [
          "Novo card em Estatísticas e no relatório da sessão: quantas questões você acertou por nível (certeza, dúvida, chute), a taxa de chute e o índice de confiança.",
          "A confiança que você marca no TEC passou a ser gravada de verdade na tentativa — antes o eco da captura era descartado e o dado se perdia.",
          "Frase de risco objetiva: quantos acertos vieram de chute e quantas certezas você errou. Nada de IA aqui: é contagem.",
          "Com mais de 80% das tentativas sem confiança declarada, o card vira um convite curto em vez de um gráfico vazio.",
        ],
      },
      {
        title: "📕 Lei seca automática",
        type: "feature",
        items: [
          "Nova aba em Flashcards: monta cartões de literalidade a partir dos seus erros com resolução e das notas dos tópicos — nenhum texto legal inventado, cada cartão aponta a origem.",
          "Detecta os pontos cegos (10+ questões com menos de 60% de acerto) e prioriza os tópicos que citam artigo.",
          "Deck com meta diária de 15 cartões, reaproveitando a repetição espaçada que já existia; cada cartão mostra tópico e número da questão e pode ser editado ou apagado.",
        ],
      },
      {
        title: "⏱ Ritmo de prova no simulado",
        type: "feature",
        items: [
          "Durante a prova: alvo por questão conforme a banca (Cebraspe 90s, FGV 120s), indicador 'no ritmo / atrasado / adiantado' e aviso discreto ao passar do dobro do alvo — nada bloqueia a resposta.",
          "No resultado: mediana, média, distribuição por faixa de tempo, questões acima do alvo, o tópico onde você perdeu mais tempo e quantas questões ficariam em branco no ritmo alvo.",
          "O tempo por questão é gravado no simulado, então o relatório reabre depois sem recalcular.",
        ],
      },
      {
        title: "🧹 Disciplinas duplicadas",
        type: "fix",
        items: [
          "Card em Disciplinas com a prévia completa (origem → destino, tópicos e questões) e um botão único para consolidar todos os grupos.",
          "A mescla soma a performance das disciplinas — antes o total de questões da origem desaparecia do catálogo — e registra o evento no histórico.",
          "Backup automático em data/backups antes de cada mescla; rodar de novo sem duplicadas não faz nada.",
        ],
      },
    ],
  },
  {
    version: "6.9.6",
    date: "21/11/2026",
    title:
      "Caderno Vivo: ler com conforto, ver a geração andar e aprender com animação",
    categories: [
      {
        title: "🛠 Confiabilidade e desempenho",
        type: "fix",
        items: [
          "Ícone da bandeja do Windows: era uma imagem vazia e agora aparece de verdade (ícone próprio para 16px, e os assets passaram a ir no pacote instalado).",
          "Fila de revisões: um cartão por tópico e tópico já concluído hoje sai da fila do dia — acabou a sequência do mesmo tema.",
          "Dashboard caiu de 200 KB para 130 KB e o servidor passou a comprimir as respostas (16 KB na prática).",
          "Histórico diário do tópico mostrava o número anterior ao da atualização; corrigido.",
          "Recursos de IA usam a chave salva em Ajustes quando a tela não manda chave (outra máquina, navegador limpo).",
          "Conteúdo de flashcard e de redação não é mais injetado como HTML cru.",
          "Eventos de estudo limitados a 1.000 por usuário (antes cresciam sem teto dentro das configurações).",
        ],
      },
      {
        title: "📖 Ambiente de leitura",
        type: "improvement",
        items: [
          "O leitor virou três zonas: documentos e sumário à esquerda (com '4 de 55'), o texto no centro em medida de leitura (62–72ch, corpo 17,5px, 1.65) e 'Estudar esta seção' à direita.",
          "A navegação ‹ anterior · próxima › fica fixa no rodapé do painel de leitura; no celular tudo vira uma coluna, o sumário vira seletor no topo e as ações descem para uma barra fixa.",
          "Cada trecho mostra o número da página na margem quando o PDF trouxe esse metadado — PDF antigo não ganha número inventado.",
          "As três ações deixaram de ser botões soltos: viraram uma lista com o que cada uma faz, e o resultado aparece no próprio painel.",
          "O layout clássico continua disponível em Perfil → Interface → 'Clássico · completo'.",
        ],
      },
      {
        title: "📊 Geração com progresso",
        type: "feature",
        items: [
          "Gerar com IA agora é um job: barra com %, estágio (preparando → enviando ao modelo → gerando → validando → pronto), tempo decorrido, Cancelar e Tentar de novo.",
          "Se a aba perder o foco, o trabalho continua no servidor e o status é consultado quando você volta.",
          "Erros viraram frases: cota esgotada, IA demorou demais, resposta ilegível, artefato fora do contrato. Nunca mais stack trace.",
          "No máximo 2 gerações simultâneas por usuário; cancelar libera a vaga na hora.",
        ],
      },
      {
        title: "🎬 Aula interativa (novo)",
        type: "feature",
        items: [
          "Nova saída do Caderno Vivo: uma animação HTML autocontida que ensina o conceito — canvas/SVG com play/pause/reiniciar e velocidade 0,5×/1×/2×, narração em 3–6 passos sincronizados, uma interação para explorar e uma pergunta de verificação com feedback.",
          "Disponível na seção do PDF, no tema em Temas e no Caderno de Erros (para explicar o erro).",
          "Fica salva por tópico: reabre sem gerar de novo, guarda até 5 versões e pode ser apagada.",
          "O HTML é validado antes de salvar (tem documento, tem script, sem fetch/src=http) e roda em sandbox sem rede; `prefers-reduced-motion` desliga a animação automática.",
          "'Marcar como estudado' grava um evento de estudo no tópico — uma vez por dia.",
        ],
      },
      {
        title: "📱 Offline",
        type: "fix",
        items: [
          "No APK o Caderno Vivo deixou de responder 'procedimento local não implementado': aulas, analogias e micro-mundos salvos abrem e o que falta (PDF e IA) é explicado com clareza.",
        ],
      },
    ],
  },
  {
    version: "6.9.5",
    date: "19/11/2026",
    title: "Captura do TEC que não perde questão e classificação sem achismo",
    categories: [
      {
        title: "🔑 IA e rodízio de chaves",
        type: "fix",
        items: [
          "Cota esgotada em um modelo agora tenta o próximo modelo da mesma chave antes de trocar de chave.",
          "O app lembra qual chave/modelo esgotou e pula direto, em vez de começar sempre pela chave 1.",
          "Rodízio entre as chaves a cada chamada, espalhando o limite por minuto.",
          "Toda chamada ao Gemini tem timeout (o gemini-3.5 chegou a travar mais de 20s).",
          "Classificação de questões do TEC pede JSON sem 'thinking' — antes a resposta vinha truncada.",
        ],
      },
      {
        title: "🎯 Captura do TEC",
        type: "fix",
        items: [
          'A resposta passa a ser detectada pelo próprio DOM (MutationObserver + checagem a cada 1,5 s): o banner "Você acertou/errou" não precisa mais de uma requisição para aparecer. Continua 100% passivo — o app só lê a página aberta, sem clique, rolagem ou requisição ao TEC.',
          'Cada questão tem identidade estável: #id do TEC → id na URL/atributo → hash do enunciado → hash do assunto com contador de transição. Nunca mais "a URL é a questão": 10 questões seguidas na mesma página contam 10.',
          "O tempo por questão vai de quando ela aparece até o resultado, com teto de 600 s — acabou o registro de 443 s.",
          "O Caderno de Erros guarda o enunciado e as alternativas de verdade; quando o texto não é capturado, fica marcado como enunciado pendente em vez de um texto de mentira.",
        ],
      },
      {
        title: "🧠 Classificação",
        type: "feature",
        items: [
          "A matéria do cabeçalho é procurada primeiro nas suas disciplinas e tópicos (com alias). A IA só entra quando não bate, uma única vez por rótulo novo, com limite por hora e sem quebrar quando a cota acaba.",
          "Cabeçalho genérico do site (Blog, Guias, TEC Concursos) não vira mais disciplina nem joga o acerto no tópico errado.",
          'Quando a certeza é baixa, nada é criado sozinho: o app mostra "N questões do TEC aguardam classificação" e você escolhe o tópico, cria um novo ou ignora. A decisão vira alias e reatribui as questões antigas daquele rótulo.',
        ],
      },
      {
        title: "📅 Sessão e calendário",
        type: "feature",
        items: [
          'Contador ao vivo na Sessão Guiada ("Contabilizadas: N") com as últimas respostas: hora, #id, acerto/erro e tópico — e botões +Acertei / +Errei / Desfazer última.',
          "Aviso discreto quando passa de 4 min sem nenhuma captura com o TEC aberto.",
          "O relatório da sessão sai das tentativas com horário dentro de [início, fim]; o delta de performance virou só fallback.",
          "Ao treinar um tópico que tem revisão de teste vencida, o SOE conclui no máximo uma a cada N questões (padrão 5, configurável, 0 desliga) com Desfazer no aviso. Revisão de teoria nunca é concluída sozinha: o app pergunta.",
        ],
      },
    ],
  },
  {
    version: "6.9.4",
    date: "18/11/2026",
    title: "Fila de revisões utilizável e evolução por questão",
    categories: [
      {
        title: "📚 Revisões",
        type: "feature",
        items: [
          "A fila do dia agora é priorizada: tópico mais fraco × peso da disciplina × atraso (saturado), com revisão antes de teste no empate.",
          "Ela mostra só o topo (padrão 25, ajustável, 0 = sem limite); o resto fica recolhido em Em espera — nada é apagado e a geração 25/50 não mudou.",
        ],
      },
      {
        title: "📈 Evolução",
        type: "feature",
        items: [
          "Cada resposta (TEC, sessão, simulado) vira uma tentativa com data, tópico e disciplina; o histórico saiu de settings para a coleção própria, com migração e backup automáticos.",
          "Estatísticas mostram acerto por disciplina nos últimos 7 dias contra os 30 dias anteriores, com seta e sem dados suficientes quando há menos de 10 tentativas.",
        ],
      },
      {
        title: "🧹 Organização",
        type: "improvement",
        items: [
          "Matéria:, TI - e parênteses deixam de criar disciplina duplicada na captura do TEC.",
          "Disciplinas ganharam mescla manual (origem → destino) que leva tópicos homônimos, revisões, tentativas, flashcards, erros e notas, somando a performance, com backup antes.",
          "Edital agora pertence ao concurso: escolha o concurso ativo, ligue cada linha a tópicos (sugestão por similaridade + ajuste manual) e veja cobertura, questões e blocos sem nenhuma questão.",
          "Simulado entregue com zero respostas pede confirmação de descarte e não entra mais em média; modo C/E mostra a nota líquida e quantas erradas teriam sido melhores em branco.",
          "Botão Gerar flashcards no Caderno de Erros cria um card por erro (frente: assertiva; verso: gabarito + resolução), sem duplicar.",
          "Foto de perfil saiu de settings e virou arquivo; chave de IA e token de push não vão mais para o auto-backup.",
        ],
      },
    ],
  },
  {
    version: "6.9.3",
    date: "16/11/2026",
    title: "Contagem exata no TEC",
    categories: [
      {
        title: "🎯 Captura do TEC",
        type: "fix",
        items: [
          "Cada resposta conta uma vez só: a identificação da questão passou a usar o número da questão ou o início do enunciado, em vez da URL — que muda depois de responder e fazia a mesma resposta contar duas vezes.",
          "O servidor descarta, por 10 minutos, resposta repetida da mesma questão — segunda barreira contra contagem dupla.",
          "Nenhuma requisição extra ao TEC: a captura continua sendo só leitura da página que você já abriu.",
        ],
      },
    ],
  },
  {
    version: "6.9.2",
    date: "16/11/2026",
    title: "Sessão que analisa de verdade, Feynman e o TEC do tema",
    categories: [
      {
        title: "🎯 Sessão guiada",
        type: "feature",
        items: [
          "Ao encerrar, a sessão mostra questões, acertos e erros por tópico — antes só um número global.",
          "Pontos fortes e pontos fracos saem da acurácia desta sessão, cruzada com a prontidão de cada tema.",
          "Revisão vencida do plano ganhou o botão de concluir: o plano avança e o mesmo tema para de voltar.",
          "O próximo bloco sugerido nunca é o que você acabou de fazer.",
          "Se a captura do TEC chegar atrasada, o botão Atualizar análise refaz o relatório.",
        ],
      },
      {
        title: "🧠 Aprender",
        type: "feature",
        items: [
          "Explique com as suas palavras (Feynman): a IA diz o que ficou certo, o que ficou vago e qual pergunta expõe a lacuna.",
          "A explicação pode ser salva como anotação do tema.",
        ],
      },
      {
        title: "📖 Caderno Vivo",
        type: "feature",
        items: [
          "Nova aba Ler: importe um PDF e ele é dividido em seções, cada uma virando uma sessão de estudo.",
          "Perguntas de recuperação por seção (não resumo), com a página onde a resposta está.",
          "Três analogias por tema, cada uma com o mapeamento e o ponto onde quebra — você escolhe a que funciona.",
          "Micro-mundo: para temas procedimentais, um artefato manipulável gerado por IA, isolado em sandbox.",
        ],
      },
      {
        title: "🧭 Decisões",
        type: "improvement",
        items: [
          "Árvores de decisão explícitas: qual bloco pegar, o que fazer depois de cada resposta, como atacar cada tipo de conteúdo e quando revisar.",
          "Cada sessão termina com a próxima revisão sugerida e o motivo.",
          "A sessão passou a ser registrada como dado (início, fim, tópico, acertos) — base do histórico por sessão.",
          "Cada questão incrementada pelo TEC agora vira tentativa com horário, o que permite atribuir acerto ao tópico certo.",
        ],
      },
      {
        title: "🗂 Histórico e cadência",
        type: "feature",
        items: [
          "Nova tela Sessões: as últimas 30 sessões com tópico, duração, acertos e acurácia, mais o resumo dos últimos 7 dias.",
          "A home avisa quando o backlog de revisões passa de 30 e leva direto para a fila.",
          "Ao encerrar a sessão você pode reagendar a revisão do tema para a data sugerida, com um clique.",
          "Analogias escolhidas ficam salvas no tema (com o seu porquê) e voltam nas próximas leituras.",
          "Micro-mundos gerados ficam salvos no tópico — um por tema.",
          "Botão TEC do caderno: quando a disciplina do tema casa com um caderno sincronizado, a janela do TEC abre já nele.",
        ],
      },
      {
        title: "🛠 Correções",
        type: "fix",
        items: [
          "Começar no Plano abre a sessão guiada; antes caía direto na aba de revisões.",
          "Sync por QR volta a funcionar na rede local: o app escuta em 0.0.0.0 e o QR leva o token.",
          "Um único X no modal de novidades.",
        ],
      },
    ],
  },
  {
    version: "6.9.0",
    date: "10/11/2026",
    title: "Persistência em SQLite, correções de segurança e Edital mais leve",
    categories: [
      {
        title: "💾 Dados",
        type: "improvement",
        items: [
          "O banco agora usa SQLite (sem dependência nativa) com escrita incremental: só o que mudou é gravado, dentro de uma transação.",
          "A migração do database.json é automática na primeira abertura; o arquivo original fica guardado como .migrated-<data>.",
          "Se o banco estiver corrompido, ele é preservado como .corrupt-<data> em vez de ser sobrescrito.",
          "O backup automático passou a exportar pela API de storage e funciona nos dois motores.",
        ],
      },
      {
        title: "🔐 Segurança",
        type: "fix",
        items: [
          "Removida a execução de código (new Function) sobre respostas da IA.",
          "O servidor local escuta apenas em 127.0.0.1; acesso pela rede exige token.",
          "Exportação e sync não levam mais chave de IA nem token de sincronização.",
          "A janela do TEC Concursos roda com contextIsolation e valida a origem das mensagens.",
          "Rotas de arquivo protegidas contra path traversal.",
        ],
      },
      {
        title: "⚡ Edital",
        type: "fix",
        items: [
          "Editar o acerto não grava mais o edital inteiro a cada tecla: a gravação é agrupada e confirmada ao sair do campo.",
          "Uma atualização de dados não apaga mais a linha que você está editando.",
        ],
      },
      {
        title: "🔁 Sincronização",
        type: "fix",
        items: [
          "Quando o envio de volta falha, o app mostra Sincronização Parcial em vez de afirmar que deu tudo certo.",
          "Menos recarregamentos de página: as telas atualizam os dados em vez de reiniciar o app.",
        ],
      },
      {
        title: "🛠️ Qualidade",
        type: "improvement",
        items: [
          "Os testes agora também passam pelo typecheck (341 casos) e a suíte roda de forma reprodutível.",
          "Pipeline com testes E2E e release manual, evitando publicar a cada push.",
          "Build de release do Android passa a usar keystore própria quando configurada.",
        ],
      },
    ],
  },
  {
    version: "6.8.1",
    date: "29/10/2026",
    title: "Nome do tópico inteiro no calendário e treino direto no dia",
    categories: [
      {
        title: "📅 Calendário",
        type: "fix",
        items: [
          "Tocar no nome da tarefa não abre mais o modal antigo do calendário.",
          "O nome do tópico aparece em até duas linhas e, quando ainda não cabe, tocar expande o texto inteiro.",
        ],
      },
      {
        title: "🎯 Treinar",
        type: "feature",
        items: [
          "Cada tarefa do dia tem um botão Treinar que leva direto às questões do tópico.",
        ],
      },
      {
        title: "📱 Celular",
        type: "improvement",
        items: [
          "O modal do dia cabe na largura da tela — os botões de ação não ficam mais cortados.",
          "Os filtros do dia rolam na horizontal em vez de quebrar em duas linhas.",
        ],
      },
    ],
  },
  {
    version: "6.8.0",
    date: "29/10/2026",
    title:
      "Títulos na cor certa, consistência com dados reais e fim das revisões duplicadas",
    categories: [
      {
        title: "🎨 Interface",
        type: "fix",
        items: [
          "Títulos do app voltaram a respeitar a própria cor: rótulos de seção em azul e o cabeçalho do modal de novidades legível no tema claro.",
          "Página 404 usa as cores do tema e continua legível no modo escuro.",
        ],
      },
      {
        title: "📊 Estatísticas",
        type: "improvement",
        items: [
          "O mapa de consistência agora conta revisões concluídas e questões respondidas, não só sessões cronometradas.",
          "Dias sem minutos medidos ganham intensidade pelo volume de atividades.",
        ],
      },
      {
        title: "🗂️ Dados",
        type: "fix",
        items: [
          "Revisões repetidas no mesmo dia foram consolidadas — oito cópias de uma mesma revisão viraram uma só.",
        ],
      },
      {
        title: "🔄 Sync & Backup",
        type: "fix",
        items: [
          "Histórico de backups mostra a hora de cada arquivo e não quebra mais a linha de data/tamanho.",
          "O botão de restaurar backup fica visível no celular, onde não existe hover.",
        ],
      },
    ],
  },
  {
    version: "6.7.9",
    date: "29/10/2026",
    title: "Splash com a marca nova",
    categories: [
      {
        title: "🎨 Identidade",
        type: "improvement",
        items: [
          "Tela de abertura com o ícone azul do app e apenas o nome SOE.",
        ],
      },
    ],
  },
  {
    version: "6.7.8",
    date: "29/10/2026",
    title: "Dia em modal com fundo desfocado e fim das revisões duplicadas",
    categories: [
      {
        title: "📅 Calendário",
        type: "improvement",
        items: [
          "O fundo escurece e desfoca de verdade quando o dia abre em modal.",
          "A trilha lateral desaparece suavemente enquanto o modal está aberto.",
          "Modal mais largo, animação de entrada mais suave e o botão de fechar não sobrepõe mais o Abrir dia.",
        ],
      },
      {
        title: "🐞 Revisões duplicadas",
        type: "fix",
        items: [
          "A criação de revisões agora é idempotente: a mesma revisão (tópico + data + número + tipo) não é mais inserida duas vezes a cada importação.",
          "Sete revisões duplicadas que já estavam na base foram removidas, com backup em data/backups.",
        ],
      },
    ],
  },
  {
    version: "6.7.7",
    date: "29/10/2026",
    title: "Importação opcional de caderno do TEC",
    categories: [
      {
        title: "📥 TEC",
        type: "feature",
        items: [
          "Nova opção em Estudar → Mais ferramentas: importar caderno colando as linhas que você já vê no TEC.",
          "Nada é lido do site automaticamente — é uma importação manual, sem risco para a conta.",
          "Os totais são absolutos e só aumentam: o SOE nunca reduz o seu histórico.",
          "Tópicos com nome diferente do cadastro aparecem como ignorados.",
          "Funciona também no APK, no banco local.",
        ],
      },
    ],
  },
  {
    version: "6.7.6",
    date: "29/10/2026",
    title: "Nome do app é SOE; plano e confiança funcionando no APK",
    categories: [
      {
        title: "📱 Nome",
        type: "improvement",
        items: [
          "O app aparece como SOE no Android, no Windows, no Linux, na janela e no PWA.",
        ],
      },
      {
        title: "🐞 APK",
        type: "fix",
        items: [
          "Plano passa a funcionar no modo offline: revisão semanal implementada no banco local.",
          "Registro de respostas e o prompt de confiança do TEC também ganharam versão offline.",
        ],
      },
    ],
  },
  {
    version: "6.7.5",
    date: "29/10/2026",
    title: "Dia em modal, confiança no TEC e fim da contagem inflada",
    categories: [
      {
        title: "📅 Calendário",
        type: "feature",
        items: [
          "Clicar em um dia abre a agenda daquele dia em um modal central, com animação de entrada.",
          "Filtros novos na trilha e no modal: Revisões e Testes, além de Todas, Pendentes e Feitas.",
          "O modal mostra o progresso do dia e o atalho Abrir dia.",
        ],
      },
      {
        title: "🐞 Contagem do TEC",
        type: "fix",
        items: [
          "Cada resposta agora registra no máximo uma questão por requisição — um payload com +300 é rejeitado.",
          "Sincronização de caderno só acontece em importação explícita; a captura automática não envia totais por tópico.",
        ],
      },
      {
        title: "🎯 Calibração",
        type: "feature",
        items: [
          "Depois de cada resposta capturada do TEC, o app pergunta como foi: sabia, ficou na dúvida ou chutou.",
          "A resposta é gravada no histórico com o grau de confiança, alimentando a calibração e o Mentor.",
        ],
      },
      {
        title: "🎨 Tema",
        type: "improvement",
        items: [
          "Diálogos e menus agora herdam o tema do layout focado (antes caíam nas cores antigas).",
        ],
      },
    ],
  },
  {
    version: "6.7.4",
    date: "29/10/2026",
    title: "Ícone novo também na extensão do Chrome",
    categories: [
      {
        title: "🧩 Extensão",
        type: "improvement",
        items: [
          "Ícones 16/48/128 da extensão agora usam a mesma marca do app (livro azul).",
          "Pacote client/public/soe-extension.zip regerado com os ícones novos.",
          "Versão do manifest da extensão para 1.0.1 para o Chrome detectar a atualização.",
        ],
      },
    ],
  },
  {
    version: "6.7.3",
    date: "29/10/2026",
    title: "Novo ícone do app para desktop e Android",
    categories: [
      {
        title: "🎨 Identidade",
        type: "feature",
        items: [
          "Ícone novo com o livro aberto em azul, alinhado ao layout focado.",
          "Windows e Linux recebem o ícone no instalador, no atalho e na janela.",
          "Android com ícone adaptativo (fundo azul) e versão redonda para launchers antigos.",
          "Favicon e ícones do PWA atualizados, com versão maskable.",
        ],
      },
    ],
  },
  {
    version: "6.7.2",
    date: "29/10/2026",
    title: "Calendário legível no celular",
    categories: [
      {
        title: "📱 Mobile",
        type: "improvement",
        items: [
          "A grade do mês no celular passa a mostrar pontos por dia em vez de rótulos cortados.",
          "Células mais compactas no mobile e o dia selecionado continua destacado.",
        ],
      },
    ],
  },
  {
    version: "6.7.1",
    date: "29/10/2026",
    title: "Correções do calendário, marcação de revisões e ajustes de layout",
    categories: [
      {
        title: "🐞 Correções",
        type: "fix",
        items: [
          "Marcar revisão como feita voltou a funcionar: o cache otimista usava uma chave de consulta diferente da lista do mês e a alteração não aparecia.",
          "A trilha do dia mostra o número da revisão e não repete mais o rótulo em cada linha.",
          "Removidas 12 revisões duplicadas da base (mesmo tópico, data e número), com backup em data/backups.",
        ],
      },
      {
        title: "📅 Calendário",
        type: "improvement",
        items: [
          "Grade do mês sem sobreposição de linhas e sem corte de conteúdo.",
          "Cada dia mostra quantas tarefas foram concluídas (ex.: 2/28).",
          "Cabeçalho do mês e ações em caixa de frase, alinhados ao layout focado.",
          "Filtros do dia no formato de controle segmentado.",
        ],
      },
      {
        title: "🎛️ Ajustes e Mentor",
        type: "improvement",
        items: [
          "Ajustes com o perfil e a navegação na coluna esquerda e um único título na página.",
          "Mentor IA com título de página acima do card de conversa.",
        ],
      },
    ],
  },
  {
    version: "6.7.0",
    date: "29/10/2026",
    title: "Telas do layout focado refeitas no padrão dos prints",
    categories: [
      {
        title: "🎨 Layout focado",
        type: "feature",
        items: [
          "Primitivas compartilhadas (PageTitle, Card, GroupedList, SegmentedControl, StatTile, ProgressBar) usadas pelas telas focadas.",
          "Topbar focado com breadcrumb SOE / página, busca, estatísticas e avatar; no mobile, avatar, SOE e busca.",
          "Sidebar focado sem o cartão de foco, com subtítulo do produto e rótulos discretos.",
          "Home refeita: missão compacta com prontidão, ritmo do dia, Para hoje com horário sugerido, matérias e coluna direita com anel, rotina base, edital, acerto geral e faixa da semana.",
          "Estudar refeito: hero do TEC, Praticar em 6 ferramentas e Conteúdo em 3 áreas.",
          "Treinos com seletor Questões / Sessões / Erros, cartões de métrica e atalhos reorganizados.",
          "Mentor IA com cabeçalho da conversa no padrão do print, dias restantes no contexto e sessões na coluna da direita.",
          "Ajustes alinhados à largura do layout focado, com navegação mais discreta.",
        ],
      },
      {
        title: "🧪 Qualidade",
        type: "improvement",
        items: [
          "Testes do modo focado: hub Estudar e seletor de visões de Treinos.",
          "Modo clássico preservado em Configurações → Aparência → Layout da interface.",
        ],
      },
    ],
  },
  {
    version: "6.6.4",
    date: "29/10/2026",
    title: "Layout focado, calendário com trilho do dia e TEC principal",
    categories: [
      {
        title: "🧭 Novo layout focado",
        type: "feature",
        items: [
          "Sidebar curta com Hoje, Aprender e Sistema; ferramentas agrupadas no hub Estudar.",
          "TEC em destaque como ferramenta principal do estudo.",
          "Grid do hub Estudar ajustado para desktop e mobile.",
          "Ajustes ganhou cabeçalho e navegação em grid no layout focado.",
          "Home focado reorganizado em missão, Para hoje e matérias, sem o vazio do layout antigo.",
          "Ajustes sem cabeçalho duplicado e Mentor IA com título visível.",
          "Mentor IA ganhou painel de contexto e sessões recentes no desktop.",
          "Ajustes adotou o título Mais e o calendário separa tarefas de dia inteiro.",
          "Tab bar mobile reorganizada em Hoje, Plano, Estudar, Calendário e Mais.",
          "Calendário mobile com um ponto por dia e lista do dia logo abaixo.",
          "Mentor IA com cabeçalho mais legível no layout focado.",
          "Modo clássico preservado em Configurações → Aparência → Layout da interface.",
        ],
      },
      {
        title: "📅 Calendário",
        type: "feature",
        items: [
          "Mês e trilho do dia lado a lado no desktop, com todas as tarefas visíveis.",
          "Lista do dia inline no mobile, abaixo da grade mensal.",
          "Clique no dia não abre mais modal; o modal fica para detalhes e edição.",
        ],
      },
      {
        title: "🎨 Identidade visual",
        type: "improvement",
        items: [
          "Paleta azul Apple, superfícies neutras e tipografia do sistema no layout focado.",
          "Dark mode preservado e layout clássico mantendo a identidade anterior.",
        ],
      },
      {
        title: "🧹 Limpeza",
        type: "fix",
        items: [
          "Remoção do onboarding modal inicial e do componente legado.",
          "Ajustes de build, testes e versão 6.6.4.",
        ],
      },
    ],
  },
  {
    version: "5.5.0",
    date: "27/04/2026",
    title: "Ecossistema de Mineração & Command Center",
    categories: [
      {
        title: "📅 Command Center",
        type: "feature",
        items: [
          "Redesign total do detalhe do dia no Calendário: interface de alta densidade com timeline vertical.",
          "Checklists interativos: marque suas tarefas diretamente na timeline com feedback visual tátil.",
          "Layout 'Apple-style' otimizado para produtividade, removendo redundâncias e melhorando a escala visual.",
        ],
      },
      {
        title: "⛏️ Mineração Sequential AI",
        type: "feature",
        items: [
          "Novo motor de mineração massiva: processe PDFs de 200+ questões com processamento paralelo e inteligente.",
          "Chunking Estratégico: a IA agora analisa o PDF em blocos para garantir que nenhuma questão seja perdida.",
          "Desduplicação Automática: proteção nativa contra questões repetidas durante a ingestão de dados.",
        ],
      },
      {
        title: "🎯 Treino de Elite",
        type: "improvement",
        items: [
          "Integração Mentor-Lab: recomendações do Mentor agora permitem iniciar o 'Treino de Elite' com um clique.",
          "Badge de Questões Integradas: visualize instantaneamente quais tópicos possuem questões mineradas prontas.",
          "Correção de tipagem tRPC: estabilidade garantida no tráfego de métricas de performance.",
        ],
      },
    ],
  },
  {
    version: "5.2.0",
    date: "25/04/2026",
    title: "Diagnóstico Tático & Rastreamento Resiliente",
    categories: [
      {
        title: "🛠️ Diagnóstico Tático",
        type: "feature",
        items: [
          "Ativação do DevTools (F12) no ambiente Electron para auditoria em tempo real do sistema.",
          "Novo sistema de logs de proxy no processo principal para monitoramento de sincronização.",
        ],
      },
      {
        title: "📊 Rastreamento Resiliente",
        type: "improvement",
        items: [
          "Algoritmo de Fuzzy Matching aprimorado: Contabilização inteligente de questões mesmo com divergências de nomes entre TEC e SOE.",
          "Fallback de Disciplina: Registro garantido de progresso mesmo quando a disciplina não é detectada automaticamente.",
          "Deduplicação de Requisições: Proteção contra registros duplicados em conexões instáveis.",
        ],
      },
    ],
  },
  {
    version: "5.1.0",
    date: "24/04/2026",
    title: "Navegação Tática & Tour de Descoberta",
    categories: [
      {
        title: "🚀 Tour de Descoberta",
        type: "feature",
        items: [
          "Novo Guided Tour 360°: Uma jornada completa pelas funcionalidades do SOE.",
          "Motor de Spotlight Resiliente: Destaque visual infalível com suporte a navegação multi-página.",
          "Fallback Inteligente: O tour nunca trava, permitindo pular etapas ou navegar livremente.",
        ],
      },
      {
        title: "🧠 Mentor de Elite",
        type: "improvement",
        items: [
          "Recomendações Granulares: A IA agora analisa platôs, regressões e erros do TEC para sugerir ações reais.",
          "Botão 'Recalcular Rota': Force uma nova análise tática do Mentor a qualquer momento.",
          "Diagnósticos Técnicos: Chega de dicas genéricas; agora o Mentor diz exatamente onde você está perdendo pontos.",
        ],
      },
      {
        title: "🛠️ Robustez Visual",
        type: "fix",
        items: [
          "Correção de bugs de renderização no destaque de elementos (black screen bug fix).",
          "Ajuste de posicionamento automático de cards explicativos em telas menores.",
        ],
      },
    ],
  },
  {
    version: "5.0.0",
    date: "24/04/2026",
    title: "Autonomia & Inteligência",
    categories: [
      {
        title: "🤖 IA de Ingestão",
        type: "feature",
        items: [
          "Fim da dependência de planilhas: Importação de editais via PDF ou Texto com IA.",
          "Extração automática de disciplinas e tópicos com alta precisão.",
          "Novo modal de 'Adição Rápida' para colagem manual de listas de temas.",
        ],
      },
      {
        title: "⚙️ Ciclo Adaptativo",
        type: "feature",
        items: [
          "Otimização Estratégica de Ciclo: A IA reorganiza seu estudo com base nos seus pontos fracos.",
          "Cálculo automático de carga horária por slot e 'Saúde do Ciclo'.",
          "Animações fluidas e visual moderno de fluxo de estudos.",
        ],
      },
      {
        title: "📱 Mobile Experience",
        type: "fix",
        items: [
          "Correção definitiva dos erros 404 no TEC Browser em dispositivos Android.",
          "Interface do navegador adaptada com botões de controle e saída resilientes.",
          "Suporte a subdomínios mobile e reescrita de URLs dinâmica.",
        ],
      },
      {
        title: "📊 Gestão de Estudo",
        type: "improvement",
        items: [
          "Registro direto de tempo e questões resolvidas dentro de cada tema do edital.",
          "Melhoria na estabilidade do backend e correção do crash no registro de temas.",
        ],
      },
    ],
  },
  {
    version: "4.9.8",
    date: "24/04/2026",
    title: "A Era da Elegância e Estabilidade",
    categories: [
      {
        title: "✨ Design Premium",
        type: "improvement",
        items: [
          "Redesign completo dos cards do Calendário com estética 'Apple Glassmorphism'.",
          "Novo sistema de Zoom Global (80% a 200%) para máxima acessibilidade.",
          "Refinamento de tipografia e espaçamento para uma leitura menos cansativa.",
        ],
      },
      {
        title: "🛡️ Estabilidade",
        type: "fix",
        items: [
          "Correção de crash crítico ao registrar novos temas no edital.",
          "Otimização de performance no carregamento de estatísticas complexas.",
        ],
      },
    ],
  },
];
