import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import React from "react";
import Revisions from "@/pages/Revisions";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: vi.fn(),
    revision: {
      list: { useQuery: vi.fn() },
      markCompleted: { useMutation: vi.fn() },
      markIgnored: { useMutation: vi.fn() },
    },
    topic: {
      list: { useQuery: vi.fn() },
    },
    dashboard: {
      getStats: { useQuery: vi.fn() },
    },
  },
}));

// Mock UI components
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
}));

// Mock specialized components
vi.mock("@/components/RecallRatingDialog", () => ({
  RecallRatingDialog: ({ open, topicName }: any) =>
    open ? <div data-testid="recall-dialog">Rating for {topicName}</div> : null,
}));
vi.mock("@/components/PreExamBanner", () => ({
  PreExamBanner: () => <div>PreExamBanner</div>,
}));
vi.mock("@/components/SleepWarning", () => ({
  SleepWarning: () => <div>SleepWarning</div>,
}));
vi.mock("@/components/TeachYourselfMode", () => ({
  TeachYourselfMode: ({ open, topicName }: any) =>
    open ? <div data-testid="teach-dialog">Teaching {topicName}</div> : null,
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  EyeOff: () => <span data-testid="icon-eye-off" />,
  CheckCircle2: () => <span data-testid="icon-check" />,
  Clock: () => <span data-testid="icon-clock" />,
  AlertCircle: () => <span data-testid="icon-alert" />,
  Eye: () => <span data-testid="icon-eye" />,
  Settings2: () => <span data-testid="icon-settings" />,
  CalendarClock: () => <span data-testid="icon-calendar" />,
  Brain: () => <span data-testid="icon-brain" />,
  Star: () => <span data-testid="icon-star" />,
  CheckIcon: () => <span data-testid="icon-check-small" />,
}));

describe("Revisions Component - Simple", () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const mockTopics = {
    topics: [{ id: 101, name: "Atos Administrativos", disciplineId: 1 }],
    disciplines: [{ id: 1, name: "Direito Admin", color: "#f00" }],
  };

  const mockUtils = {
    revision: { list: { invalidate: vi.fn() } },
    dashboard: { getStats: { invalidate: vi.fn() } },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (trpc.useUtils as any).mockReturnValue(mockUtils);
    (trpc.topic.list.useQuery as any).mockReturnValue({ data: mockTopics });
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({ data: {} });
    (trpc.revision.markCompleted.useMutation as any).mockImplementation(
      ({ onSuccess }: any) => ({
        mutate: (vars: any) =>
          act(() => {
            onSuccess?.(null, vars);
          }),
      }),
    );
    (trpc.revision.markIgnored.useMutation as any).mockImplementation(
      ({ onSuccess }: any) => ({
        mutate: (vars: any) =>
          act(() => {
            onSuccess?.(null, vars);
          }),
      }),
    );
  });

  test("renders and can mark as completed", () => {
    const revs = [
      {
        id: 1,
        topicId: 101,
        scheduledDate: today,
        completed: false,
        ignored: false,
      },
    ];
    (trpc.revision.list.useQuery as any).mockReturnValue({
      data: revs,
      isLoading: false,
    });

    render(<Revisions />);
    expect(screen.getByText("Atos Administrativos")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByTestId("recall-dialog")).toBeTruthy();
  });

  test("renders and can mark as ignored", () => {
    const revs = [
      {
        id: 1,
        topicId: 101,
        scheduledDate: today,
        completed: false,
        ignored: false,
      },
    ];
    (trpc.revision.list.useQuery as any).mockReturnValue({
      data: revs,
      isLoading: false,
    });

    render(<Revisions />);
    const all = screen.getAllByTestId("icon-eye-off");
    fireEvent.click(all[all.length - 1].closest("button")!);
    expect(mockUtils.revision.list.invalidate).toHaveBeenCalled();
  });

  test("can trigger teach yourself", () => {
    const revs = [
      {
        id: 1,
        topicId: 101,
        scheduledDate: today,
        completed: false,
        ignored: false,
      },
    ];
    (trpc.revision.list.useQuery as any).mockReturnValue({
      data: revs,
      isLoading: false,
    });

    render(<Revisions />);
    fireEvent.click(screen.getAllByTestId("icon-brain")[0].closest("button")!);
    expect(screen.getByTestId("teach-dialog")).toBeTruthy();
  });

  test("handles loading and empty states", () => {
    const { rerender } = render(<Revisions />);
    (trpc.revision.list.useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    rerender(<Revisions />);
    expect(screen.getByText(/Carregando/)).toBeTruthy();

    (trpc.revision.list.useQuery as any).mockReturnValue({
      data: [],
      isLoading: false,
    });
    rerender(<Revisions />);
    expect(screen.getByText(/Nenhuma revisão programada/)).toBeTruthy();
  });
});
