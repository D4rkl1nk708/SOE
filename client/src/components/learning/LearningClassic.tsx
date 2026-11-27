import {
  BookOpen,
  FileText,
  Loader2,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { LessonStudio } from "./LessonStudio";
import type { CadernoVivoState } from "./useCadernoVivo";
import { SectionRecallGate } from "./SectionRecallGate";

/**
 * Layout clássico do Caderno Vivo — preservado como opção (Perfil → Interface →
 * "Clássico · completo"). Mesma lógica do leitor novo (vem do `useCadernoVivo`),
 * só a apresentação é a antiga: coluna de documento, lista de seções e o texto
 * num card único, com as ações em botões no rodapé.
 */
export function LearningClassic({ caderno }: { caderno: CadernoVivoState }) {
  const {
    docs,
    doc,
    docId,
    section,
    sections,
    sectionIndex,
    questions,
    answers,
    revealed,
    answeredCount,
    analogies,
    chosenAnalogy,
    whyItWorks,
    world,
    savedAnalogies,
  } = caderno;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-14">
      <PageHeader
        eyebrow="Leitura ativa"
        title="Caderno Vivo"
        description="Importe o PDF e leia em seções: perguntas de recuperação, analogias, micro-mundos e aulas interativas."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={caderno.openFilePicker}
              disabled={caderno.importPdf.isPending}
            >
              {caderno.importPdf.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="mr-2 h-3.5 w-3.5" />
              )}
              Importar PDF
            </Button>
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
          </>
        }
      />

      {docs.length === 0 && (
        <div className="soe-card p-8 text-center">
          <BookOpen className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">Nenhum PDF importado.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe um material seu. O texto é dividido em seções e cada seção
            vira uma sessão de estudo.
          </p>
        </div>
      )}

      {docs.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {docs.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 transition-colors ${
                  docId === item.id
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-card hover:bg-secondary/40"
                }`}
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => caderno.selectDoc(item.id)}
                >
                  <p className="truncate text-[12.5px] font-medium">
                    {item.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.pages} páginas · {item.sections} seções
                  </p>
                </button>
                <button
                  aria-label={`Remover ${item.title}`}
                  onClick={() => caderno.removeDoc.mutate({ docId: item.id })}
                  className="text-muted-foreground/50 transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </aside>

          <div className="min-w-0 space-y-4">
            {doc && (
              <>
                <div className="soe-card overflow-hidden">
                  <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Seções
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {sectionIndex + 1} de {sections.length}
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto border-t border-border">
                    {sections.map((item, index) => (
                      <button
                        key={`${item.title}-${index}`}
                        onClick={() => caderno.selectSection(index)}
                        className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors ${
                          index === sectionIndex
                            ? "bg-primary/10"
                            : "hover:bg-secondary/40"
                        }`}
                      >
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[12px]">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[9.5px] tabular-nums text-muted-foreground">
                          p. {item.startPage}–{item.endPage}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {section && (
                  <>
                    <div className="soe-card p-5">
                      <h2 className="text-[15px] font-semibold">
                        {section.title}
                      </h2>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                        páginas {section.startPage}–{section.endPage}
                      </p>
                      <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                        {section.text.slice(0, 12000)}
                      </div>
                      <SectionRecallGate caderno={caderno} />

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={caderno.askQuestions.isPending}
                          onClick={caderno.runQuestions}
                        >
                          {caderno.askQuestions.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Perguntas de recuperação
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={caderno.askAnalogies.isPending}
                          onClick={caderno.runAnalogies}
                        >
                          {caderno.askAnalogies.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Analogias
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={caderno.askWorld.isPending}
                          onClick={caderno.runWorld}
                        >
                          {caderno.askWorld.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Micro-mundo
                        </Button>
                      </div>
                    </div>

                    {questions && (
                      <div className="soe-card p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            Responda de cabeça
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {answeredCount}/{questions.length} respondidas
                          </span>
                        </div>
                        <div className="mt-3 space-y-4">
                          {questions.map((item, index) => (
                            <div
                              key={item.question}
                              className="rounded-md border border-border bg-secondary/20 p-3"
                            >
                              <p className="text-[12.5px] font-medium">
                                {index + 1}. {item.question}
                              </p>
                              <textarea
                                value={answers[index] || ""}
                                onChange={(event) =>
                                  caderno.setAnswers((previous) => ({
                                    ...previous,
                                    [index]: event.target.value,
                                  }))
                                }
                                rows={3}
                                placeholder="Sua resposta, sem consultar..."
                                className="mt-2 w-full resize-y rounded-md border border-border bg-background/40 p-2 text-[11.5px] leading-relaxed outline-none focus:border-primary/50"
                              />
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    caderno.setRevealed((previous) => ({
                                      ...previous,
                                      [index]: !previous[index],
                                    }))
                                  }
                                >
                                  {revealed[index] ? "Ocultar" : "Conferir"}
                                </Button>
                                <span className="text-[9.5px] text-muted-foreground">
                                  fonte: p. {item.pageFrom}–{item.pageTo}
                                </span>
                              </div>
                              {revealed[index] && (
                                <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                                  {item.answerKey.map((point) => (
                                    <li key={point}>• {point}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {analogies && (
                      <div className="soe-card p-5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Escolha a analogia que funciona para você
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Comparar duas analogias fixa o princípio. Escolha uma
                          e note onde ela quebra.
                        </p>
                        {savedAnalogies.length > 0 && (
                          <div className="mt-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                              Sua analogia salva neste tema
                            </p>
                            <p className="mt-1 text-[12px] font-medium">
                              {savedAnalogies[0].analogy}
                            </p>
                            {savedAnalogies[0].whyItWorks && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Por que funciona: {savedAnalogies[0].whyItWorks}
                              </p>
                            )}
                          </div>
                        )}
                        <textarea
                          value={whyItWorks}
                          onChange={(event) =>
                            caderno.setWhyItWorks(event.target.value)
                          }
                          rows={2}
                          placeholder="Ao escolher, escreva em uma frase por que ela funciona para você..."
                          className="mt-3 w-full resize-y rounded-md border border-border bg-background/40 p-2 text-[11.5px] leading-relaxed outline-none focus:border-primary/50"
                        />
                        <div className="mt-3 space-y-2">
                          {analogies.map((item, index) => (
                            <div
                              key={item.analogy}
                              className={`rounded-md border p-3 ${
                                chosenAnalogy === index
                                  ? "border-primary/40 bg-primary/10"
                                  : "border-border bg-secondary/20"
                              }`}
                            >
                              <p className="text-[12.5px] font-medium">
                                {item.analogy}
                              </p>
                              {item.bestFor && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  Ilumina: {item.bestFor}
                                </p>
                              )}
                              {item.mapping.length > 0 && (
                                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                                  {item.mapping.map((line) => (
                                    <li key={line}>→ {line}</li>
                                  ))}
                                </ul>
                              )}
                              {item.breaks && (
                                <p className="mt-1 text-[11px] text-amber-500">
                                  Onde quebra: {item.breaks}
                                </p>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mt-1"
                                disabled={caderno.saveAnalogy.isPending}
                                onClick={() =>
                                  caderno.chooseAnalogy(item, index)
                                }
                              >
                                {caderno.saveAnalogy.isPending &&
                                chosenAnalogy === index
                                  ? "Salvando..."
                                  : chosenAnalogy === index
                                    ? "Escolhida"
                                    : "Ficar com esta"}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {section && (
                      <div className="soe-card p-5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Aula interativa
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Animação que ensina o conceito em passos, com uma
                          interação e uma pergunta de verificação.
                        </p>
                        <div className="mt-3">
                          <LessonStudio
                            topicName={section.title}
                            context={section.text}
                            provider={caderno.provider}
                            apiKey={caderno.apiKey}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LearningClassic;
