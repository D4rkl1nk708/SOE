import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { AIAnalysis } from "@/components/AIAnalysis";
import { AIChatBox, Message } from "@/components/AIChatBox";

// Mock JSDOM missing functions
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollTo = vi.fn();
}

// Mock trpc
const mockListDisciplines = vi.fn();
const mockListTopics = vi.fn();
const mockListQuestionErrors = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    discipline: {
      list: { useQuery: () => ({ data: mockListDisciplines() }) },
    },
    topic: {
      list: { useQuery: () => ({ data: mockListTopics() }) },
    },
    questionError: {
      list: { useQuery: () => ({ data: mockListQuestionErrors() }) },
    },
  },
}));

// Mock streamdown
vi.mock("streamdown", () => ({
  Streamdown: ({ children }: any) => (
    <div data-testid="streamdown">{children}</div>
  ),
}));

// Mock lucide-react (to avoid icon issues in JSDOM)
vi.mock("lucide-react", () => ({
  Brain: () => <div data-testid="icon-brain" />,
  X: () => <div data-testid="icon-x" />,
  Copy: () => <div data-testid="icon-copy" />,
  Check: () => <div data-testid="icon-check" />,
  AlertTriangle: () => <div data-testid="icon-alert" />,
  Sparkles: () => <div data-testid="icon-sparkles" />,
  ExternalLink: () => <div data-testid="icon-link" />,
  Filter: () => <div data-testid="icon-filter" />,
  Send: () => <div data-testid="icon-send" />,
  User: () => <div data-testid="icon-user" />,
  Loader2: () => <div data-testid="icon-loader" />,
  ChevronDown: () => <div data-testid="icon-chevron-down" />,
  ChevronUp: () => <div data-testid="icon-chevron-up" />,
}));

describe("AIAnalysis Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDisciplines.mockReturnValue([{ id: 1, name: "Derecho" }]);
    mockListTopics.mockReturnValue({
      topics: [{ id: 10, name: "Constitución", disciplineId: 1 }],
    });
    mockListQuestionErrors.mockReturnValue({
      items: [
        {
          id: 1,
          topicId: 10,
          statement: "Questão teste",
          userAnswer: "A",
          correctAnswer: "B",
          alternatives: [
            { letter: "A", text: "Alt A" },
            { letter: "B", text: "Alt B" },
          ],
        },
      ],
    });
  });

  test("renders AIAnalysis when open", async () => {
    render(<AIAnalysis open={true} onClose={() => {}} />);
    expect(screen.getByText("Diagnóstico IA")).toBeTruthy();
    expect(screen.getByText(/1 questão\(ões\)/)).toBeTruthy();
  });

  test("handles copy prompt", async () => {
    // Mock clipboard
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } });

    render(<AIAnalysis open={true} onClose={() => {}} />);
    const copyBtn = screen.getByText(/Copiar prompt/i);
    fireEvent.click(copyBtn);

    expect(mockWriteText).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Copiado!")).toBeTruthy());
  });

  test("toggles filters", () => {
    render(<AIAnalysis open={true} onClose={() => {}} />);
    const filterBtn = screen.getByText("Filtros");
    fireEvent.click(filterBtn);
    expect(screen.getByText("Filtrar questões para o prompt")).toBeTruthy();
  });
});

describe("AIChatBox Component", () => {
  const messages: Message[] = [
    { role: "user", content: "Olá IA" },
    { role: "assistant", content: "Olá humano!" },
  ];

  test("renders messages correctly", () => {
    render(<AIChatBox messages={messages} onSendMessage={() => {}} />);
    expect(screen.getByText("Olá IA")).toBeTruthy();
    expect(screen.getByText("Olá humano!")).toBeTruthy();
  });

  test("calls onSendMessage when form is submitted", () => {
    const onSendMessage = vi.fn();
    render(<AIChatBox messages={messages} onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText("Type your message...");
    fireEvent.change(textarea, { target: { value: "Pergunta teste" } });

    const submitBtn = screen.getByTestId("icon-send");
    fireEvent.click(submitBtn.parentElement!);

    expect(onSendMessage).toHaveBeenCalledWith("Pergunta teste");
  });

  test("renders suggested prompts and sends them", () => {
    const onSendMessage = vi.fn();
    render(
      <AIChatBox
        messages={[]}
        onSendMessage={onSendMessage}
        suggestedPrompts={["Sugestão 1"]}
      />,
    );

    const suggestionBtn = screen.getByText("Sugestão 1");
    fireEvent.click(suggestionBtn);

    expect(onSendMessage).toHaveBeenCalledWith("Sugestão 1");
  });

  test("renders actions and handles accept/reject", () => {
    const onAction = vi.fn();
    const messagesWithAction: Message[] = [
      {
        role: "assistant",
        content: "Proponho uma ação",
        action: { type: "other", description: "Fazer algo", payload: {} },
      },
    ];

    render(
      <AIChatBox
        messages={messagesWithAction}
        onSendMessage={() => {}}
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Fazer algo")).toBeTruthy();

    const acceptBtn = screen.getByText("Aceitar");
    fireEvent.click(acceptBtn);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Fazer algo" }),
      true,
    );

    const rejectBtn = screen.getByText("Recusar");
    fireEvent.click(rejectBtn);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Fazer algo" }),
      false,
    );
  });
});
