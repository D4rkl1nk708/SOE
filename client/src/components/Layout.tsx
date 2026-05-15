import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  CheckCircle2,
  TrendingUp,
  Sun,
  Moon,
  LayoutDashboard,
  StickyNote,
  Brain,
  Wifi,
  UserCircle2,
  CalendarDays,
  ListChecks,
  Sparkles,
  Sheet,
  Settings,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  Globe,
  ClipboardX,
  PenLine,
  Zap,
  FlaskConical,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { GlobalSearch, SearchButton } from "./GlobalSearch";
import { FontSizeControl, useFontScale } from "./FontSizeControl";
import { ChangelogModal } from "./ChangelogModal";
import { FeaturesModal } from "./FeaturesModal";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { trpc } from "@/lib/trpc";

declare const __APP_VERSION__: string;

// ── Navigation groups ────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { path: "/", label: "Início", icon: LayoutDashboard },
      { path: "/question-session", label: "Treinos", icon: ListChecks },
      { path: "/mentor", label: "IA", icon: Sparkles },
      { path: "/lab", label: "Laboratório", icon: FlaskConical },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { path: "/disciplines", label: "Disciplinas", icon: BarChart3 },
      { path: "/statistics", label: "Estatísticas", icon: TrendingUp },
      { path: "/flashcards", label: "Flashcards", icon: Brain },
      { path: "/notes", label: "Anotações", icon: StickyNote },
    ],
  },
  {
    label: "Organização",
    items: [
      { path: "/calendar", label: "Calendário", icon: CalendarDays },
      { path: "/edital", label: "Editais", icon: Sheet },
      { path: "/sync", label: "Sync & Backup", icon: Wifi },
    ],
  },
];

// Flat list for mobile bottom bar — only the most-used 4 items + "More"
const MOBILE_PRIMARY = [
  { path: "/", label: "Início", icon: LayoutDashboard },
  { path: "/question-session", label: "Treinos", icon: ListChecks },
  { path: "/mentor", label: "Mentor IA", icon: Sparkles },
  { path: "/calendar", label: "Calendário", icon: CalendarDays },
];

const MOBILE_SECONDARY = [
  {
    path: "/disciplines",
    label: "Disciplinas",
    icon: BarChart3,
    color: "#3b82f6",
  },
  {
    path: "/statistics",
    label: "Estatísticas",
    icon: TrendingUp,
    color: "#10b981",
  },
  { path: "/flashcards", label: "Flashcards", icon: Brain, color: "#f59e0b" },
  { path: "/notes", label: "Anotações", icon: StickyNote, color: "#8b5cf6" },
  { path: "/edital", label: "Editais", icon: Sheet, color: "#ec4899" },
  {
    path: "/mock-exams",
    label: "Simulados",
    icon: ListChecks,
    color: "#6366f1",
  },
  { path: "/sync", label: "Sincronizar", icon: Wifi, color: "#06b6d4" },
  { path: "/profile", label: "Perfil", icon: UserCircle2, color: "#64748b" },
];

function isActivePath(location: string, path: string) {
  if (path === "/") return location === "/";
  return location === path || location.startsWith(path + "/");
}

// ── SOE Logo mark ─────────────────────────────────────────────────────────────
function SoeLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-lg flex items-center justify-center flex-shrink-0 border border-primary/20 bg-card shadow-sm"
      style={{
        width: size,
        height: size,
      }}
    >
      <svg
        width={Math.round(size * 0.5)}
        height={Math.round(size * 0.5)}
        viewBox="0 0 52 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4 12H25V38H4V12Z"
          className="stroke-primary"
          strokeWidth="6"
        />
        <path
          d="M27 12H48V38H27V12Z"
          className="stroke-primary"
          strokeWidth="6"
        />
        <rect x="23" y="38" width="6" height="6" className="fill-primary" />
      </svg>
    </div>
  );
}

// ── Single nav item ───────────────────────────────────────────────────────────
function NavItem({
  path,
  label,
  icon: Icon,
  collapsed,
  active,
}: {
  path: string;
  label: string;
  icon: any;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={path}
      id={`tour-nav-${path.replace("/", "") || "home"}`}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group relative ${collapsed ? "justify-center mx-1" : "mx-2"} ${
        active
          ? "bg-secondary text-primary border border-border shadow-sm"
          : "text-muted-foreground hover:bg-secondary/30 hover:text-foreground border border-transparent"
      }`}
    >
      <Icon
        className={`w-4 h-4 flex-shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
      />
      {!collapsed && (
        <span
          className={`text-[11px] uppercase tracking-wider ${active ? "font-bold" : "font-semibold"}`}
        >
          {label}
        </span>
      )}
      {active && !collapsed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-full" />
      )}
    </Link>
  );
}

// ── Desktop Sidebar ───────────────────────────────────────────────────────────
function Sidebar({
  collapsed,
  onToggle,
  location,
}: {
  collapsed: boolean;
  onToggle: () => void;
  location: string;
}) {
  return (
    <aside
      className={`hidden md:flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out relative ${collapsed ? "w-[64px]" : "w-[200px]"} bg-sidebar border-r border-border`}
    >
      {/* Logo row */}
      <div
        className={`px-4 py-6 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}
      >
        <Link
          href="/"
          className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}
        >
          <SoeLogo size={24} />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tighter leading-none text-foreground">
                SOE
              </span>
            </div>
          )}
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
        <Link
          href="/profile"
          title={collapsed ? "Configurações" : undefined}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all group ${collapsed ? "justify-center mx-1" : "mx-2"} ${
            isActivePath(location, "/profile")
              ? "bg-secondary text-primary border border-border shadow-sm"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground border border-transparent"
          }`}
        >
          <Settings
            className={`w-4 h-4 flex-shrink-0 transition-transform ${isActivePath(location, "/profile") ? "text-primary" : ""}`}
          />
          {!collapsed && (
            <span
              className={`text-xs ${isActivePath(location, "/profile") ? "font-semibold" : "font-medium"}`}
              style={{ letterSpacing: "-0.2px" }}
            >
              Configurações
            </span>
          )}
        </Link>
        {!collapsed && (
          <div className="px-5 pt-4 flex flex-col gap-2">
            <button
              onClick={() =>
                window.dispatchEvent(new CustomEvent("soe-open-features"))
              }
              className="flex items-center gap-3 px-4 py-2 rounded-lg bg-card border border-border hover:bg-secondary transition-all group mb-2 shadow-sm"
            >
              <Sparkles size={14} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground">
                Recursos
              </span>
            </button>

            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black opacity-20 tracking-widest uppercase">
                Versão
              </span>
              <button
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("soe-open-changelog"))
                }
                className="text-[10px] font-mono opacity-20 hover:opacity-100 hover:text-[var(--primary)] transition-all cursor-pointer"
                title="Ver novidades desta atualização"
              >
                {typeof __APP_VERSION__ !== "undefined"
                  ? "v" + __APP_VERSION__
                  : ""}
              </button>
            </div>
          </div>
        )}
      </div>

      <ChangelogModal />
      <FeaturesModal />
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
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        location={location}
      />

      {/* Content area */}
      <div
        className="flex-1 flex flex-col min-w-0 overflow-hidden pb-16 md:pb-0"
        style={{ background: "var(--app-bg)" }}
      >
        {/* Mobile header */}
        <header
          className="md:hidden flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{
            background: "var(--header-bg)",
            borderBottom: "1px solid var(--card-border)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <SoeLogo size={28} />
            <span
              className="font-bold text-[15px] tracking-[-0.4px]"
              style={{ color: "var(--primary)" }}
            >
              SOE
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                window.dispatchEvent(new CustomEvent("soe-start-tour"))
              }
              className="p-2 rounded-xl text-primary active:scale-95 transition-all"
              title="Iniciar Tour"
            >
              <Zap className="w-[22px] h-[22px]" />
            </button>
            <SearchButton />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-white/5 active:scale-95 transition-all"
              style={{ color: "var(--muted-text)" }}
            >
              {theme === "light" ? (
                <Moon className="w-[22px] h-[22px]" />
              ) : (
                <Sun className="w-[22px] h-[22px]" />
              )}
            </button>
            <Link
              href="/sync"
              className="p-2 rounded-xl active:scale-95 transition-all"
              style={{
                color: isActivePath(location, "/sync")
                  ? "var(--primary)"
                  : "var(--muted-text)",
              }}
            >
              <Wifi className="w-[22px] h-[22px]" />
            </Link>
            <Link
              href="/profile"
              className="p-[1px] rounded-lg active:scale-95 transition-all overflow-hidden flex items-center justify-center border border-border bg-card shadow-sm"
              style={{
                width: "32px",
                height: "32px",
              }}
            >
              <div className="w-full h-full rounded-[7px] overflow-hidden bg-secondary flex items-center justify-center">
                {user?.settings?.profileImage ? (
                  <img
                    src={user.settings.profileImage}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserCircle2 className="w-[18px] h-[18px] text-muted-foreground" />
                )}
              </div>
            </Link>
          </div>
        </header>

        {/* Desktop top bar */}
        <header
          className="hidden md:flex items-center justify-between px-6 py-3 flex-shrink-0"
          style={{
            background: "var(--header-bg)",
            borderBottom: "1px solid var(--card-border)",
            backdropFilter: "blur(12px)",
          }}
        >
          <h2
            className="text-[13px] font-semibold"
            style={{ color: "var(--foreground)", letterSpacing: "-0.25px" }}
          >
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
              {theme === "light" ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>
            <button
              id="tour-trigger"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("soe-start-tour"))
              }
              className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-all flex items-center gap-1.5"
              title="Iniciar Tour Guiado"
            >
              <Zap size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider hidden lg:inline">
                Tour
              </span>
            </button>
            <Link
              href="/profile"
              className="p-[1px] rounded-lg hover:border-primary transition-all ml-1 overflow-hidden flex items-center justify-center border border-border bg-card shadow-sm"
              style={{
                width: "30px",
                height: "30px",
              }}
              title="Configurações"
            >
              <div className="w-full h-full rounded-[7px] overflow-hidden bg-secondary flex items-center justify-center">
                {user?.settings?.profileImage ? (
                  <img
                    src={user.settings.profileImage}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserCircle2 className="w-[18px] h-[18px] text-muted-foreground" />
                )}
              </div>
            </Link>
          </div>
        </header>

        <main
          className="flex-1 overflow-x-hidden overflow-y-auto w-full"
          style={{ background: "var(--app-bg)" }}
        >
          <div className="w-full p-3 md:p-6">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav — 4 primary items + 1 More menu */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "var(--sidebar-bg)",
          borderTop:
            "1px solid var(--sidebar-border-color, var(--card-border))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex justify-around items-center px-1 py-1">
          {MOBILE_PRIMARY.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(location, item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[64px] transition-all"
                style={{
                  color: active ? "var(--primary)" : "var(--sidebar-fg)",
                }}
              >
                <div
                  className="p-1.5 rounded-lg"
                  style={{
                    background: active
                      ? "var(--primary-bg-subtle)"
                      : "transparent",
                  }}
                >
                  <Icon
                    className="w-[20px] h-[20px]"
                    style={{ opacity: active ? 1 : 0.45 }}
                  />
                </div>
                <span
                  className="text-[9px] leading-none tracking-tight font-bold"
                  style={{ opacity: active ? 1 : 0.55 }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* More Menu */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[64px] outline-none"
                style={{ color: "var(--sidebar-fg)" }}
              >
                <div className="p-1.5 rounded-lg">
                  <MoreHorizontal
                    className="w-[20px] h-[20px]"
                    style={{ opacity: 0.45 }}
                  />
                </div>
                <span
                  className="text-[9px] leading-none tracking-tight font-bold"
                  style={{ opacity: 0.55 }}
                >
                  Mais
                </span>
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
                        <Link
                          href={item.path}
                          className="flex flex-col items-center gap-2 p-2 rounded-2xl transition-all active:scale-95 outline-none"
                        >
                          <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center"
                            style={{
                              background: `rgba(${item.color === "#3b82f6" ? "59,130,246" : item.color === "#10b981" ? "16,185,129" : "128,128,128"}, 0.1)`,
                              color: item.color,
                            }}
                          >
                            <Icon className="w-6 h-6" />
                          </div>
                          <span
                            className="text-[10px] font-bold text-center leading-tight"
                            style={{ color: "var(--app-fg)" }}
                          >
                            {item.label}
                          </span>
                        </Link>
                      </DropdownMenu.Item>
                    );
                  })}
                </div>
                <DropdownMenu.Arrow
                  className="fill-current"
                  style={{ color: "var(--card-border)" }}
                />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </nav>

      <GlobalSearch />
    </div>
  );
}
