import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Moon, Sun, Monitor, Settings, ChevronDown } from "lucide-react";

const links = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/tilbud", label: "Tilbud" },
  { to: "/ordre", label: "Ordre" },
  { to: "/endringsmeldinger", label: "Endringsmeldinger" },
  { to: "/status", label: "Status" },
  { to: "/prosjekter", label: "Prosjekt" },
  { to: "/kunder", label: "Kunder" },
  { to: "/potensielle-kunder", label: "Potensielle kunder" },
  { to: "/admkost", label: "Adm.kost." },
];

type Theme = "light" | "dark" | "system";

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("th-theme") as Theme) ?? "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = theme === "dark" || (theme === "system" && prefersDark);
    root.classList.toggle("dark", isDark);
    localStorage.setItem("th-theme", theme);
  }, [theme]);

  return { theme, setTheme };
}

function initials(email: string | undefined) {
  if (!email) return "?";
  const name = email.split("@")[0];
  const parts = name.split(/[._-]/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Lys modus", icon: Sun },
  { value: "dark", label: "Mørk modus", icon: Moon },
  { value: "system", label: "Systemstandard", icon: Monitor },
];

export function AppNav() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { theme, setTheme } = useTheme();

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : to === "/" ? path === "/" : path.startsWith(to);

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const displayName = user?.email?.split("@")[0] ?? "Brukar";

  return (
    <header className="hm-topnav no-print">
      {/* Brand */}
      <Link to="/" className="hm-brand">
        <img
          src="/logo.png"
          alt="Techauge"
          className="hm-logo"
          style={{ height: "36px", width: "auto" }}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            img.style.display = "none";
            const fallback = img.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div className="hm-brand-text" style={{ display: "none" }}>
          <span>Techauge</span>
        </div>
      </Link>

      <div className="hm-nav-divider" />

      {/* Nav tabs */}
      <nav className="hm-tabs">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`hm-tab ${isActive(l.to, l.exact) ? "active" : ""}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* Right: profile dropdown */}
      <div className="hm-nav-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hm-user-chip" title="Profil og innstillingar">
              <span className="hm-avatar">{initials(user?.email)}</span>
              <span className="hidden sm:inline">{displayName}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            {/* Profilinfo */}
            <DropdownMenuLabel className="pb-2">
              <div className="flex items-center gap-3">
                <div
                  className="hm-avatar flex-shrink-0"
                  style={{ width: 36, height: 36, fontSize: 13 }}
                >
                  {initials(user?.email)}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-sm">
                    {displayName}
                  </div>
                  <div className="truncate text-xs font-normal text-muted-foreground">
                    {user?.email}
                  </div>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {/* Tema */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Utsjånad
              </DropdownMenuLabel>
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.value;
                return (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {opt.label}
                    </span>
                    {active && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            {/* Innstillingar */}
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/settings" className="flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  Innstillingar
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logg ut
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
