import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3, CheckCircle2, TrendingUp, Sun, Moon,
  LayoutDashboard, StickyNote, Brain, Wifi, UserCircle2, CalendarDays,
  ListChecks, Sparkles, Sheet, Settings, ChevronLeft, ChevronRight, Download
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { GlobalSearch, SearchButton } from "./GlobalSearch";
import { FontSizeControl, useFontScale } from "./FontSizeControl";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";

declare const __APP_VERSION__: string;

// ── Navigation groups ────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { path: "/",                 label: "Início",       icon: LayoutDashboard },
      { path: "/question-session", label: "Questões",     icon: ListChecks },
      { path: "/mentor",           label: "IA",    icon: Sparkles },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { path: "/disciplines",      label: "Disciplinas",  icon: BarChart3 },
      { path: "/statistics",       label: "Estatísticas", icon: TrendingUp },
      { path: "/flashcards",       label: "Flashcards",   icon: Brain },
      { path: "/notes",            label: "Anotações",    icon: StickyNote },
    ],
  },
  {
    label: "Organização",
    items: [
      { path: "/calendar",         label: "Calendário",   icon: CalendarDays },
      { path: "/edital",           label: "Editais",      icon: Sheet },
      { path: "/sync",             label: "Sync & Backup",icon: Wifi },
    ],
  },
];

// Flat list for mobile bottom bar — only the most-used 4 items + "More"
const MOBILE_PRIMARY = [
  { path: "/",                 label: "Início",    icon: LayoutDashboard },
  { path: "/question-session", label: "Questões",  icon: ListChecks },
  { path: "/mentor",           label: "Mentor IA", icon: Sparkles },
  { path: "/calendar",         label: "Calendário",icon: CalendarDays },
];

const MOBILE_SECONDARY = [
  { path: "/disciplines",      label: "Disciplinas", icon: BarChart3, color: "#3b82f6" },
  { path: "/statistics",       label: "Estatísticas",icon: TrendingUp, color: "#10b981" },
  { path: "/flashcards",       label: "Flashcards",  icon: Brain,      color: "#f59e0b" },
  { path: "/notes",            label: "Anotações",   icon: StickyNote, color: "#8b5cf6" },
  { path: "/edital",           label: "Editais",     icon: Sheet,      color: "#ec4899" },
  { path: "/mock-exams",       label: "Simulados",   icon: ListChecks, color: "#6366f1" },
  { path: "/sync",             label: "Sincronizar", icon: Wifi,       color: "#06b6d4" },
  { path: "/profile",          label: "Perfil",      icon: UserCircle2,color: "#64748b" },
];

function isActivePath(location: string, path: string) {
  if (path === "/") return location === "/";
  return location === path || location.startsWith(path + "/");
}

// ── SOE Logo mark ─────────────────────────────────────────────────────────────
function SoeLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0 soe-logo-icon"
      style={{
        width: size,
        height: size,
        background: "var(--primary)",
        boxShadow: "0 2px 10px var(--primary-shadow)",
      }}
    >
      <svg width={Math.round(size * 0.57)} height={Math.round(size * 0.57)} viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4"  y="10" width="21" height="28" rx="1" stroke="#1a1a1a" strokeWidth="5" fill="none"/>
        <rect x="27" y="10" width="21" height="28" rx="1" stroke="#1a1a1a" strokeWidth="5" fill="none"/>
        <rect x="23" y="38" width="6"  height="5"  rx="1" fill="#1a1a1a"/>
      </svg>
    </div>
  );
}

// ── Single nav item ───────────────────────────────────────────────────────────
function NavItem({
  path, label, icon: Icon, collapsed, active,
}: {
  path: string; label: string; icon: any; collapsed: boolean; active: boolean;
}) {
  return (
    <Link href={path}>
      <a
        title={collapsed ? label : undefined}
        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all ${collapsed ? "justify-center" : ""}`}
        style={
          active
            ? { background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-fg)", border: "1px solid var(--sidebar-active-border)" }
            : { color: "var(--sidebar-fg)", border: "1px solid transparent", opacity: 0.72 }
        }
      >
        <Icon className="w-[15px] h-[15px] flex-shrink-0" />
        {!collapsed && (
          <span
            className={active ? "font-semibold" : "font-medium"}
            style={{ fontSize: "0.875rem", letterSpacing: "-0.25px" }}
          >
            {label}
          </span>
        )}
      </a>
    </Link>
  );
}

// ── Desktop Sidebar ───────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle, location }: { collapsed: boolean; onToggle: () => void; location: string }) {

  return (
    <aside
      className={`hidden md:flex flex-col flex-shrink-0 transition-all duration-300 \${collapsed ? "w-[58px]" : "w-[200px]"}`}
      style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border-color, var(--card-border))" }}
    >
      {/* Logo row */}
      <div
        className={`px-3 py-3.5 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}
        style={{ borderBottom: "1px solid var(--sidebar-border-color, var(--card-border))" }}
      >
        <Link href="/">
          <a className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
            <SoeLogo size={28} />
            {!collapsed && (
              <span className="font-bold text-[15px] tracking-[-0.4px]" style={{ color: "var(--primary)" }}>
                SOE
              </span>
            )}
          </a>
        </Link>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1 rounded-lg hover:opacity-60 transition-opacity"
            style={{ color: "var(--muted-text)" }}
            title="Recolher menu"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:opacity-60 transition-opacity"
            style={{ color: "var(--muted-text)" }}
            title="Expandir menu"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p
                className="px-2.5 mb-1 text-[10px] font-semibold uppercase"
                style={{ color: "var(--muted-text)", opacity: 0.45, letterSpacing: "0.08em" }}
              >
                {group.label}
              </p>
            ) : (
              <div className="my-1.5 mx-auto w-5 h-px" style={{ background: "var(--sidebar-border-color, var(--card-border))", opacity: 0.5 }} />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.path}
                  path={item.path}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                  active={isActivePath(location, item.path)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: Configurações + version */}
      <div className="p-2" style={{ borderTop: "1px solid var(--sidebar-border-color, var(--card-border))" }}>
        <Link href="/profile">
          <a
            title={collapsed ? "Configurações" : undefined}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all ${collapsed ? "justify-center" : ""}`}
            style={
              isActivePath(location, "/profile")
                ? { background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-fg)", border: "1px solid var(--sidebar-active-border)" }
                : { color: "var(--sidebar-fg)", border: "1px solid transparent", opacity: 0.72 }
            }
          >
            <Settings className="w-[15px] h-[15px] flex-shrink-0" />
            {!collapsed && (
              <span className="font-medium" style={{ fontSize: "0.875rem", letterSpacing: "-0.25px" }}>
                Configurações
              </span>
            )}
          </a>
        </Link>
        {!collapsed && (
          <div className="px-2.5 pt-2">
            <span className="text-[10px] font-mono opacity-25" style={{ color: "var(--sidebar-fg)" }}>
              {typeof __APP_VERSION__ !== "undefined" ? "v" + __APP_VERSION__ : ""}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Root Layout ───────────────────────────────────────────────────────────────
export function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useFontScale();
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const currentLabel =
    allItems.find((n) => isActivePath(location, n.path))?.label ||
    (isActivePath(location, "/profile") ? "Configurações" : "SOE");

  return (
    <div
      className={`flex h-screen flex-col md:flex-row ${theme === "dark" ? "dark" : ""}`}
      style={{ background: "var(--app-bg)", color: "var(--app-fg)" }}
    >
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} location={location} />

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-16 md:pb-0" style={{ background: "var(--app-bg)" }}>

        {/* Mobile header */}
        <header
          className="md:hidden flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--card-border)", backdropFilter: "blur(12px)" }}
        >
          <div className="flex items-center gap-2.5">
            <SoeLogo size={28} />
            <span className="font-bold text-[15px] tracking-[-0.4px]" style={{ color: "var(--primary)" }}>SOE</span>
          </div>
          <div className="flex items-center gap-0.5">
            <SearchButton />
            <button onClick={toggleTheme} className="p-2 rounded-xl hover:opacity-70" style={{ color: "var(--muted-text)" }}>
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <Link href="/sync">
              <a className="p-2 rounded-xl" style={{ color: isActivePath(location, "/sync") ? "var(--primary)" : "var(--muted-text)" }}>
                <Wifi className="w-[18px] h-[18px]" />
              </a>
            </Link>
            <Link href="/profile">
              <a className="p-2 rounded-xl" style={{ color: isActivePath(location, "/profile") ? "var(--primary)" : "var(--muted-text)" }}>
                <UserCircle2 className="w-[18px] h-[18px]" />
              </a>
            </Link>
          </div>
        </header>

        {/* Desktop top bar */}
        <header
          className="hidden md:flex items-center justify-between px-6 py-3 flex-shrink-0"
          style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--card-border)", backdropFilter: "blur(12px)" }}
        >
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--foreground)", letterSpacing: "-0.25px" }}>
            {currentLabel}
          </h2>
          <div className="flex items-center gap-1">
            <FontSizeControl />
            <SearchButton />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:opacity-70 transition-opacity"
              style={{ color: "var(--muted-text)" }}
              title={theme === "light" ? "Modo Escuro" : "Modo Claro"}
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <Link href="/profile">
              <a
                className="p-2 rounded-xl hover:opacity-70 transition-opacity ml-0.5"
                style={{ color: isActivePath(location, "/profile") ? "var(--primary)" : "var(--muted-text)" }}
                title="Configurações"
              >
                <UserCircle2 className="w-[18px] h-[18px]" />
              </a>
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-auto w-full" style={{ background: "var(--app-bg)" }}>
          <div className="w-full p-3 md:p-6">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav — 4 primary items + 1 More menu */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "var(--sidebar-bg)",
          borderTop: "1px solid var(--sidebar-border-color, var(--card-border))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex justify-around items-center px-1 py-1">
          {MOBILE_PRIMARY.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(location, item.path);
            return (
              <Link key={item.path} href={item.path}>
                <a
                  className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[64px] transition-all"
                  style={{ color: active ? "var(--primary)" : "var(--sidebar-fg)" }}
                >
                  <div className="p-1.5 rounded-lg" style={{ background: active ? "var(--primary-bg-subtle)" : "transparent" }}>
                    <Icon className="w-[20px] h-[20px]" style={{ opacity: active ? 1 : 0.45 }} />
                  </div>
                  <span className="text-[9px] leading-none tracking-tight font-bold" style={{ opacity: active ? 1 : 0.55 }}>
                    {item.label}
                  </span>
                </a>
              </Link>
            );
          })}

          {/* More Menu */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[64px] outline-none" style={{ color: "var(--sidebar-fg)" }}>
                <div className="p-1.5 rounded-lg">
                  <MoreHorizontal className="w-[20px] h-[20px]" style={{ opacity: 0.45 }} />
                </div>
                <span className="text-[9px] leading-none tracking-tight font-bold" style={{ opacity: 0.55 }}>Mais</span>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="top"
                align="end"
                sideOffset={12}
                className="z-[100] w-[92vw] max-w-[400px] rounded-3xl p-4 animate-in slide-in-from-bottom-4 duration-200"
                style={{ 
                  background: "var(--card-bg)", 
                  border: "1px solid var(--card-border)",
                  boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                  backdropFilter: "blur(20px)",
                }}
              >
                <div className="grid grid-cols-4 gap-4">
                  {MOBILE_SECONDARY.map((item) => {
                    const Icon = item.icon;
                    const active = isActivePath(location, item.path);
                    return (
                      <DropdownMenu.Item key={item.path} asChild>
                        <Link href={item.path}>
                          <a className="flex flex-col items-center gap-2 p-2 rounded-2xl transition-all active:scale-95 outline-none">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" 
                              style={{ 
                                background: `rgba(${item.color === "#3b82f6" ? "59,130,246" : item.color === "#10b981" ? "16,185,129" : "128,128,128"}, 0.1)`,
                                color: item.color 
                              }}>
                              <Icon className="w-6 h-6" />
                            </div>
                            <span className="text-[10px] font-bold text-center leading-tight" style={{ color: "var(--app-fg)" }}>
                              {item.label}
                            </span>
                          </a>
                        </Link>
                      </DropdownMenu.Item>
                    );
                  })}
                </div>
                <DropdownMenu.Arrow className="fill-current" style={{ color: "var(--card-border)" }} />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </nav>

      <GlobalSearch />
    </div>
  );
}
