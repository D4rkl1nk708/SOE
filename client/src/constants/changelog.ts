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
