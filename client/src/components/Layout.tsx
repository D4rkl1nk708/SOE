import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3, CheckCircle2, TrendingUp, Sun, Moon,
  LayoutDashboard, StickyNote, Brain, Wifi, UserCircle2, CalendarDays,
  ListChecks, Sparkles, Sheet, Settings, ChevronLeft, ChevronRight, Download
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { StudyTimer } from "./StudyTimer";
import { GlobalSearch, SearchButton } from "./GlobalSearch";
import { FontSizeControl, useFontScale } from "./FontSizeControl";

declare const __APP_VERSION__: string;

// ── Navigation groups ────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { path: "/",                 label: "Início",       icon: LayoutDashboard },
      { path: "/question-session", label: "Questões",     icon: ListChecks },
      { path: "/revisions",        label: "Revisões",     icon: CheckCircle2 },
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

// Flat list for mobile bottom bar — only the most-used 5 items
const MOBILE_PRIMARY = [
  { path: "/",                 label: "Início",   icon: LayoutDashboard },
  { path: "/disciplines",      label: "Disciplinas", icon: BarChart3 },
  { path: "/question-session", label: "Questões", icon: ListChecks },
  { path: "/calendar",         label: "Calendário", icon: CalendarDays },
  { path: "/statistics",       label: "Estatísticas", icon: TrendingUp },
  { path: "/mentor",           label: "IA",   icon: Sparkles },
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
        background: "#0071e3",
        boxShadow: "0 2px 8px rgba(0,113,227,0.35)",
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
              <span className="font-bold text-[15px] tracking-[-0.4px]" style={{ color: "#0071e3" }}>
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
            <span className="font-bold text-[15px] tracking-[-0.4px]" style={{ color: "#0071e3" }}>SOE</span>
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

      {/* Mobile bottom nav — 5 primary items, full-width, no dropdown */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "var(--sidebar-bg)",
          borderTop: "1px solid var(--sidebar-border-color, var(--card-border))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex justify-around items-center px-1 py-1">
          {MOBILE_PRIMARY.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(location, item.path);
            return (
              <Link key={item.path} href={item.path}>
                <a
                  className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[48px]"
                  style={{ color: active ? "var(--sidebar-active-fg)" : "var(--sidebar-fg)" }}
                >
                  <div className="p-1.5 rounded-lg" style={{ background: active ? "var(--sidebar-active-bg)" : "transparent" }}>
                    <Icon className="w-[18px] h-[18px]" style={{ opacity: active ? 1 : 0.45 }} />
                  </div>
                  <span className="text-[9px] leading-none tracking-tight font-medium" style={{ opacity: active ? 1 : 0.55 }}>
                    {item.label}
                  </span>
                </a>
              </Link>
            );
          })}
        </div>
      </nav>

      <GlobalSearch />
      <StudyTimer />
    </div>
  );
}
