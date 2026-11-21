import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  GitCompareArrows,
  HelpCircle,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/apple";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { SavedLesson } from "@shared/topicLessons";
import { DocumentRail } from "./DocumentRail";
import { LessonPlayer } from "./LessonPlayer";
import SandboxFrame, { type MicroWorld } from "./SandboxFrame";
import { SectionStudyPanel } from "./SectionStudyPanel";
import { sectionPagesLabel, splitSectionIntoBlocks } from "./readingModel";
import type { CadernoVivoState } from "./useCadernoVivo";

type MobileAction = "questions" | "analogies" | "lesson";

/**
 * O leitor: uma ideia por vez.
 *
 * Esquerda: documentos + sumário. Centro: texto na medida de leitura, com a
 * página na margem quando o PDF trouxe esse metadado. Direita: "Estudar esta
 * seção". No mobile tudo vira uma coluna, o sumário vira seletor e as ações vão
 * para uma barra fixa no rodapé.
 */
export function ReadingSurface({ caderno }: { caderno: CadernoVivoState }) {
  const { doc, section, sections, sectionIndex } = caderno;
  const studyRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const utils = trpc.useUtils();
  // Artefato aberto: a animação precisa da coluna larga, não dos 320px do painel.
  const [stage, setStage] = useState<
    | { kind: "lesson"; lesson: SavedLesson }
    | { kind: "world"; world: MicroWorld }
    | null
  >(null);
  const [request, setRequest] = useState<{
    action: MobileAction;
    token: number;
  } | null>(null);
  const tokenRef = useRef(0);

  const stagedTopic = stage?.kind === "lesson" ? stage.lesson.topicName : "";
  const studiedQuery = trpc.learning.lessonStudiedToday.useQuery(
    { topicName: stagedTopic },
    { enabled: Boolean(stagedTopic) },
  );
  const markStudied = trpc.learning.markLessonStudied.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.recorded
          ? "Aula marcada como estudada hoje."
          : "Essa aula já estava marcada como estudada hoje.",
      );
      if (stagedTopic) {
        await utils.learning.lessonStudiedToday.invalidate({
          topicName: stagedTopic,
        });
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const openStage = (
    next:
      | { kind: "lesson"; lesson: SavedLesson }
      | { kind: "world"; world: MicroWorld },
  ) => {
    setStage(next);
    requestAnimationFrame(() =>
      stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const take = (value: SavedLesson | MicroWorld) =>
    "steps" in value
      ? openStage({ kind: "lesson", lesson: value as SavedLesson })
      : openStage({ kind: "world", world: value as MicroWorld });

  const blocks = useMemo(
    () => (section ? splitSectionIntoBlocks(section) : []),
    [section],
  );

  const triggerAction = (action: MobileAction) => {
    tokenRef.current += 1;
    setRequest({ action, token: tokenRef.current });
    studyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleImport = () => caderno.openFilePicker();

  return (
    <div className="learning-surface mx-auto w-full max-w-[1440px] pb-40 md:pb-28 xl:pb-6">
      <input
        ref={caderno.fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) caderno.handleFile(file);
          event.target.value = "";
        }}
      />

      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="apple-label">Leitura ativa</p>
          <h1 className="mt-0.5 text-[22px] font-semibold leading-7 tracking-tight text-foreground">
            Caderno Vivo
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-[12px]"
          onClick={handleImport}
          disabled={caderno.importPdf.isPending}
        >
          {caderno.importPdf.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          Importar PDF
        </Button>
      </header>

      {caderno.importPdf.isPending && (
        <div className="mb-4 rounded-[10px] border border-border bg-card p-3">
          <p className="text-[12px] font-medium text-foreground">
            Importando e dividindo em seções…
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            O texto do PDF é extraído página por página; PDF grande leva alguns
            segundos.
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      )}

      {caderno.docs.length === 0 && !caderno.importPdf.isPending ? (
        <div className="apple-card">
          <EmptyState
            title="Nenhum PDF importado"
            description="Importe um material seu (apostila, lei comentada, resumo). O SOE divide o texto em seções e cada seção ganha perguntas de recuperação, analogias e uma aula interativa."
            action={
              <Button
                size="sm"
                className="h-8 gap-1.5 px-3 text-[12px]"
                onClick={handleImport}
              >
                <FileText className="h-3.5 w-3.5" />
                Importar PDF
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[248px_minmax(0,1fr)] xl:gap-3 xl:grid-cols-[240px_minmax(0,1fr)_320px] 2xl:gap-5 2xl:grid-cols-[264px_minmax(0,1fr)_344px]">
          <div className="hidden lg:block">
            <DocumentRail caderno={caderno} onImport={handleImport} />
          </div>

          {/* Mobile: sumário vira seletor no topo. */}
          <div className="lg:hidden">
            <div className="flex gap-2">
              <select
                aria-label="Documento"
                value={caderno.docId ?? ""}
                onChange={(event) => caderno.selectDoc(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-[12px] text-foreground"
              >
                {caderno.docs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <select
                aria-label="Seção"
                value={sectionIndex}
                onChange={(event) =>
                  caderno.selectSection(Number(event.target.value))
                }
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-[12px] text-foreground"
              >
                {sections.map((item, index) => (
                  <option key={`${item.title}-${index}`} value={index}>
                    {index + 1}. {item.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <main className="min-w-0">
            {stage && (
              <div ref={stageRef} className="mb-4 scroll-mt-4">
                <div className="apple-card overflow-hidden p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {stage.kind === "lesson"
                        ? "Aula interativa"
                        : "Micro-mundo"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setStage(null)}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      Fechar e voltar ao texto
                    </button>
                  </div>
                  {stage.kind === "lesson" ? (
                    <LessonPlayer
                      lesson={stage.lesson}
                      studiedToday={Boolean(studiedQuery.data?.studied)}
                      marking={markStudied.isPending}
                      onMarkStudied={() =>
                        markStudied.mutate({
                          lessonId: stage.lesson.id,
                          topicName: stage.lesson.topicName,
                          topicId: stage.lesson.topicId,
                        })
                      }
                    />
                  ) : (
                    <SandboxFrame world={stage.world} />
                  )}
                </div>
              </div>
            )}
            {section ? (
              <article className="apple-card overflow-hidden">
                <header className="border-b border-border px-5 pb-3 pt-4">
                  <p className="truncate text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                    {doc?.title}
                  </p>
                  <h2 className="mt-1 text-[19px] font-semibold leading-6 tracking-tight text-foreground">
                    {section.title}
                  </h2>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    {sectionPagesLabel(section)} · seção {sectionIndex + 1} de{" "}
                    {sections.length}
                  </p>
                </header>

                {blocks.length === 0 ? (
                  <div className="px-5 py-8">
                    <EmptyState
                      title="Esta seção veio sem texto"
                      description="O PDF pode ter esta página como imagem. Escolha outra seção no sumário ou importe uma versão com texto selecionável."
                      action={
                        caderno.hasNextSection ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-[12px]"
                            onClick={() =>
                              caderno.goToSection(sectionIndex + 1)
                            }
                          >
                            Próxima seção
                          </Button>
                        ) : undefined
                      }
                    />
                  </div>
                ) : (
                  <div className="reading-prose px-4 py-5 sm:px-5 2xl:px-6">
                    {blocks.map((block, blockIndex) => (
                      <div
                        key={`block-${blockIndex}`}
                        className="reading-block"
                        data-page={block.page ?? undefined}
                      >
                        <span
                          className="reading-page"
                          aria-hidden={block.page ? undefined : "true"}
                        >
                          {block.page ? `p. ${block.page}` : ""}
                        </span>
                        <div className="min-w-0">
                          {block.paragraphs.map((paragraph, index) => (
                            <p key={`p-${blockIndex}-${index}`}>{paragraph}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                  <button
                    type="button"
                    disabled={!caderno.hasPrevSection}
                    onClick={() => caderno.goToSection(sectionIndex - 1)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-secondary disabled:opacity-35"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                  </button>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {sectionIndex + 1} / {sections.length}
                  </span>
                  <button
                    type="button"
                    disabled={!caderno.hasNextSection}
                    onClick={() => caderno.goToSection(sectionIndex + 1)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-secondary disabled:opacity-35"
                  >
                    Próxima
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </footer>
              </article>
            ) : (
              <div className="apple-card">
                <EmptyState
                  title="Selecione uma seção"
                  description="O documento está dividido em seções. Escolha uma no sumário para ler e estudar."
                />
              </div>
            )}

            <div
              ref={studyRef}
              className="mt-4 scroll-mt-4 xl:hidden"
              id="estudar-secao"
            >
              <SectionStudyPanel
                caderno={caderno}
                request={request}
                onOpenLesson={take}
                onOpenWorld={take}
              />
            </div>
          </main>

          <div className="hidden xl:block">
            <div className="sticky top-4">
              <SectionStudyPanel
                caderno={caderno}
                request={request}
                onOpenLesson={take}
                onOpenWorld={take}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile: barra fixa com as três ações. */}
      <nav
        data-testid="mobile-action-bar"
        className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-[var(--card)] shadow-[0_-1px_0_rgba(0,0,0,0.04)] md:bottom-0 xl:hidden"
      >
        <div className="grid grid-cols-3">
          {[
            {
              id: "questions" as MobileAction,
              icon: HelpCircle,
              label: "Perguntas",
            },
            {
              id: "analogies" as MobileAction,
              icon: GitCompareArrows,
              label: "Analogias",
            },
            { id: "lesson" as MobileAction, icon: PlayCircle, label: "Aula" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => triggerAction(item.id)}
                disabled={!section}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[10.5px] font-medium text-muted-foreground transition-colors disabled:opacity-40",
                  "active:bg-secondary/60",
                )}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default ReadingSurface;
