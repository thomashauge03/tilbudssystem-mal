import { QueryClient } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, useRouterState, Navigate,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppNav } from "@/components/app-nav";
import { useEffect } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Siden finnes ikke</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Tilbake til Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  // L1: only log to console in dev; don't leak schema/DB details in production
  if (import.meta.env.DEV) console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Noe gikk galt</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Prøv igjen</button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  return (
    <AuthProvider>
      <AppShell />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}

function NoTenantPage({ email, signOut }: { email: string; signOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center space-y-4">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
        </div>
        <h1 className="text-xl font-semibold">Ingen tilgang</h1>
        <p className="text-sm text-muted-foreground">
          Kontoen <strong>{email}</strong> er ikke koblet til noe system ennå.<br />
          Kontakt Techauge for å få tilgang.
        </p>
        <button
          onClick={signOut}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Logg ut
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const { user, loading, roleLoading, hasTenant, signOut, branding } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const isPublic = path === "/login";

  // Sett primærfarge basert på tenant-branding
  useEffect(() => {
    const root = document.documentElement;
    const raw = branding?.primary_color;
    // H4: validate hex color before writing to CSS to prevent CSS injection
    const color = raw && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : null;
    if (color) {
      // Berekn luminans for å velje riktig tekstfarge (kvit/svart)
      const hex = color.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const fg = luminance > 0.45 ? "#111111" : "#ffffff";
      root.style.setProperty("--primary", color);
      root.style.setProperty("--primary-foreground", fg);
      root.style.setProperty("--ring", color);
      root.style.setProperty("--sidebar-primary", color);
      root.style.setProperty("--sidebar-primary-foreground", fg);
      root.style.setProperty("--sidebar-ring", color);
    } else {
      ["--primary","--primary-foreground","--ring","--sidebar-primary","--sidebar-primary-foreground","--sidebar-ring"]
        .forEach(v => root.style.removeProperty(v));
    }
  }, [branding?.primary_color]);

  if (loading || roleLoading) {
    return (
      <div style={{
        background: "#080808",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
          .th-spinner {
            width: 44px; height: 44px; border-radius: 50%;
            border: 2px solid rgba(220,38,38,0.15);
            border-top-color: #dc2626;
            animation: spin 0.8s linear infinite;
          }
          .th-loading-text {
            font-size: 11px; font-weight: 600; letter-spacing: 0.14em;
            text-transform: uppercase; color: rgba(255,255,255,0.25);
            animation: pulse 2s ease-in-out infinite;
          }
        `}</style>
        <div className="th-spinner" />
        <span className="th-loading-text">Laster</span>
      </div>
    );
  }

  if (!user && !isPublic) return <Navigate to="/login" />;
  if (isPublic) return <Outlet />;

  if (!hasTenant) {
    return <NoTenantPage email={user?.email ?? ""} signOut={signOut} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
