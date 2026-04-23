import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3, CheckCircle2, TrendingUp, Sun, Moon,
  LayoutDashboard, StickyNote, Brain, Wifi, UserCircle2, CalendarDays,
  ListChecks, Sparkles, Sheet, Settings, ChevronLeft, ChevronRight, Download,
  MoreHorizontal, Globe, ClipboardX, PenLine, Zap, FlaskConical
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { GlobalSearch, SearchButton } from "./GlobalSearch";
import { FontSizeControl, useFontScale } from "./FontSizeControl";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { trpc } from "@/lib/trpc";

declare const __APP_VERSION__: string;

// ── Navigation groups ────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { path: "/",                 label: "Início",       icon: LayoutDashboard },
      { path: "/question-session", label: "Treinos",     icon: ListChecks },
      { path: "/mentor",           label: "IA",    icon: Sparkles },
      { path: "/lab",              label: "Laboratório", icon: FlaskConical },
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
  { path: "/question-session", label: "Treinos",  icon: ListChecks },
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
      className="rounded-xl flex items-center justify-center flex-shrink-0 soe-logo-icon relative overflow-hidden"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)",
        boxShadow: "0 4px 15px rgba(var(--primary-rgb), 0.4)",
      }}
    >
      <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
      <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 12C4 10.8954 4.89543 10 6 10H23C24.1046 10 25 10.8954 25 12V38C25 39.1046 24.1046 40 23 40H6C4.89543 40 4 39.1046 4 38V12Z" stroke="white" strokeWidth="5"/>
        <path d="M27 12C27 10.8954 27.8954 10 29 10H46C47.1046 10 48 10.8954 48 12V38C48 39.1046 47.1046 40 46 40H29C27.8954 40 27 39.1046 27 38V12Z" stroke="white" strokeWidth="5"/>
        <circle cx="26" cy="42" r="3" fill="white" opacity="0.8"/>
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
        className={`flex items-center gap-3 px-4 py-2.5 rounded-full transition-all duration-300 group ${collapsed ? "justify-center mx-1" : "mx-2"}`}
        style={
          active
            ? { 
                background: "rgba(var(--primary-rgb), 0.25)", 
                color: "var(--primary)", 
                border: "1px solid var(--primary)",
                boxShadow: "0 0 15px rgba(var(--primary-rgb), 0.1)",
              }
            : { 
                color: "var(--sidebar-fg)", 
                opacity: 0.6,
                border: "1px solid transparent",
              }
        }
      >
        <Icon className={`w-[16px] h-[16px] flex-shrink-0 transition-transform group-hover:scale-110 ${active ? "opacity-100" : "opacity-80"}`} />
        {!collapsed && (
          <span
            className={active ? "font-black" : "font-medium"}
            style={{ fontSize: "0.825rem", letterSpacing: "-0.2px" }}
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
      className={`hidden md:flex flex-col flex-shrink-0 transition-all duration-500 ease-in-out relative ${collapsed ? "w-[72px]" : "w-[220px]"}`}
      style={{ 
        background: "var(--sidebar-bg)", 
        borderRight: "1px solid rgba(255,255,255,0.04)",
        boxShadow: "10px 0 30px rgba(0,0,0,0.05)"
      }}
    >
      {/* Logo row */}
      <div
        className={`px-5 py-8 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}
      >
        <Link href="/">
          <a className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <SoeLogo size={32} />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-black text-[18px] tracking-[-0.8px] leading-none text-white">
                  SOE
                </span>
                <span className="text-[8px] font-black tracking-[0.2em] text-primary/60 uppercase">Ecosystem</span>
              </div>
            )}
          </a>
        </Link>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
            title="Recolher menu"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center pb-4">
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all"
            title="Expandir menu"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto px-1 py-4 space-y-8 custom-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            {!collapsed ? (
              <p
                className="px-6 mb-2 text-[9px] font-black uppercase tracking-[0.25em]"
                style={{ color: "var(--primary)", opacity: 0.4 }}
              >
                {group.label}
              </p>
            ) : (
              <div className="my-4 mx-auto w-4 h-[1px] bg-white/5" />
            )}
            <div className="space-y-1">
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
      <div className="p-4 mt-auto">
        <Link href="/profile">
          <a
            title={collapsed ? "Configurações" : undefined}
            className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition-all group ${collapsed ? "justify-center mx-1" : "mx-2"}`}
            style={
              isActivePath(location, "/profile")
                ? { background: "rgba(var(--primary-rgb), 0.08)", color: "var(--primary)", boxShadow: "0 0 0 1px rgba(var(--primary-rgb), 0.12)" }
                : { color: "var(--sidebar-fg)", opacity: 0.6 }
            }
          >
            <Settings className="w-[16px] h-[16px] flex-shrink-0 group-hover:rotate-45 transition-transform" />
            {!collapsed && (
              <span className="font-bold" style={{ fontSize: "0.825rem", letterSpacing: "-0.2px" }}>
                Configurações
              </span>
            )}
          </a>
        </Link>
        {!collapsed && (
          <div className="px-5 pt-4 flex items-center justify-between">
            <span className="text-[10px] font-black opacity-20 tracking-widest uppercase">
              Release
            </span>
            <span className="text-[10px] font-mono opacity-20">
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
  const { data: user } = trpc.auth.me.useQuery();

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
          <div className="flex items-center gap-4">
            <SearchButton />
            <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-white/5 active:scale-95 transition-all" style={{ color: "var(--muted-text)" }}>
              {theme === "light" ? <Moon className="w-[22px] h-[22px]" /> : <Sun className="w-[22px] h-[22px]" />}
            </button>
            <Link href="/sync">
              <a className="p-2 rounded-xl active:scale-95 transition-all" style={{ color: isActivePath(location, "/sync") ? "var(--primary)" : "var(--muted-text)" }}>
                <Wifi className="w-[22px] h-[22px]" />
              </a>
            </Link>
            <Link href="/profile">
              <a className="p-[2px] rounded-xl active:scale-95 transition-all overflow-hidden flex items-center justify-center border-2 border-primary" 
                 style={{ 
                   width: "36px", height: "36px",
                   boxShadow: '0 0 10px rgba(var(--primary-rgb), 0.2)'
                 }}>
                <div className="w-full h-full rounded-[9px] overflow-hidden bg-secondary flex items-center justify-center">
                  {user?.settings?.profileImage ? (
                    <img src={user.settings.profileImage} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <UserCircle2 className="w-[22px] h-[22px]" style={{ color: "var(--primary)" }} />
                  )}
                </div>
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
                className="p-[2px] rounded-xl hover:opacity-80 transition-all ml-0.5 overflow-hidden flex items-center justify-center border-2 border-primary shadow-sm"
                style={{ 
                  width: "32px", height: "32px",
                  boxShadow: '0 0 10px rgba(var(--primary-rgb), 0.2)'
                }}
                title="Configurações"
              >
                <div className="w-full h-full rounded-[9px] overflow-hidden bg-secondary flex items-center justify-center">
                  {user?.settings?.profileImage ? (
                    <img src={user.settings.profileImage} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <UserCircle2 className="w-[18px] h-[18px]" style={{ color: "var(--primary)" }} />
                  )}
                </div>
              </a>
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto w-full" style={{ background: "var(--app-bg)" }}>
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
