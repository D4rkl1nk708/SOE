import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";

export type AIProvider = "gemini" | "openai" | "claude";

export interface AppSettings {
  aiApiKey: string;
  aiProvider: AIProvider;
  tecServerUrl: string;
  tecDirectMode: boolean;
  zoomLevel: number;
}

const SETTINGS_CHANGE_EVENT = "soe_settings_change";

// Canonical and fallback keys
const KEYS = {
  AI_API_KEY: "soe_mentor_api_key",
  AI_PROVIDER: "soe_mentor_provider",
  TEC_SERVER_URL: "soe_tec_server_url",
  TEC_DIRECT_MODE: "soe_tec_direct_mode",
  ZOOM_LEVEL: "soe_zoom_level",
  // Legacy aliases to check if canonical is empty
  LEGACY_AI_KEY: ["soe_ai_apikey", "soe_mentor_key"],
  LEGACY_AI_PROVIDER: ["soe_ai_provider"],
};

function getStoredString(key: string, fallbacks: string[] = []): string {
  if (typeof window === "undefined") return "";
  try {
    const val = localStorage.getItem(key);
    if (val && val.trim()) return val.trim();
    for (const fb of fallbacks) {
      const fbVal = localStorage.getItem(fb);
      if (fbVal && fbVal.trim()) return fbVal.trim();
    }
  } catch {}
  return "";
}

function getStoredSettings(): AppSettings {
  const apiKey = getStoredString(KEYS.AI_API_KEY, KEYS.LEGACY_AI_KEY);
  const rawProvider = getStoredString(
    KEYS.AI_PROVIDER,
    KEYS.LEGACY_AI_PROVIDER,
  );
  const provider: AIProvider =
    rawProvider === "openai" || rawProvider === "claude"
      ? rawProvider
      : "gemini";

  const tecServerUrl = getStoredString(KEYS.TEC_SERVER_URL);
  const tecDirectMode =
    typeof window !== "undefined"
      ? localStorage.getItem(KEYS.TEC_DIRECT_MODE) === "true"
      : false;

  let zoomLevel = 100;
  if (typeof window !== "undefined") {
    const savedZoom = localStorage.getItem(KEYS.ZOOM_LEVEL);
    if (savedZoom) {
      const parsed = parseInt(savedZoom, 10);
      if (!isNaN(parsed) && parsed >= 80 && parsed <= 140) zoomLevel = parsed;
    }
  }

  return {
    aiApiKey: apiKey,
    aiProvider: provider,
    tecServerUrl,
    tecDirectMode,
    zoomLevel,
  };
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings);

  // Also sync with server user settings if available
  const { data: serverStats } = trpc.dashboard.getStats.useQuery(undefined, {
    staleTime: 60_000,
  });

  useEffect(() => {
    const handleStorage = () => {
      setSettings(getStoredSettings());
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SETTINGS_CHANGE_EVENT, handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SETTINGS_CHANGE_EVENT, handleStorage);
    };
  }, []);

  // Update setting helper
  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      if (typeof window === "undefined") return;

      try {
        if (key === "aiApiKey") {
          localStorage.setItem(KEYS.AI_API_KEY, value as string);
          localStorage.setItem("soe_ai_apikey", value as string);
        } else if (key === "aiProvider") {
          localStorage.setItem(KEYS.AI_PROVIDER, value as string);
          localStorage.setItem("soe_ai_provider", value as string);
        } else if (key === "tecServerUrl") {
          localStorage.setItem(KEYS.TEC_SERVER_URL, value as string);
        } else if (key === "tecDirectMode") {
          localStorage.setItem(KEYS.TEC_DIRECT_MODE, String(value));
        } else if (key === "zoomLevel") {
          localStorage.setItem(KEYS.ZOOM_LEVEL, String(value));
        }

        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));
        setSettings(getStoredSettings());
      } catch (err) {
        console.error("Failed to save setting to localStorage:", err);
      }
    },
    [],
  );

  // Computed AI key taking server settings into account as top priority
  const effectiveApiKey =
    (serverStats?.settings as any)?.aiApiKey || settings.aiApiKey;
  const effectiveProvider =
    ((serverStats?.settings as any)?.aiProvider as AIProvider) ||
    settings.aiProvider;

  return {
    settings,
    effectiveApiKey,
    effectiveProvider,
    updateSetting,
  };
}
