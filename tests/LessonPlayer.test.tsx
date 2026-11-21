import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import { LessonPlayer } from "@/components/learning/LessonPlayer";
import type { SavedLesson } from "@shared/topicLessons";

const lessonA: SavedLesson = {
  id: "aula-paginacao-1",
  topicName: "Paginação de memória",
  disciplineName: "Arquitetura",
  title: "Como a MMU traduz endereços",
  html: "<!doctype html><html><body><canvas id='c'></canvas><script>1</script></body></html>",
  steps: [
    { title: "Endereço", text: "A CPU pede um endereço virtual." },
    { title: "Tradução", text: "A MMU converte para o quadro físico." },
    { title: "Falta", text: "Sem quadro, ocorre page fault." },
  ],
  interaction: "arraste a página para um quadro livre",
  question: {
    prompt: "O que acontece na falta de página?",
    options: ["page fault", "nada"],
    correctIndex: 0,
    feedback: "Sem quadro livre o SO trata a falta de página.",
  },
  limits: ["não modela TLB"],
  createdAt: "2026-11-21T10:00:00.000Z",
};

const lessonB: SavedLesson = {
  ...lessonA,
  id: "aula-licitacao-1",
  title: "Fluxo da licitação",
  html: "<!doctype html><html><body><svg></svg><script>2</script></body></html>",
  steps: [
    { title: "Edital", text: "A administração publica o edital." },
    { title: "Propostas", text: "Os interessados entregam propostas." },
    { title: "Julgamento", text: "A comissão classifica." },
  ],
};

describe("LessonPlayer", () => {
  test("renderiza a animação em iframe isolado, sem allow-same-origin", () => {
    render(<LessonPlayer lesson={lessonA} />);

    const frame = screen.getByTitle(lessonA.title) as HTMLIFrameElement;
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame.getAttribute("srcdoc")).toBe(lessonA.html);
  });

  test("mostra passos, interação e a pergunta de verificação", () => {
    render(<LessonPlayer lesson={lessonA} />);
    expect(screen.getByText(/Passos da aula/)).toBeTruthy();
    for (const step of lessonA.steps) {
      expect(screen.getByText(`${step.title}:`)).toBeTruthy();
      expect(screen.getByText(step.text)).toBeTruthy();
    }
    expect(screen.getByText(lessonA.interaction)).toBeTruthy();
    expect(
      screen.getByText(new RegExp(`Verificação: ${lessonA.question.prompt}`)),
    ).toBeTruthy();
    expect(screen.getByText("não modela TLB")).toBeTruthy();
  });

  test("troca de aula sem vazar estado (iframe e marcação recomeçam)", () => {
    const onMarkStudied = vi.fn();
    const { rerender } = render(
      <LessonPlayer lesson={lessonA} onMarkStudied={onMarkStudied} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /marcar como estudado/i }),
    );
    expect(onMarkStudied).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /estudado hoje/i })).toBeTruthy();

    rerender(<LessonPlayer lesson={lessonB} onMarkStudied={onMarkStudied} />);

    const frame = screen.getByTitle(lessonB.title) as HTMLIFrameElement;
    expect(frame.getAttribute("srcdoc")).toBe(lessonB.html);
    // A marcação da aula anterior não segue para a próxima.
    expect(
      screen.getByRole("button", { name: /marcar como estudado/i }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /estudado hoje/i })).toBeNull();
  });

  test("reiniciar recarrega o iframe e 'estudado hoje' desabilita o botão", () => {
    const onMarkStudied = vi.fn();
    render(<LessonPlayer lesson={lessonA} onMarkStudied={onMarkStudied} />);

    const before = screen.getByTitle(lessonA.title);
    fireEvent.click(screen.getByRole("button", { name: /reiniciar/i }));
    const after = screen.getByTitle(lessonA.title);
    expect(after).not.toBe(before);

    fireEvent.click(
      screen.getByRole("button", { name: /marcar como estudado/i }),
    );
    const studied = screen.getByRole("button", { name: /estudado hoje/i });
    expect((studied as HTMLButtonElement).disabled).toBe(true);
  });

  test("aula já marcada no servidor aparece como estudada", () => {
    render(
      <LessonPlayer lesson={lessonA} studiedToday onMarkStudied={() => {}} />,
    );
    const studied = screen.getByRole("button", { name: /estudado hoje/i });
    expect((studied as HTMLButtonElement).disabled).toBe(true);
  });
});
