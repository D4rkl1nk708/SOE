import { Link } from "wouter";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  ChevronRight,
  ClipboardX,
  Clock,
  FileText,
  Layers,
  NotebookPen,
  Play,
  Sheet,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { PageTitle, Card, SectionLabel } from "@/components/apple";
import { trpc } from "@/lib/trpc";
import { openTecBrowser } from "@/lib/openTecBrowser";

function HubTile({
  to,
  icon: Icon,
  title,
  description,
  count,
  onClick,
}: {
  to?: string;
  icon: LucideIcon;
  title: string;
  description: string;
  count?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
          <Icon size={17} />
        </span>
        {count && (
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h3>
          <ChevronRight
            size={14}
            className="shrink-0 text-muted-foreground/60"
          />
        </div>
        <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">
          {description}
        </p>
      </div>
    </>
  );

  const className =
    "apple-card flex flex-col p-4 text-left transition-colors hover:bg-secondary/30";

  if (to) {
    return (
      <Link href={to} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

export default function StudyHub() {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: revisions } = trpc.revision.list.useQuery({ completed: false });
  const { data: errorsPage } = trpc.questionError.list.useQuery({ limit: 200 });
  const { data: exams } = trpc.mockExam.list.useQuery();
  const { data: pushTokenData } = trpc.import.getICalUrl.useQuery();

  const today = format(new Date(), "yyyy-MM-dd");
  const revisionCount = (revisions ?? []).filter(
    (revision: any) => !revision.ignored && revision.scheduledDate <= today,
  ).length;
  const errorCount =
    (errorsPage as any)?.total ?? errorsPage?.items?.length ?? 0;
  const disciplineCount = stats?.disciplineStats?.length ?? 0;
  const examCount = exams?.length ?? 0;

  const openTec = () => {
    void openTecBrowser(pushTokenData?.token || "");
  };

  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-6 pb-12">
      <PageTitle
        title="Estudar"
        subtitle="Praticar, revisar e consultar o conteúdo do seu edital."
        actions={
          <>
            <Link
              href="/profile"
              className="flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-4 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary/60"
            >
              <SlidersHorizontal size={14} /> Personalizar
            </Link>
            <Link
              href="/question-session"
              className="flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Play size={14} /> Começar treino
            </Link>
          </>
        }
      />

      {/* Ferramenta principal: o TEC continua sendo o centro do fluxo. */}
      <Card
        className="overflow-hidden"
        style={{
          background: "var(--primary-bg-subtle)",
          borderColor: "transparent",
        }}
      >
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] bg-card text-primary">
              <BookOpen size={21} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                Treino TEC
              </h2>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-5 text-muted-foreground">
                Abra o TEC pelo SOE; cada acerto e erro entra no histórico
                automaticamente, sem preencher nada.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:justify-end">
            <button
              type="button"
              onClick={openTec}
              className="flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Play size={14} /> Abrir TEC
            </button>
            <Link
              href="/question-session"
              className="flex h-9 items-center gap-1 rounded-[10px] px-2 text-[12.5px] font-medium text-primary hover:underline"
            >
              Ver sessão <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </Card>

      <section className="space-y-2.5">
        <SectionLabel
          action={
            <span className="text-[11px] text-muted-foreground">
              6 ferramentas
            </span>
          }
        >
          Praticar
        </SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <HubTile
            to="/question-session"
            icon={BookOpen}
            title="Treino TEC"
            description="Captura automática da sessão no TEC."
            count="ativo"
          />
          <HubTile
            to="/lab"
            icon={Target}
            title="Treino adaptativo"
            description="Uma sessão feita para o seu momento."
            count="10 questões"
          />
          <HubTile
            to="/revisions"
            icon={Clock}
            title="Revisões"
            description="O que está vencido ou vence hoje."
            count={
              revisionCount
                ? `${revisionCount.toLocaleString("pt-BR")} vencidas`
                : "em dia"
            }
          />
          <HubTile
            to="/question-errors"
            icon={ClipboardX}
            title="Questões erradas"
            description="Erros que ainda precisam de atenção."
            count={errorCount ? `${errorCount} abertas` : "nenhuma"}
          />
          <HubTile
            to="/flashcards"
            icon={Brain}
            title="Flashcards"
            description="Revisão ativa em sessões curtas."
            count="48 cartões"
          />
          <HubTile
            to="/mock-exams"
            icon={FileText}
            title="Simulados"
            description="Provas completas, em papel ou na tela."
            count={examCount ? `${examCount} feitos` : "novo"}
          />
        </div>
      </section>

      <section className="space-y-2.5">
        <SectionLabel
          action={
            <span className="text-[11px] text-muted-foreground">3 áreas</span>
          }
        >
          Conteúdo
        </SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <HubTile
            to="/disciplines"
            icon={Layers}
            title="Disciplinas"
            description={`${disciplineCount || "Suas"} matérias e prioridades.`}
          />
          <HubTile
            to="/edital"
            icon={Sheet}
            title="Editais"
            description="Estrutura, cargos e pesos do concurso."
          />
          <HubTile
            to="/notes"
            icon={NotebookPen}
            title="Anotações"
            description="Notas ligadas ao conteúdo estudado."
          />
        </div>
      </section>

      <details className="group rounded-[12px] border border-border bg-card/60 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[12px] font-medium text-muted-foreground">
          Mais ferramentas
          <span className="transition-transform group-open:rotate-90">
            <ChevronRight size={14} />
          </span>
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { href: "/history", label: "Histórico" },
            { href: "/statistics", label: "Estatísticas" },
            { href: "/simulado", label: "Simulado rápido" },
            { href: "/profile", label: "Configurações" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[9px] border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    </div>
  );
}
