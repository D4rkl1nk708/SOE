import React, { createContext, useContext, useEffect, useState } from "react";

export type ColorTheme = "mono" | "gold" | "ocean" | "forest" | "rose" | "violet" | "amber" | "slate";
export type DarkMode = "light" | "dark";

export interface ThemeConfig {
  label: string;
  light: string;
  dark: string;
}

export const COLOR_THEMES: Record<ColorTheme, ThemeConfig> = {
  mono:   { label: "Clássico",  light: "#1a1a1a",  dark: "#e8e8e8" },
  gold:   { label: "Dourado",   light: "#b8860b",  dark: "#f0c040" },
  ocean:  { label: "Oceano",    light: "#1d6fa4",  dark: "#60b8f0" },
  forest: { label: "Floresta",  light: "#1a7a3c",  dark: "#4ade80" },
  rose:   { label: "Vinho",     light: "#be185d",  dark: "#f472b6" },
  violet: { label: "Violeta",   light: "#6d28d9",  dark: "#c084fc" },
  amber:  { label: "Âmbar",     light: "#c2410c",  dark: "#fb923c" },
  slate:  { label: "Ardósia",   light: "#1e40af",  dark: "#93c5fd" },
};

interface ThemeContextType {
  darkMode: DarkMode;
  colorTheme: ColorTheme;
  toggleDarkMode: () => void;
  setColorTheme: (t: ColorTheme) => void;
  theme: DarkMode;
  toggleTheme: () => void;
  setTheme: (t: DarkMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function applyTheme(colorTheme: ColorTheme, darkMode: DarkMode) {
  const root = document.documentElement;
  const cfg = COLOR_THEMES[colorTheme];
  const isDark = darkMode === "dark";
  const primary = isDark ? cfg.dark : cfg.light;
  const { r, g, b } = hexToRgb(primary);
  const luminosity = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const fgOnPrimary = luminosity > 160 ? "#0a0a0a" : "#ffffff";

  // 1. Set dark/light class first (controls bg/border/text surfaces)
  root.classList.remove("light", "dark");
  root.classList.add(darkMode);

  // 2. Set color accent vars (inline style overrides any CSS cascade)
  const vars: Record<string, string> = {
    "--primary": primary,
    "--primary-rgb": `${r}, ${g}, ${b}`,
    "--primary-foreground": fgOnPrimary,
    "--ring": primary,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": fgOnPrimary,
    "--sidebar-ring": primary,
    "--gold": primary,
    "--gold-light": primary,
    "--gold-dark": isDark ? cfg.light : cfg.dark,
    "--sidebar-active-bg": `rgba(${r},${g},${b},${isDark ? 0.25 : (luminosity > 200 ? 0.15 : 0.1)})`,
    "--sidebar-active-fg": fgOnPrimary === "#0a0a0a" ? "#000000" : primary,
    "--sidebar-active-border": `rgba(${r},${g},${b},${isDark ? 0.4 : 0.2})`,
    "--sidebar-accent": `rgba(${r},${g},${b},${isDark ? 0.15 : 0.08})`,
    "--sidebar-accent-foreground": fgOnPrimary === "#0a0a0a" ? "#000000" : primary,
    "--primary-shadow": `rgba(${r},${g},${b},${isDark ? 0.5 : 0.3})`,
    "--primary-bg-subtle": `rgba(${r},${g},${b},${isDark ? 0.2 : (luminosity > 200 ? 0.12 : 0.08)})`,
  };

  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState<DarkMode>(() =>
    (localStorage.getItem("soe_dark") as DarkMode) || "light"
  );
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() =>
    (localStorage.getItem("soe_color") as ColorTheme) || "gold"
  );

  useEffect(() => {
    applyTheme(colorTheme, darkMode);
    localStorage.setItem("soe_dark", darkMode);
    localStorage.setItem("soe_color", colorTheme);
  }, [colorTheme, darkMode]);

  const toggleDarkMode = () => setDarkMode(p => p === "light" ? "dark" : "light");
  const setColorTheme = (t: ColorTheme) => setColorThemeState(t);

  return (
    <ThemeContext.Provider value={{
      darkMode, colorTheme, toggleDarkMode, setColorTheme,
      theme: darkMode, toggleTheme: toggleDarkMode, setTheme: setDarkMode,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
