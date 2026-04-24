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
