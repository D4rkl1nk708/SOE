import { Link } from "wouter";
import { format } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardX,
  Clock,
  FileText,
  Layers,
  NotebookPen,
  Play,
  Sheet,
  Target,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { openTecBrowser } from "@/lib/openTecBrowser";

function HubCard({
  to,
  icon: Icon,
  title,
  description,
  count,
  accent,
}: {
  to: string;
  icon: typeof BookOpen;
  title: string;
  description: string;
  count?: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={to}
      className={`soe-card group flex min-h-[132px] flex-col p-4 transition-colors hover:border-primary/30 ${
        accent ? "border-primary/25 bg-[var(--primary-bg-subtle)]" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div
          className={`grid h-8 w-8 place-items-center rounded-lg ${
            accent
              ? "bg-primary/15 text-primary"
              : "bg-secondary/60 text-muted-foreground"
          }`}
        >
          <Icon size={16} />
        </div>
        {count && (
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      <div className="mt-auto pt-4">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <ArrowRight
        size={14}
        className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-50"
      />
    </Link>
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
    <div className="space-y-7 pb-10">
      <PageHeader
        eyebrow="Aprender"
        title="Estudar"
        description="Tudo o que você usa para praticar e consultar, no mesmo lugar."
      />

      <section className="soe-card overflow-hidden border-primary/25 bg-[var(--primary-bg-subtle)]">
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Target size={24} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">
                  Ferramenta principal
                </span>
                <span className="rounded-full border border-primary/20 bg-card px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                  captura ativa
                </span>
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                Treino TEC
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Abra o TEC pelo SOE. Cada acerto e erro entra no seu histórico
                automaticamente, sem preencher nada.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-primary" /> captura
                  automática
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={12} /> sessão preservada
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button
              className="h-9 gap-2 rounded-md text-[10px] font-bold uppercase tracking-wider"
              onClick={openTec}
            >
              <Play size={13} /> Abrir TEC
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-9 rounded-md text-[10px] font-bold uppercase tracking-wider"
            >
              <Link href="/question-session">
                Ver sessão <ArrowRight size={13} className="ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/70">
              Praticar
            </p>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Escolha o próximo passo.
            </h2>
          </div>
          <span className="text-[10px] text-muted-foreground">
            4 ferramentas
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HubCard
            to="/revisions"
            icon={Clock}
            title="Revisões"
            description="O que está vencido ou vence hoje."
            count={revisionCount ? `${revisionCount} pendentes` : "em dia"}
          />
          <HubCard
            to="/question-errors"
            icon={ClipboardX}
            title="Questões erradas"
            description="Erros que ainda precisam de atenção."
            count={errorCount ? `${errorCount} abertas` : "nenhuma"}
          />
          <HubCard
            to="/flashcards"
            icon={Brain}
            title="Flashcards"
            description="Revisão ativa em sessões curtas."
            count="revisão ativa"
          />
          <HubCard
            to="/mock-exams"
            icon={FileText}
            title="Simulados"
            description="Provas completas, em papel ou na tela."
            count={examCount ? `${examCount} feitos` : "novo"}
            accent
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/70">
              Conteúdo
            </p>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              A base do seu edital.
            </h2>
          </div>
          <span className="text-[10px] text-muted-foreground">3 áreas</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <HubCard
            to="/disciplines"
            icon={Layers}
            title="Disciplinas"
            description={`${disciplineCount || "Suas"} matérias e prioridades.`}
            count={`${disciplineCount || 0} cadastradas`}
          />
          <HubCard
            to="/edital"
            icon={Sheet}
            title="Editais"
            description="Estrutura, cargos e pesos do concurso."
          />
          <HubCard
            to="/notes"
            icon={NotebookPen}
            title="Anotações"
            description="Notas ligadas ao conteúdo estudado."
          />
        </div>
      </section>

      <details className="group rounded-lg border border-border/60 bg-card/50 p-3">
        <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mais ferramentas
          <span className="ml-1 inline-block transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/lab"
            className="rounded-md border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary/50"
          >
            Treino adaptativo
          </Link>
          <Link
            href="/history"
            className="rounded-md border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary/50"
          >
            Histórico
          </Link>
          <Link
            href="/statistics"
            className="rounded-md border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary/50"
          >
            Estatísticas
          </Link>
        </div>
      </details>
    </div>
  );
}
