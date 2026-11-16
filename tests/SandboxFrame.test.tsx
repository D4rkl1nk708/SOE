import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, test, expect, afterEach } from "vitest";
import SandboxFrame, {
  type MicroWorld,
} from "@/components/learning/SandboxFrame";

const htmlDoc = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><style>body{margin:0}</style></head>
  <body><button id="add">Adicionar camada</button></body>
</html>`;

const baseWorld: MicroWorld = {
  id: "docker-camadas",
  title: "Camadas de imagem Docker",
  html: htmlDoc,
  controls: ["Adicionar camada", "Remover camada", "Rodar container"],
  challenges: [
    "Crie uma imagem com tres camadas",
    "Reduza o tamanho final reaproveitando uma camada",
    "Explique por que o cache invalidou",
  ],
  limits: [
    "Nao executa containers reais",
    "Ignora o sistema de arquivos do host",
  ],
};

afterEach(() => {
  document.body.style.overflow = "";
});

describe("SandboxFrame", () => {
  test("renderiza o iframe com title, srcDoc e sandbox apenas com allow-scripts", () => {
    render(<SandboxFrame world={baseWorld} />);

    const frame = screen.getByTitle(baseWorld.title) as HTMLIFrameElement;

    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("title")).toBe(baseWorld.title);
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame.getAttribute("srcdoc")).toBe(htmlDoc);
    expect(frame.getAttribute("aria-label")).toContain(baseWorld.title);
    expect(frame.style.height).toBe("420px");
  });

  test("mostra titulo, controles, desafios numerados e limites", () => {
    render(<SandboxFrame world={baseWorld} />);

    expect(
      screen.getByRole("heading", { level: 2, name: baseWorld.title }),
    ).toBeTruthy();

    expect(
      screen.getByRole("heading", { level: 3, name: "Controles" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "Desafios" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "Limites deste modelo" }),
    ).toBeTruthy();

    for (const control of baseWorld.controls) {
      expect(screen.getByText(control)).toBeTruthy();
    }
    for (const challenge of baseWorld.challenges) {
      expect(screen.getByText(challenge)).toBeTruthy();
    }
    for (const limit of baseWorld.limits) {
      expect(screen.getByText(limit)).toBeTruthy();
    }

    // Desafios usam lista ordenada (numerada)
    const challengesBlock = screen.getByTestId("micro-world-Desafios");
    expect(challengesBlock.querySelector("ol")).toBeTruthy();
    expect(challengesBlock.querySelectorAll("li")).toHaveLength(
      baseWorld.challenges.length,
    );

    // Controles e limites usam lista nao ordenada
    const controlsBlock = screen.getByTestId("micro-world-Controles");
    expect(controlsBlock.querySelector("ul")).toBeTruthy();
  });

  test("nao renderiza o bloco Limites quando limits esta vazio", () => {
    render(<SandboxFrame world={{ ...baseWorld, limits: [] }} />);

    expect(
      screen.queryByRole("heading", { level: 3, name: "Limites deste modelo" }),
    ).toBeNull();
    expect(screen.queryByTestId("micro-world-Limites deste modelo")).toBeNull();

    // Os demais blocos continuam
    expect(
      screen.getByRole("heading", { level: 3, name: "Controles" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "Desafios" }),
    ).toBeTruthy();
  });

  test("nao renderiza o rodape quando todas as listas estao vazias", () => {
    render(
      <SandboxFrame
        world={{ ...baseWorld, controls: [], challenges: [], limits: [] }}
      />,
    );

    expect(
      screen.queryByRole("heading", { level: 3, name: "Controles" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Desafios" }),
    ).toBeNull();
  });

  test("alterna entre tela normal e sobreposicao em tela cheia", () => {
    render(<SandboxFrame world={baseWorld} />);

    const wrapper = screen.getByTestId("sandbox-frame");
    expect(wrapper.className).not.toContain("fixed");

    const openButton = screen.getByRole("button", {
      name: /abrir em tela cheia/i,
    });
    expect(openButton.getAttribute("aria-label")).toBe("Abrir em tela cheia");

    fireEvent.click(openButton);

    const expandedWrapper = screen.getByTestId("sandbox-frame");
    expect(expandedWrapper.className).toContain("fixed");
    expect(expandedWrapper.className).toContain("inset-0");
    expect(document.body.style.overflow).toBe("hidden");

    // O botao de abrir deu lugar ao de fechar; o iframe continua isolado
    expect(
      screen.queryByRole("button", { name: /abrir em tela cheia/i }),
    ).toBeNull();

    const frameInFullscreen = screen.getByTitle(baseWorld.title);
    expect(frameInFullscreen.getAttribute("sandbox")).toBe("allow-scripts");
    expect(expandedWrapper.contains(frameInFullscreen)).toBe(true);

    const closeButton = screen.getByRole("button", {
      name: /fechar tela cheia/i,
    });
    expect(closeButton.getAttribute("aria-label")).toBe("Fechar tela cheia");

    fireEvent.click(closeButton);

    const backToNormal = screen.getByTestId("sandbox-frame");
    expect(backToNormal.className).not.toContain("fixed");
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(
      screen.getByRole("button", { name: /abrir em tela cheia/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /fechar tela cheia/i }),
    ).toBeNull();

    // Conteudo do micro-mundo segue acessivel depois de fechar
    const details = screen.getByTestId("micro-world-Controles");
    expect(within(details).getByText(baseWorld.controls[0])).toBeTruthy();
  });
});
