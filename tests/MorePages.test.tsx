import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import Sync from "@/pages/Sync";
import QuestionSession from "@/pages/QuestionSession";
import Revisions from "@/pages/Revisions";
import QuestionErrors from "@/pages/QuestionErrors";

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  useSearch: () => "",
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// Mock capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
  CapacitorHttp: {
    request: vi.fn(),
  },
}));

// Mock framer-motion
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...(actual as any),
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: {
      div: ({ children, onClick, ...props }: any) => (
        <div onClick={onClick} {...props}>
          {children}
        </div>
      ),
    },
  };
});

// Mock dynamic imports
vi.mock("@/lib/localDb", () => ({
  localImportImportBackup: vi.fn().mockResolvedValue({}),
  localImportExportBackup: vi.fn().mockResolvedValue("{}"),
  localCalendarGetData: vi
    .fn()
    .mockResolvedValue({ revisions: [], topics: [] }),
}));

const mockSetPerformance = vi.fn();
const mockAddStudyTime = vi.fn();
const mockSaveQuestionError = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { getStats: { invalidate: vi.fn() } },
      topic: { list: { invalidate: vi.fn() } },
      calendar: { getData: { invalidate: vi.fn() } },
      questionError: { list: { invalidate: vi.fn() } },
      discipline: { list: { invalidate: vi.fn() } },
      revision: { list: { invalidate: vi.fn() } },
    }),
    import: {
      getICalUrl: { useQuery: () => ({ data: { token: "test-token" } }) },
    },
    discipline: {
      list: {
        useQuery: () => ({ data: [{ id: 1, name: "Math" }], isLoading: false }),
      },
      update: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    note: {
      list: { useQuery: () => ({ data: [], isLoading: false }) },
    },
    topic: {
      list: {
        useQuery: () => ({
          data: {
            topics: [{ id: 10, name: "Algebra", disciplineId: 1 }],
            disciplines: [{ id: 1, name: "Math", color: "#f00" }],
          },
          isLoading: false,
        }),
      },
      update: { useMutation: () => ({ mutate: vi.fn() }) },
      setPerformance: {
        useMutation: (opts: any) => ({
          mutateAsync: async (d: any) => {
            mockSetPerformance(d);
            opts?.onSuccess?.();
          },
        }),
      },
      addStudyTime: {
        useMutation: (opts: any) => ({
          mutateAsync: async (d: any) => {
            mockAddStudyTime(d);
            opts?.onSuccess?.();
          },
        }),
      },
    },
    dashboard: {
      getStats: {
        useQuery: () => ({
          data: { settings: { aiApiKey: "test" } },
          isLoading: false,
        }),
      },
    },
    revision: {
      list: { useQuery: () => ({ data: [], isLoading: false }) },
      markCompleted: {
        useMutation: (opts: any) => ({
          mutateAsync: async (d: any) => {
            opts?.onSuccess?.();
          },
        }),
      },
      markIgnored: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            opts?.onSuccess?.();
          },
        }),
      },
    },
    questionError: {
      save: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            mockSaveQuestionError(d);
            opts?.onSuccess?.();
          },
        }),
      },
      list: {
        useQuery: () => ({
          data: { items: [] },
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      delete: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            opts?.onSuccess?.();
          },
        }),
      },
      diagnose: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            opts?.onSuccess?.({ diagnosis: "test" });
          },
        }),
      },
      analyze: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            opts?.onSuccess?.();
          },
        }),
      },
      revisionTip: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            opts?.onSuccess?.();
          },
        }),
      },
      similarQuestions: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            opts?.onSuccess?.();
          },
        }),
      },
      generateFlashcard: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            opts?.onSuccess?.();
          },
        }),
      },
    },
    ai: {
      processText: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            opts?.onSuccess?.({ result: "processed" });
          },
        }),
      },
    },
    v10: {
      getPreExamStatus: {
        useQuery: () => ({ data: { active: false }, isLoading: false }),
      },
      logStudyEnd: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

global.fetch = vi.fn();

describe("Sync Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === "/api/sync/info")
        return Promise.resolve({
          json: async () => ({ ips: ["192.168.1.5"], port: 3000 }),
        });
      if (url === "/api/backup/list")
        return Promise.resolve({ json: async () => ({ backups: [] }) });
      return Promise.resolve({ json: async () => ({}) });
    });
  });

  test("renders Sync page", async () => {
    render(<Sync />);
    await waitFor(() => {
      expect(screen.getByText("Sync & Backup")).toBeTruthy();
    });
  });
});

describe("QuestionErrors Component", () => {
  test("renders QuestionErrors", async () => {
    render(<QuestionErrors />);
    expect(screen.getByText(/Painel de Erros/i)).toBeTruthy();
  });
});

describe("Revisions Component", () => {
  test("renders Revisions page", async () => {
    render(<Revisions />);
    expect(screen.getByText("Revisões")).toBeTruthy();
  });
});

describe("QuestionSession Component", () => {
  test("runs through a session", async () => {
    render(<QuestionSession />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });
    await waitFor(() =>
      fireEvent.change(selects[1], { target: { value: "10" } }),
    );
    fireEvent.click(screen.getByText("INICIAR"));
    await waitFor(() => expect(screen.getByText(/Questão 1/i)).toBeTruthy());
    fireEvent.click(screen.getByText("ERREI"));
    await waitFor(() =>
      expect(screen.getByText(/O que causou o erro?/i)).toBeTruthy(),
    );
    fireEvent.click(screen.getByText("Atenção"));
  });
});
