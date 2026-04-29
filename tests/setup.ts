import { vi, beforeAll, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Mock do módulo @supabase/supabase-js antes de qualquer import
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: vi.fn().mockReturnThis(),
    })),
  })),
}));

// Mock do arquivo client/src/lib/supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

// Mock do useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Test User", email: "test@soe.local" },
    loading: false,
    error: null,
    isAuthenticated: true,
    refresh: vi.fn(),
    logout: vi.fn(),
    isLocalMode: false,
  }),
}));

beforeAll(() => {
  // Configurar mocks globais
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
