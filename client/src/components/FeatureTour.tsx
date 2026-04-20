/**
 * FeatureTour — Tour guiado completo do SOE.
 *
 * Correções v2:
 * - Tooltip nunca sai da viewport (clamp em todas as direções)
 * - HelpButton integrado na sidebar (não flutua sobre o Tema)
 * - Descrições longas e ricas
 * - Navegação robusta entre steps sem desaparecer
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, X, HelpCircle, CheckCircle2,
  GraduationCap, ClipboardList, BarChart2, BookOpen, Pencil, RefreshCw,
  TrendingUp, Brain, Search, Ruler, Target, Lightbulb, Trophy, Layers,
  CalendarDays, FileText, Cloud, Clock, Palette, Flame, Zap,
  ListChecks, Upload,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  GraduationCap, ClipboardList, BarChart2, BookOpen, Pencil, RefreshCw,
  TrendingUp, Brain, Search, Ruler, Target, Lightbulb, Trophy, Layers,
  CalendarDays, FileText, Cloud, Clock, Palette, Flame, Zap,
  ListChecks, Upload,
};

// ─── Steps ───────────────────────────────────────────────────────────────────

const TOUR_STEPS = [
  {
    id: "welcome",
    title: "Bem-vindo ao SOE — Sistema de Otimização de Estudos",
    description: "Você está prestes a conhecer uma das ferramentas mais completas para estudar para concursos. O SOE não é apenas um caderno de anotações — ele usa estatística real para dizer onde você perde pontos, quando vai estar pronto para cada tema e qual matéria dá mais retorno por hora de estudo. Este tour tem 25 passos e cobre TUDO. Use as setas ou clique nos pontos para navegar. Pressione → para começar.",
    target: null,
    position: "center",
    icon: "GraduationCap",
  },
  {
    id: "sidebar",
    title: "Menu Lateral — Sua Base de Operações",
    description: "O menu lateral esquerdo dá acesso a todas as seções do sistema. Você pode recolhê-lo clicando na seta (←) para ganhar mais espaço na tela. As seções principais (Dashboard, Disciplinas, Revisões, Estatísticas, Flashcards) ficam com destaque dourado quando ativas. Em dispositivos móveis, o menu migra para a parte inferior da tela como uma barra de navegação.",
    target: "aside",
    position: "right",
    icon: "ClipboardList",
  },
  {
    id: "dashboard-main",
    title: "Dashboard — Central de Comando",
    description: "O Dashboard é a tela inicial e mostra um panorama completo dos seus estudos. No topo você vê 4 cartões de resumo: total de temas estudados, revisões pendentes, revisões concluídas e seu streak atual (sequência de dias estudando). Embaixo ficam todas as suas disciplinas com os temas expandíveis. O Dashboard é atualizado em tempo real conforme você registra questões e importa dados.",
    target: "[data-tour='import-tec']",
    position: "bottom",
    icon: "BarChart2",
  },
  {
    id: "import-tec",
    title: "Importar do TEC Concursos — Zero Digitação Manual",
    description: "Este é o botão de importação mais poderoso do sistema. Clique em 'Importar TEC' e selecione a planilha .xlsx exportada do TEC Concursos. O SOE vai: (1) identificar automaticamente as disciplinas pelo nome, (2) cruzar com seus temas já cadastrados, (3) atualizar os acertos e erros de cada tema. Se uma disciplina ou tema não existir, ele cria automaticamente. Você não precisa digitar nada — basta exportar do TEC e importar aqui.",
    target: "[data-tour='import-tec']",
    position: "bottom",
    icon: "⬆",
  },
  {
    id: "disciplines-nav",
    title: "Disciplinas — Estrutura do seu Edital",
    description: "Acesse pelo menu lateral. Aqui você cadastra cada disciplina com um nome, uma cor (para identificação visual nos gráficos) e um peso (a importância daquela matéria no edital, de 1 a 100). O peso é crucial: ele influencia nos cálculos de Prejuízo Real do SOE Analytics — uma disciplina com peso 30 que você acerta 50% é muito mais urgente do que uma com peso 5 que você acerta 40%. Você também pode reordenar as disciplinas por drag-and-drop.",
    target: "[data-tour='nav-disciplines']",
    position: "right",
    icon: "BookOpen",
  },
  {
    id: "topics-nav",
    title: "Temas — O Coração do Sistema de Revisão",
    description: "Cada tema estudado é registrado aqui com: nome, disciplina, data de estudo e anotações. Ao registrar um tema, o SOE agenda AUTOMATICAMENTE: 2 revisões (em 25 e 50 dias, seguindo a Curva de Ebbinghaus) e testes aleatórios a cada 3+ dias. Você também pode editar o TEMPO DE ESTUDO diretamente — ideal para quem tem dados em outras planilhas e quer migrar para o SOE. Basta clicar no lápis e digitar horas e minutos.",
    target: "[data-tour='nav-topics']",
    position: "right",
    icon: "BookOpen",
  },
  {
    id: "question-session",
    title: "Sessão de Questões — Registro em Tempo Real",
    description: "A Sessão de Questões é o modo de estudo ativo do SOE. Configure a disciplina, o tema e o número de questões da sessão. Durante a resolução, você marca cada questão como Acertei ou Errei. Ao errar, o sistema imediatamente pede a origem: Atenção, Esquecimento, Teoria ou Pegadinha. O cronômetro só começa quando você clica em Iniciar — e o tempo registrado é salvo automaticamente nas estatísticas de tempo de estudo do tema. Ao final, o resumo mostra a taxa de acerto e um diagnóstico visual das origens dos seus erros.",
    target: "[data-tour='nav-question-session']",
    position: "right",
    icon: "ListChecks",
  },
  {
    id: "questions-register",
    title: "Registrar Questões Manualmente",
    description: "No Dashboard, ao lado de cada tema, há um ícone de gráfico para registro manual rápido. Escolha entre ADICIONAR ao total existente (para sessões diárias) ou SUBSTITUIR (para atualizar com dados do TEC). O campo de ORIGEM DO ERRO permite classificar: Atenção, Esquecimento, Teoria ou Pegadinha. Para sessões longas com muitas questões, prefira o modo Sessão de Questões — ele é mais eficiente e registra o tempo automaticamente.",
    target: "[data-tour='import-tec']",
    position: "bottom",
    icon: "Pencil",
  },
  {
    id: "revisions-nav",
    title: "Revisões — Combatendo o Esquecimento Ativo",
    description: "A Curva de Ebbinghaus mostra que esquecemos 70% do que aprendemos em 24h se não revisarmos. O SOE agenda revisões exatamente nos momentos certos para ancorar o conhecimento. Nesta tela você vê todas as revisões e testes pendentes, organizados por data. Marque como concluída após revisar, ou ignore se o tema não é mais relevante. Revisões muito atrasadas aparecem em vermelho como urgentes. O Ciclo de Revisão Dinâmico (no SOE Analytics) ajusta os intervalos baseado no seu desempenho real.",
    target: "[data-tour='nav-revisions']",
    position: "right",
    icon: "RefreshCw",
  },
  {
    id: "statistics-nav",
    title: "Estatísticas — 3 Camadas de Análise",
    description: "A seção de Estatísticas tem 3 abas diferentes. 'Visão Geral' mostra gráficos de tempo de estudo por disciplina, radar de acerto, evolução em simulados e correlação esforço vs resultado. 'Por Tema' é uma tabela detalhada com filtros, busca e ordenação por qualquer coluna. 'Análise SOE' é o módulo de inteligência avançada com 5 sub-módulos de estatística preditiva — clique em 'Como funciona' dentro de qualquer aba para ver a explicação técnica completa de cada análise.",
    target: "[data-tour='nav-statistics']",
    position: "right",
    icon: "TrendingUp",
  },
  {
    id: "analytics-intro",
    title: "Análise SOE — O Cérebro Matemático do Sistema",
    description: "O módulo Análise SOE (dentro de Estatísticas) é onde a mágica acontece. Ele está dividido em 5 abas: Diagnóstico (onde e por que você erra), Estatística Preditiva (regressão linear, ROI, volatilidade, stress test), Estratégia de Edital (Pareto, Z-Score, custo-benefício), Memória e Retenção (obsolescência, risco de branco, saturação), e Comportamento (delta de evolução, anotações, gamificação, agenda de socorro). Cada módulo usa dados reais dos seus estudos.",
    target: "[data-tour='nav-statistics']",
    position: "right",
    icon: "Brain",
  },
  {
    id: "analytics-diagnostico",
    title: "Análise SOE: Módulo Diagnóstico",
    description: "A aba Diagnóstico responde: 'Por que estou errando?' com 5 análises:\n• Matriz de Origem do Erro: gráfico visual mostrando % de erros por Atenção, Esquecimento, Teoria e Pegadinha — para saber SE você precisa descansar, revisar ou estudar mais.\n• Prejuízo Real: não é quem erra MAIS que precisa de atenção, é quem perde MAIS PONTOS. Uma disciplina com 20 questões na prova e 50% de acerto é mais urgente que outra com 1 questão e 30%.\n• Relatório de Cegueira: temas onde você fez 30+ questões mas o acerto não passa de 70% — sinal de que está estudando do jeito errado.\n• Top 5 Vilões: os 5 temas com pior acerto que mais derrubam sua nota.",
    target: null,
    position: "center",
    icon: "Search",
  },
  {
    id: "analytics-preditivo",
    title: "Análise SOE: Estatística Preditiva",
    description: "A aba Preditiva usa matemática para ver o futuro dos seus estudos:\n• Índice de Volatilidade (Desvio Padrão): se você varia entre 40% e 90%, você é instável. O SOE identifica quais temas têm desempenho imprevisível — perigoso na hora da prova.\n• Regressão Linear: traça uma linha de tendência do seu progresso e estima a data em que você estará pronto para gabaritar cada tema.\n• ROI (Retorno por Hora): divide seu acerto pelo tempo de estudo. Mostra qual matéria dá mais resultado por hora investida — e quais estão 'travadas'.\n• Stress Test: simula seu pior dia possível. Se der ruim na prova, qual seria sua nota mínima? Define a zona de segurança.",
    target: null,
    position: "center",
    icon: "Ruler",
  },
  {
    id: "analytics-estrategia",
    title: "Análise SOE: Estratégia de Edital",
    description: "A aba Estratégia resolve a maior dúvida do concurseiro: 'O que estudar AGORA?'\n• Pareto 80/20: mostra os 20% de temas responsáveis por 80% dos seus erros totais. Resolver esses poucos temas causará um salto enorme na nota.\n• Z-Score (Gordura): calcula onde você já é 'faixa preta' (Z > +1) e pode reduzir tempo, e onde está devendo (Z < -1) e precisa de atenção urgente.\n• Aprofundar vs. Avançar: sinal verde quando acerto ≥ 75% e estável — pode ir para o próximo tema. Vermelho = precisa de mais questões antes de avançar.\n• Temas Órfãos: varre todo o edital e aponta quais tópicos ainda não têm nenhuma questão registrada.",
    target: null,
    position: "center",
    icon: "Target",
  },
  {
    id: "analytics-memoria",
    title: "Análise SOE: Memória e Retenção",
    description: "A aba Memória usa a ciência do esquecimento para proteger seus pontos:\n• Termômetro de Obsolescência: temas não revisados há mais de 14 dias começam a 'decair' visualmente — uma barra vermelha cresce conforme o esquecimento avança.\n• Risco de Branco: detecta temas que combinam longo tempo sem revisão + acerto abaixo de 80%, disparando um alerta de 'Risco de Branco iminente'.\n• Índice de Saturação: se você fez mais de 100 questões de um tema e o acerto não passa de 75%, pode ser que esteja memorizando gabaritos, não aprendendo. Hora de mudar a fonte de questões.\n• Ciclo de Revisão Dinâmico: quanto pior seu acerto, mais cedo você revisa. Não há intervalos fixos — tudo é baseado no seu desempenho real.",
    target: null,
    position: "center",
    icon: "Lightbulb",
  },
  {
    id: "analytics-comportamento",
    title: "Análise SOE: Comportamento e Motivação",
    description: "A aba Comportamento cuida da sua motivação e organização:\n• Delta de Evolução: mostra seta verde (↑) ou vermelha (↓) em cada tema comparando com a última sessão — feedback imediato de evolução.\n• Anotações por Tema: registre dicas sobre pegadinhas, artigos-chave ou macetes específicos de cada tema. Quando você errar aquele tema de novo, a anotação aparece como lembrete.\n• Gamificação Bronze/Prata/Ouro: temas com acerto < 60% = Bronze, 60-79% = Prata, ≥ 80% = Ouro. O objetivo é limpar o painel, transformando todos em Ouro.\n• Agenda de Socorro: após cada sessão de estudos, o SOE gera automaticamente uma lista dos 3 temas prioritários para focar amanhã — sem indecisão.",
    target: null,
    position: "center",
    icon: "Trophy",
  },
  {
    id: "flashcards-nav",
    title: "Flashcards — Memorização Rápida",
    description: "O módulo de Flashcards é perfeito para memorizar: artigos de lei com números exatos, definições doutrinárias, conceitos que caem muito em questões de múltipla escolha e qualquer coisa que exige lembrança imediata. Crie baralhos por disciplina, revise no modo flip (frente/verso) e marque como aprendido quando dominar. Ideal para usar nos intervalos de estudo ou no transporte.",
    target: "[data-tour='nav-flashcards']",
    position: "right",
    icon: "Layers",
  },
  {
    id: "calendar-nav",
    title: "Calendário — Sua Semana de Estudos Visualizada",
    description: "O Calendário mostra todas as revisões e testes agendados em formato de calendário mensal. Você consegue ver rapidamente: quais dias estão sobrecarregados de revisões, quais semanas têm mais testes, e planejar o estudo de novos temas para dias mais livres. Clique em qualquer evento para ver detalhes do tema. Cores diferentes indicam se é uma revisão ou um teste.",
    target: "[data-tour='nav-calendar']",
    position: "right",
    icon: "CalendarDays",
  },
  {
    id: "edital-nav",
    title: "Edital — Visão Estratégica Completa",
    description: "Importe o edital do seu concurso em formato .xlsx ou cadastre manualmente os tópicos. O sistema permite marcar cada item como concluído, adicionar notas, e visualizar o progresso geral por disciplina. Os dados do edital (especialmente o peso/incidência de cada tópico) são integrados com o SOE Analytics para calcular o Prejuízo Real e o Edital Verticalizado Dinâmico — que mede não quantos temas você estudou, mas quantos PONTOS DA PROVA você já garantiu.",
    target: "[data-tour='nav-edital']",
    position: "right",
    icon: "FileText",
  },
  {
    id: "mock-exams",
    title: "Simulados — Dados Limpos de Prova Real",
    description: "Registre seus simulados separadamente do treino diário. Para cada simulado informe: acertos, erros, questões em branco e a pontuação (útil para bancas CESPE onde erros descontam). O SOE mantém esses dados isolados do banco de questões diárias para que suas estatísticas de 'treino' não contaminem os números de 'prova real'. No gráfico de Evolução nos Simulados você verá sua curva de aprendizado ao longo do tempo.",
    target: "[data-tour='nav-statistics']",
    position: "right",
    icon: "FileText",
  },
  {
    id: "notes-nav",
    title: "Documentos — Anotações Organizadas",
    description: "O módulo de Documentos permite criar anotações ricas por disciplina e tema. Diferente das anotações rápidas nos temas (que são dicas de pegadinhas), os Documentos são para resumos mais longos, mapas mentais em texto, comparativos entre institutos e qualquer material que você queira ter sempre acessível. Os documentos ficam salvos no banco de dados do SOE e sincronizam com o backup automático.",
    target: "[data-tour='nav-notes']",
    position: "right",
    icon: "BookOpen",
  },
  {
    id: "sync-nav",
    title: "Sync & Backup — Seus Dados Sempre Seguros",
    description: "O SOE faz backup automático toda vez que você abre o sistema. Nesta seção você pode: fazer um backup manual a qualquer momento, exportar todos os seus dados em JSON (para guardar localmente), e sincronizar com o Google Drive. Nunca perca anos de histórico de estudos. Recomendamos fazer backup manual antes de atualizações do sistema ou migrar para outro computador.",
    target: "[data-tour='nav-sync']",
    position: "right",
    icon: "Cloud",
  },
  {
    id: "study-timer",
    title: "Timer de Estudo — Cronometragem Automática",
    description: "O timer de estudo fica no canto inferior da tela e cronometra automaticamente o tempo que você passa em cada área do sistema. Quando você para o timer e registra uma sessão, o tempo é creditado no tema selecionado. Isso alimenta o cálculo de ROI (Retorno por Hora) no SOE Analytics. Você também pode editar o tempo manualmente nos temas, caso tenha estudado offline ou em outra planilha.",
    target: null,
    position: "center",
    icon: "Clock",
  },
  {
    id: "theme-picker",
    title: "Temas Visuais — Personalização Total",
    description: "Clique no botão 'Tema' no final do menu lateral para trocar o esquema de cores. Há diversas opções: Dourado (padrão), Azul, Verde, Roxo, Ciano, Laranja e mais. Para cada cor você também pode alternar entre modo Claro (fundo branco) e modo Escuro (fundo preto). Encontre a combinação que deixa seus olhos mais confortáveis para longas sessões de estudo.",
    target: "[data-tour='theme-picker']",
    position: "right",
    icon: "Palette",
  },
  {
    id: "streak",
    title: "Streak — Consistência é Tudo",
    description: "O streak (sequência de dias) aumenta a cada dia em que você registra pelo menos 1 questão, cria um tema ou faz uma revisão. A consistência diária supera qualquer maratona esporádica — estudar 1 hora por dia por 6 meses é muito mais eficaz do que estudar 12 horas num final de semana. O SOE foi projetado para criar esse hábito. Seu melhor streak fica registrado no perfil para motivação.",
    target: null,
    position: "center",
    icon: "Flame",
  },
  {
    id: "done",
    title: "Você está pronto para dominar o SOE!",
    description: "Tour concluído. Aqui está o roteiro inicial recomendado:\n\n1. Crie suas disciplinas com cores e pesos do edital\n2. Registre os temas já estudados com a data correta\n3. Importe sua planilha do TEC Concursos\n4. Marque as revisões pendentes no Calendário\n5. Depois de 2 semanas de dados, explore o SOE Analytics\n\nSempre que precisar rever este tour, clique no botão '?' que fica ao lado do botão 'Tema' no menu lateral. Bons estudos — você vai gabaritar!",
    target: null,
    position: "center",
    icon: "Zap",
  },
];

// ─── Posicionamento seguro (nunca sai da viewport) ───────────────────────────

const TOOLTIP_W = 520;
const TOOLTIP_MAX_H = 480;
const MARGIN = 16;
const PAD = 10;

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function computeTooltipStyle(
  rect: DOMRect | null,
  position: string,
): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect || position === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: Math.min(TOOLTIP_W, vw - MARGIN * 2),
      zIndex: 10001,
    };
  }

  let top: number;
  let left: number;

  if (position === "right") {
    left = rect.right + PAD + MARGIN;
    top = rect.top + rect.height / 2 - TOOLTIP_MAX_H / 2;
    // If no room on right, flip to center
    if (left + TOOLTIP_W + MARGIN > vw) {
      left = clamp(rect.left - TOOLTIP_W - PAD - MARGIN, MARGIN, vw - TOOLTIP_W - MARGIN);
    }
  } else if (position === "left") {
    left = rect.left - TOOLTIP_W - PAD - MARGIN;
    top = rect.top + rect.height / 2 - TOOLTIP_MAX_H / 2;
    if (left < MARGIN) left = rect.right + PAD + MARGIN;
  } else if (position === "bottom") {
    top = rect.bottom + PAD + MARGIN;
    left = rect.left;
    if (top + TOOLTIP_MAX_H + MARGIN > vh) top = rect.top - TOOLTIP_MAX_H - PAD - MARGIN;
  } else { // top
    top = rect.top - TOOLTIP_MAX_H - PAD - MARGIN;
    left = rect.left;
    if (top < MARGIN) top = rect.bottom + PAD + MARGIN;
  }

  // Clamp both axes to viewport
  top  = clamp(top,  MARGIN, vh - TOOLTIP_MAX_H - MARGIN);
  left = clamp(left, MARGIN, vw - TOOLTIP_W    - MARGIN);

  return {
    position: "fixed",
    top,
    left,
    width: Math.min(TOOLTIP_W, vw - MARGIN * 2),
    zIndex: 10001,
  };
}

// ─── Main FeatureTour ────────────────────────────────────────────────────────

interface FeatureTourProps {
  running: boolean;
  onClose: () => void;
}

export function FeatureTour({ running, onClose }: FeatureTourProps) {
  const [step, setStep]     = useState(0);
  const [rect, setRect]     = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(true);
  const rafRef = useRef<number | null>(null);

  const current = TOUR_STEPS[step];
  const total   = TOUR_STEPS.length;

  // Update spotlight rect
  const measureTarget = useCallback(() => {
    if (!running) return;
    if (!current.target) { setRect(null); return; }
    const el = document.querySelector(current.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [running, current.target]);

  useEffect(() => {
    if (!running) return;
    setStep(0);
    setVisible(true);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    setVisible(false);
    // Small delay for animation reset then re-measure
    const t = setTimeout(() => {
      measureTarget();
      setVisible(true);
    }, 80);
    return () => clearTimeout(t);
  }, [step, running, measureTarget]);

  useEffect(() => {
    if (!running) return;
    const onResize = () => measureTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [running, measureTarget]);

  // Scroll target into view
  useEffect(() => {
    if (!running || !current.target) return;
    const el = document.querySelector(current.target);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [step, running, current.target]);

  // Keyboard nav
  useEffect(() => {
    if (!running) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") goNext();
      if (e.key === "ArrowLeft")  goPrev();
      if (e.key === "Escape")     onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  if (!running) return null;

  const goNext = () => {
    if (step < total - 1) setStep(s => s + 1);
    else onClose();
  };
  const goPrev = () => setStep(s => Math.max(0, s - 1));

  const tooltipStyle = computeTooltipStyle(rect, current.position || "center");
  const pct = Math.round(((step + 1) / total) * 100);

  const spotlightStyle: React.CSSProperties | undefined = rect ? {
    position: "fixed",
    top:    rect.top    - PAD,
    left:   rect.left   - PAD,
    width:  rect.width  + PAD * 2,
    height: rect.height + PAD * 2,
    borderRadius: 14,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
    border: "2px solid rgba(212,175,55,0.9)",
    zIndex: 10000,
    pointerEvents: "none",
    transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
  } : undefined;

  return (
    <>
      {/* Dark backdrop (no spotlight target) */}
      {!rect && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.72)",
            transition: "opacity 0.25s",
          }}
        />
      )}

      {/* Spotlight ring */}
      {rect && <div style={spotlightStyle} />}

      {/* Tooltip */}
      <div
        style={{
          ...tooltipStyle,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.18s ease",
        }}
      >
        <div style={{
          background: "var(--card-bg, #161616)",
          border: "1px solid rgba(212,175,55,0.45)",
          borderRadius: 18,
          padding: "22px 24px 18px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,175,55,0.1)",
          animation: visible ? "tour-pop 0.28s cubic-bezier(0.34,1.56,0.64,1)" : "none",
          maxHeight: TOOLTIP_MAX_H,
          overflowY: "auto",
        }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: "linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.08))",
                border: "1px solid rgba(212,175,55,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {(() => { const I = ICON_MAP[current.icon]; return I ? <I size={18} color="rgba(212,175,55,0.85)" /> : null; })()}
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted-text,#888)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                  Passo {step + 1} de {total}
                </div>
                <div style={{ fontSize: 12, color: "rgba(212,175,55,0.7)", fontWeight: 600 }}>
                  {Math.round(pct)}% concluído
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent", cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", color: "var(--muted-text,#888)", flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)", marginBottom: 16, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${pct}%`,
              background: "linear-gradient(90deg, #c49a2a, #d4af37, #f5e070)",
              transition: "width 0.35s ease",
              boxShadow: "0 0 8px rgba(212,175,55,0.5)",
            }} />
          </div>

          {/* Title */}
          <h3 style={{
            fontSize: 17, fontWeight: 800, color: "var(--app-fg,#fff)",
            marginBottom: 10, lineHeight: 1.35, letterSpacing: "-0.01em",
          }}>
            {current.title}
          </h3>

          {/* Description — preserves \n as line breaks */}
          <div style={{ fontSize: 14, color: "var(--muted-text,#b0b0b0)", lineHeight: 1.65, marginBottom: 18 }}>
            {current.description.split("\n").map((line, i) => (
              <p key={i} style={{ marginBottom: line === "" ? 0 : 4 }}>
                {line || <br />}
              </p>
            ))}
          </div>

          {/* Nav row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={goPrev} disabled={step === 0}
              style={{
                padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: "transparent",
                border: `1px solid ${step === 0 ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.15)"}`,
                color: step === 0 ? "rgba(255,255,255,0.2)" : "var(--app-fg,#fff)",
                cursor: step === 0 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
              }}
            >
              <ChevronLeft size={13} /> Anterior
            </button>

            {/* Dot indicators (max 14 visible) */}
            <div style={{ flex: 1, display: "flex", gap: 3, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {TOUR_STEPS.slice(0, 14).map((_, i) => (
                <button key={i} onClick={() => setStep(i)} style={{
                  width: i === step ? 18 : 6, height: 6, borderRadius: 3,
                  background: i === step ? "#d4af37" : i < step ? "rgba(212,175,55,0.45)" : "rgba(255,255,255,0.12)",
                  transition: "all 0.2s", border: "none", cursor: "pointer", padding: 0, flexShrink: 0,
                }} />
              ))}
              {total > 14 && <span style={{ fontSize: 9, color: "var(--muted-text)", marginLeft: 2 }}>+{total - 14}</span>}
            </div>

            <button onClick={goNext}
              style={{
                padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, flexShrink: 0,
                background: step === total - 1
                  ? "linear-gradient(135deg, #d4af37, #f5e070)"
                  : "linear-gradient(135deg, #c49a2a, #d4af37)",
                color: "#1a1a1a", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
                boxShadow: "0 2px 14px rgba(212,175,55,0.4)",
              }}
            >
              {step === total - 1 ? <><CheckCircle2 size={13} /> Concluir</> : <>Próximo <ChevronRight size={13} /></>}
            </button>
          </div>

          {/* Keyboard hint */}
          <div style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
            Use ← → para navegar · Esc para fechar
          </div>
        </div>
      </div>

      <style>{`
        @keyframes tour-pop {
          from { opacity: 0; transform: scale(0.88) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}

// ─── HelpButton — integrated inside sidebar (not floating) ──────────────────

interface HelpButtonProps {
  onStart: () => void;
  collapsed?: boolean;
}

export function HelpButton({ onStart, collapsed }: HelpButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      data-tour="help-button"
      onClick={onStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[13px] hover:opacity-90 transition-all ${collapsed ? "justify-center" : ""}`}
      style={{
        background: hovered
          ? "linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.08))"
          : "transparent",
        border: "1px solid transparent",
        color: "var(--gold, #d4af37)",
        cursor: "pointer",
        transition: "all 0.18s ease",
      }}
      title="Tour guiado — aprenda todas as funcionalidades"
    >
      <HelpCircle
        className="w-[15px] h-[15px] flex-shrink-0"
        style={{ color: "var(--gold, #d4af37)" }}
      />
      {!collapsed && (
        <span className="font-medium" style={{ color: "var(--gold, #d4af37)" }}>
          Ajuda / Tour
        </span>
      )}
    </button>
  );
}
