import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus, Trash2, Users, Building2, RefreshCw, Search,
  CheckCircle2, Clock, ChevronLeft, ChevronRight,
  LayoutDashboard, Link2, X, ShieldAlert, Eye, EyeOff, UserX, Palette, Upload,
} from "lucide-react";

// ── Passord-bekreftelse modal ────────────────────────────────────────────────
function PasswordConfirmModal({ onConfirm, onCancel, title, description }: {
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
}) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 3;

  const confirm = async () => {
    if (!password || attempts >= maxAttempts) return;
    setLoading(true);
    setError("");
    const { error: e } = await supabase.auth.signInWithPassword({
      email: user?.email ?? "",
      password,
    });
    setLoading(false);
    if (e) {
      const next = attempts + 1;
      setAttempts(next);
      if (next >= maxAttempts) { setError("For mange feil forsøk. Prøv igjen seinare."); onCancel(); return; }
      setError(`Feil passord. Prøv igjen (${next}/${maxAttempts}).`);
      return;
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl border bg-card shadow-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{title}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Bekreft med ditt passord</Label>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              placeholder="Passord…"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button onClick={confirm} disabled={loading || !password}>
            {loading ? "Bekrefter…" : "Bekreft"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Tenant = { id: string; name: string; slug: string; created_at: string };
type TenantUser = { id: string; tenant_id: string; user_id: string; role: string };
type AuthUser = { id: string; email: string; confirmed_at: string | null; created_at: string };

const PAGE_SIZE = 15;

// M6: reset on resetKey (search/filter string) so page resets when filter changes, not just count
function usePagination<T>(items: T[], resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [resetKey]);
  return { paged, page, setPage, totalPages };
}

function Pagination({ page, totalPages, setPage, total }: {
  page: number; totalPages: number; setPage: (p: number) => void; total: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-3 border-t text-sm text-muted-foreground">
      <span>{total} totalt</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPage(page - 1)}
          disabled={page === 1}
          className="rounded p-1 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-medium text-foreground">{page} / {totalPages}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page === totalPages}
          className="rounded p-1 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${color ?? "bg-muted/30"}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

type Tab = "oversikt" | "brukere" | "kunder" | "koble" | "tilpass";

// C1: wrap so hooks are not called after early return
function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // H1: navigate added to deps
  useEffect(() => {
    if (!authLoading && !isAdmin) navigate({ to: "/" });
  }, [isAdmin, authLoading, navigate]);

  if (authLoading || !isAdmin) return null;
  return <AdminPageContent />;
}

function AdminPageContent() {
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const [tab, setTab] = useState<Tab>("oversikt");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Users tab
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "confirmed" | "unconfirmed" | "linked" | "unlinked">("all");

  // Tenants tab
  const [tenantSearch, setTenantSearch] = useState("");

  // New tenant form
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  // Link form
  const [linkUserId, setLinkUserId] = useState("");
  const [linkTenantId, setLinkTenantId] = useState("");
  const [linkRole, setLinkRole] = useState("member");
  const [linking, setLinking] = useState(false);
  const [linkUserSearch, setLinkUserSearch] = useState("");
  const [linkTenantSearch, setLinkTenantSearch] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [deleteUserModal, setDeleteUserModal] = useState<AuthUser | null>(null);
  const [deleteTenantModal, setDeleteTenantModal] = useState<Tenant | null>(null);

  const load = async () => {
    setLoading(true);
    const [tuRes, tenantsRes, usersRes] = await Promise.all([
      supabase.rpc("list_tenant_users" as never),
      supabase.rpc("list_tenants" as never),
      supabase.rpc("list_auth_users" as never),
    ]);
    if (!mountedRef.current) return;
    if (tuRes.data) setTenantUsers(tuRes.data as TenantUser[]);
    if (tenantsRes.data) setTenants(tenantsRes.data as Tenant[]);
    if (usersRes.data) setAuthUsers(usersRes.data as AuthUser[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Derived
  const linkedUserIds = new Set(tenantUsers.map(tu => tu.user_id));
  const confirmedCount = authUsers.filter(u => !!u.confirmed_at).length;
  const unconfirmedCount = authUsers.length - confirmedCount;
  const unlinkedCount = authUsers.filter(u => !linkedUserIds.has(u.id)).length;

  const getTenantForUser = (userId: string) => {
    const tu = tenantUsers.find(tu => tu.user_id === userId);
    if (!tu) return null;
    return { tenant: tenants.find(t => t.id === tu.tenant_id), role: tu.role, tuId: tu.id };
  };

  // Filtered users
  const filteredUsers = useMemo(() => authUsers.filter(u => {
    const matchSearch = u.email.toLowerCase().includes(userSearch.toLowerCase());
    const isLinked = linkedUserIds.has(u.id);
    const matchFilter =
      userFilter === "all" ? true :
      userFilter === "confirmed" ? !!u.confirmed_at :
      userFilter === "unconfirmed" ? !u.confirmed_at :
      userFilter === "linked" ? isLinked :
      !isLinked;
    return matchSearch && matchFilter;
  }), [authUsers, userSearch, userFilter, tenantUsers]);

  // Filtered tenants
  const filteredTenants = useMemo(() =>
    tenants.filter(t =>
      t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.slug.toLowerCase().includes(tenantSearch.toLowerCase())
    ), [tenants, tenantSearch]);

  const userPagination = usePagination(filteredUsers, userSearch + userFilter);
  const tenantPagination = usePagination(filteredTenants, tenantSearch);

  // Link search
  const filteredLinkUsers = useMemo(() =>
    authUsers.filter(u => u.email.toLowerCase().includes(linkUserSearch.toLowerCase())).slice(0, 8),
    [authUsers, linkUserSearch]);
  const filteredLinkTenants = useMemo(() =>
    tenants.filter(t => t.name.toLowerCase().includes(linkTenantSearch.toLowerCase())).slice(0, 8),
    [tenants, linkTenantSearch]);

  const handleNameChange = (name: string) => {
    setNewName(name);
    setNewSlug(name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
  };

  const createTenant = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_create_tenant" as never, {
      p_name: newName.trim(), p_slug: newSlug.trim(),
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`«${newName}» opprettet!`);
    setNewName(""); setNewSlug("");
    load();
  };

  // L2: use PasswordConfirmModal instead of window.confirm() for destructive action
  const deleteTenant = async (tenant: Tenant) => {
    const { error } = await supabase.rpc("admin_delete_tenant" as never, { p_tenant_id: tenant.id } as never);
    if (error) { toast.error(error.message); return; }
    toast.success(`«${tenant.name}» slettet`);
    setDeleteTenantModal(null);
    load();
  };

  const doLinkUser = async () => {
    setLinking(true);
    // Bekreft e-post automatisk ved kobling
    await supabase.rpc("confirm_user_email" as never, { target_user_id: linkUserId } as never);

    const { error } = await supabase.rpc("admin_link_user" as never, {
      p_user_id: linkUserId, p_tenant_id: linkTenantId, p_role: linkRole,
    } as never);
    setLinking(false);
    if (error) { toast.error(error.message); return; }
    const t = tenants.find(t => t.id === linkTenantId);
    const u = authUsers.find(u => u.id === linkUserId);
    toast.success(`${u?.email} koblet til «${t?.name}» som ${linkRole} — e-post bekreftet`);
    setLinkUserId(""); setLinkTenantId(""); setLinkUserSearch(""); setLinkTenantSearch("");
    load();
  };

  const linkUser = () => {
    if (!linkTenantId || !linkUserId) return;
    if (linkRole === "admin") {
      setShowPasswordModal(true);
    } else {
      doLinkUser();
    }
  };

  const unlinkUser = async (tuId: string) => {
    const { error } = await supabase.rpc("delete_tenant_user" as never, { tenant_user_id: tuId } as never);
    if (error) { toast.error(error.message); return; }
    // Oppdater state direkte uten å vente på re-fetch
    setTenantUsers(prev => prev.filter(tu => tu.id !== tuId));
    toast.success("Tilgang fjernet");
  };

  const deleteUser = async (user: AuthUser) => {
    // H6: use RPC instead of direct delete to respect security-definer logic
    const userTenantLinks = tenantUsers.filter(tu => tu.user_id === user.id);
    await Promise.all(userTenantLinks.map(tu =>
      supabase.rpc("delete_tenant_user" as never, { tenant_user_id: tu.id } as never)
    ));
    const { error } = await supabase.rpc("delete_auth_user" as never, { target_user_id: user.id } as never);
    if (error) { toast.error(error.message); return; }
    toast.success(`${user.email} er slettet fra systemet`);
    setDeleteUserModal(null);
    load();
  };

  // ── Tilpass state ──────────────────────────────────────────────────────────
  const [tilpassTenantId, setTilpassTenantId] = useState("");
  const [tilpassSettings, setTilpassSettings] = useState<{
    company_name: string; company_tagline: string; primary_color: string; logo_url: string;
  }>({ company_name: "", company_tagline: "", primary_color: "#dc2626", logo_url: "" });
  const [tilpassLoading, setTilpassLoading] = useState(false);
  const [tilpassSaving, setTilpassSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const loadTilpass = async (tenantId: string) => {
    setTilpassTenantId(tenantId);
    setTilpassLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("company_name, company_tagline, primary_color, logo_url")
      .eq("tenant_id", tenantId)
      .single();
    setTilpassSettings({
      company_name: data?.company_name ?? tenants.find(t => t.id === tenantId)?.name ?? "",
      company_tagline: data?.company_tagline ?? "",
      primary_color: (data as any)?.primary_color ?? "#dc2626",
      logo_url: (data as any)?.logo_url ?? "",
    });
    setTilpassLoading(false);
  };

  const saveTilpass = async () => {
    if (!tilpassTenantId) return;
    setTilpassSaving(true);
    const { error } = await supabase.rpc("save_app_settings", {
      p_tenant_id:       tilpassTenantId,
      p_company_name:    tilpassSettings.company_name,
      p_company_tagline: tilpassSettings.company_tagline,
      p_primary_color:   tilpassSettings.primary_color,
      p_logo_url:        tilpassSettings.logo_url,
    });
    setTilpassSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Innstillinger lagret!");
  };

  const uploadLogo = async (file: File) => {
    if (!tilpassTenantId) return;
    // L5: reject files over 2 MB
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo kan ikke være større enn 2 MB"); return; }
    setLogoUploading(true);
    // L4: derive extension from MIME type, not filename
    const mimeToExt: Record<string, string> = {
      "image/png": "png", "image/jpeg": "jpg",
      "image/svg+xml": "svg", "image/webp": "webp",
    };
    const ext = mimeToExt[file.type] ?? "png";
    const path = `${tilpassTenantId}/logo.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setLogoUploading(false); return; }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    setTilpassSettings(s => ({ ...s, logo_url: data.publicUrl }));
    setLogoUploading(false);
    toast.success("Logo lastet opp!");
  };

  const PRESET_COLORS = [
    "#dc2626", "#ea580c", "#d97706", "#16a34a",
    "#0284c7", "#7c3aed", "#db2777", "#0f172a",
  ];

  const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "oversikt", label: "Oversikt", icon: LayoutDashboard },
    { id: "brukere", label: `Brukere (${authUsers.length})`, icon: Users },
    { id: "kunder", label: `Kunder (${tenants.length})`, icon: Building2 },
    { id: "koble", label: "Koble bruker", icon: Link2 },
    { id: "tilpass", label: "Tilpass", icon: Palette },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Administrer kunder og brukertilganger</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Oppdater
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERSIKT ── */}
      {tab === "oversikt" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Kunder" value={tenants.length} />
            <StatCard label="Brukere totalt" value={authUsers.length} />
            <StatCard
              label="Bekreftet"
              value={confirmedCount}
              color="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
            />
            <StatCard
              label="Ikke bekreftet"
              value={unconfirmedCount}
              color="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Koblet til kunde" value={authUsers.length - unlinkedCount} />
            <StatCard
              label="Uten kunde"
              value={unlinkedCount}
              color={unlinkedCount > 0 ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900" : "bg-muted/30"}
            />
          </div>

          {/* Siste aktivitet */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-sm font-semibold">Nyeste brukere</h2>
            </div>
            <div className="p-4 space-y-2">
              {authUsers.slice(0, 5).map(u => {
                const linked = getTenantForUser(u.id);
                return (
                  <div key={u.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-2">
                      {u.confirmed_at
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        : <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                      <span className="text-sm">{u.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!u.confirmed_at && (
                        <button
                          onClick={async () => {
                            await supabase.rpc("confirm_user_email" as never, { target_user_id: u.id } as never);
                            toast.success(`${u.email} bekreftet`);
                            load();
                          }}
                          className="text-xs text-amber-600 hover:underline font-medium"
                        >
                          Bekreft e-post
                        </button>
                      )}
                      {linked?.tenant
                        ? <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">{linked.tenant.name}</span>
                        : <span className="text-xs text-muted-foreground italic">Ingen kunde</span>}
                    </div>
                  </div>
                );
              })}
              {authUsers.length > 5 && (
                <button onClick={() => setTab("brukere")} className="w-full text-center text-xs text-primary hover:underline pt-1">
                  Se alle {authUsers.length} brukere →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BRUKERE ── */}
      {tab === "brukere" && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-6 py-4 space-y-3">
            {/* Søk */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søk på e-post…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* Filter pills */}
            <div className="flex gap-1.5 flex-wrap">
              {([
                ["all", "Alle"],
                ["confirmed", `Bekreftet (${confirmedCount})`],
                ["unconfirmed", `Ikke bekreftet (${unconfirmedCount})`],
                ["linked", "Med kunde"],
                ["unlinked", `Uten kunde (${unlinkedCount})`],
              ] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setUserFilter(val)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    userFilter === val
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y">
            {userPagination.paged.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Ingen brukere funnet</p>
            ) : userPagination.paged.map(u => {
              const linked = getTenantForUser(u.id);
              return (
                <div key={u.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {u.confirmed_at
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      : <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Opprettet {new Date(u.created_at).toLocaleDateString("nb-NO")}
                        {u.confirmed_at ? ` · Bekreftet ${new Date(u.confirmed_at).toLocaleDateString("nb-NO")}` : " · Venter på bekreftelse"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {linked?.tenant ? (
                      <>
                        <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
                          {linked.tenant.name}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          linked.role === "admin"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {linked.role}
                        </span>
                        <button
                          onClick={() => unlinkUser(linked.tuId)}
                          title="Fjern fra kunde"
                          className="text-muted-foreground hover:text-amber-500 transition-colors p-1"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setLinkUserId(u.id); setLinkUserSearch(u.email); setTab("koble"); }}
                        className="text-xs text-primary hover:underline"
                      >
                        + Koble til kunde
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteUserModal(u)}
                      title="Slett bruker permanent"
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 ml-1"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-6 py-3">
            <Pagination {...userPagination} total={filteredUsers.length} />
          </div>
        </div>
      )}

      {/* ── KUNDER ── */}
      {tab === "kunder" && (
        <div className="space-y-4">
          {/* Ny kunde */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-sm font-semibold">Opprett ny kunde</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Firmanavn</Label>
                  <Input placeholder="T.d. TT Anlegg" value={newName} onChange={(e) => handleNameChange(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Slug (unik ID)</Label>
                  <Input placeholder="tt-anlegg" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Genereres automatisk</p>
                </div>
              </div>
              <Button className="mt-4" onClick={createTenant} disabled={saving || !newName || !newSlug}>
                <Plus className="mr-2 h-4 w-4" />
                {saving ? "Oppretter…" : "Opprett kunde"}
              </Button>
            </div>
          </div>

          {/* Kundelist */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk på kundenavn eller slug…"
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="divide-y">
              {tenantPagination.paged.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Ingen kunder funnet</p>
              ) : tenantPagination.paged.map(tenant => {
                const users = tenantUsers.filter(tu => tu.tenant_id === tenant.id);
                return (
                  <div key={tenant.id} className="px-6 py-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{tenant.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{tenant.slug}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {users.length} bruker{users.length !== 1 ? "e" : ""}
                        </span>
                        <button
                          onClick={() => { setLinkTenantId(tenant.id); setLinkTenantSearch(tenant.name); setTab("koble"); }}
                          className="text-xs text-primary hover:underline"
                        >
                          + Legg til bruker
                        </button>
                        <button
                          onClick={() => setDeleteTenantModal(tenant)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {users.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {users.map(tu => {
                          const u = authUsers.find(u => u.id === tu.user_id);
                          return (
                            <div key={tu.id} className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs">
                              {u?.confirmed_at
                                ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                                : <Clock className="h-3 w-3 text-amber-500" />}
                              <span>{u?.email ?? tu.user_id.slice(0, 8)}</span>
                              <span className={`font-medium ${tu.role === "admin" ? "text-primary" : "text-muted-foreground"}`}>
                                · {tu.role}
                              </span>
                              <button
                                onClick={() => unlinkUser(tu.id)}
                                className="ml-0.5 text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-3">
              <Pagination {...tenantPagination} total={filteredTenants.length} />
            </div>
          </div>
        </div>
      )}

      {/* Slett tenant modal */}
      {deleteTenantModal && (
        <PasswordConfirmModal
          title={`Slett «${deleteTenantModal.name}»`}
          description="Dette sletter ALL data for denne kunden. Handlingen kan ikke angres."
          onConfirm={() => deleteTenant(deleteTenantModal)}
          onCancel={() => setDeleteTenantModal(null)}
        />
      )}

      {/* Slett bruker modal */}
      {deleteUserModal && (
        <PasswordConfirmModal
          title={`Slett ${deleteUserModal.email}`}
          description="Dette fjerner brukeren permanent fra systemet og alle tilknyttede kunder. Handlingen kan ikke angres."
          onConfirm={() => deleteUser(deleteUserModal)}
          onCancel={() => setDeleteUserModal(null)}
        />
      )}

      {/* Passord-modal */}
      {showPasswordModal && (
        <PasswordConfirmModal
          title="Bekreft admin-tilgang"
          description="Du er i ferd med å gi admin-tilgang. Skriv inn ditt passord for å bekrefte."
          onConfirm={() => { setShowPasswordModal(false); doLinkUser(); }}
          onCancel={() => setShowPasswordModal(false)}
        />
      )}

      {/* ── KOBLE ── */}
      {tab === "koble" && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-sm font-semibold">Koble bruker til kunde</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Søk og velg bruker og kunde</p>
          </div>
          <div className="p-6 space-y-6">
            {/* Velg bruker */}
            <div className="space-y-2">
              <Label>Bruker</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk på e-post…"
                  value={linkUserSearch}
                  onChange={(e) => { setLinkUserSearch(e.target.value); setLinkUserId(""); }}
                  className="pl-9"
                />
              </div>
              {linkUserSearch && !linkUserId && (
                <div className="rounded-lg border bg-background shadow-sm divide-y max-h-48 overflow-y-auto">
                  {filteredLinkUsers.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">Ingen treff</p>
                  ) : filteredLinkUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => { setLinkUserId(u.id); setLinkUserSearch(u.email); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 text-left transition-colors"
                    >
                      {u.confirmed_at
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        : <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">{u.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.confirmed_at ? "Bekreftet" : "Ikke bekreftet"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {linkUserId && (
                <div className="flex items-center gap-2 rounded-lg border bg-primary/5 border-primary/20 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary flex-1">{linkUserSearch}</span>
                  <button onClick={() => { setLinkUserId(""); setLinkUserSearch(""); }}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              )}
            </div>

            {/* Velg kunde */}
            <div className="space-y-2">
              <Label>Kunde</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk på kundenavn…"
                  value={linkTenantSearch}
                  onChange={(e) => { setLinkTenantSearch(e.target.value); setLinkTenantId(""); }}
                  className="pl-9"
                />
              </div>
              {linkTenantSearch && !linkTenantId && (
                <div className="rounded-lg border bg-background shadow-sm divide-y max-h-48 overflow-y-auto">
                  {filteredLinkTenants.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">Ingen treff</p>
                  ) : filteredLinkTenants.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setLinkTenantId(t.id); setLinkTenantSearch(t.name); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 text-left transition-colors"
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{t.slug}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {linkTenantId && (
                <div className="flex items-center gap-2 rounded-lg border bg-primary/5 border-primary/20 px-3 py-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary flex-1">{linkTenantSearch}</span>
                  <button onClick={() => { setLinkTenantId(""); setLinkTenantSearch(""); }}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              )}
            </div>

            {/* Rolle */}
            <div className="space-y-2">
              <Label>Rolle</Label>
              <div className="flex gap-2">
                {(["member", "admin"] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setLinkRole(r)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      linkRole === r
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r === "member" ? "Member" : "Admin"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {linkRole === "admin" ? "Admin kan se alt inkl. admin-panelet" : "Member har tilgang til alt unntatt admin-panelet"}
              </p>
            </div>

            <Button
              onClick={linkUser}
              disabled={linking || !linkTenantId || !linkUserId}
              className="w-full"
              size="lg"
            >
              <Link2 className="mr-2 h-4 w-4" />
              {linking ? "Kobler…" : "Koble bruker til kunde"}
            </Button>
          </div>
        </div>
      )}

      {/* ── TILPASS ── */}
      {tab === "tilpass" && (
        <div className="space-y-4">
          {/* Velg tenant */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-sm font-semibold">Velg kunde å tilpasse</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {tenants.map(t => (
                  <button
                    key={t.id}
                    onClick={() => loadTilpass(t.id)}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      tilpassTenantId === t.id
                        ? "border-primary bg-primary/5 text-primary"
                        : "bg-background hover:bg-muted/50"
                    }`}
                  >
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{t.slug}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Innstillinger */}
          {tilpassTenantId && (
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="border-b px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">
                    Tilpass: {tenants.find(t => t.id === tilpassTenantId)?.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">Vises når deres brukere logger inn</p>
                </div>
                <Button onClick={saveTilpass} disabled={tilpassSaving || tilpassLoading}>
                  {tilpassSaving ? "Lagrer…" : "Lagre"}
                </Button>
              </div>

              {tilpassLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Laster…</div>
              ) : (
                <div className="p-6 space-y-6">

                  {/* Logo */}
                  <div className="space-y-3">
                    <Label>Logo</Label>
                    <div className="flex items-start gap-4">
                      {/* H5: only render logo from Supabase storage to prevent XSS via data: or javascript: URLs */}
                      {tilpassSettings.logo_url && tilpassSettings.logo_url.includes("supabase.co/storage/") ? (
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg border bg-muted/30 p-2 flex items-center justify-center w-24 h-16">
                            <img
                              src={tilpassSettings.logo_url}
                              alt="Logo"
                              className="max-h-12 max-w-20 object-contain"
                            />
                          </div>
                          <button
                            onClick={() => setTilpassSettings(s => ({ ...s, logo_url: "" }))}
                            className="text-xs text-destructive hover:underline"
                          >
                            Fjern logo
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 text-center w-48">
                          <p className="text-xs text-muted-foreground">Ingen logo lastet opp</p>
                        </div>
                      )}
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadLogo(f);
                            e.target.value = "";
                          }}
                        />
                        <Button variant="outline" size="sm" asChild disabled={logoUploading}>
                          <span>
                            <Upload className="mr-2 h-4 w-4" />
                            {logoUploading ? "Laster opp…" : "Last opp logo"}
                          </span>
                        </Button>
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">PNG, SVG eller JPG — helst med gjennomsiktig bakgrunn</p>
                  </div>

                  {/* Firmanavn og tagline */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Firmanavn</Label>
                      <Input
                        value={tilpassSettings.company_name}
                        onChange={(e) => setTilpassSettings(s => ({ ...s, company_name: e.target.value }))}
                        placeholder="T.d. TT Anlegg"
                      />
                      <p className="text-xs text-muted-foreground">Vises i toppen og på PDF-er</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Tagline</Label>
                      <Input
                        value={tilpassSettings.company_tagline}
                        onChange={(e) => setTilpassSettings(s => ({ ...s, company_tagline: e.target.value }))}
                        placeholder="T.d. Anlegg · Maskin · Transport"
                      />
                      <p className="text-xs text-muted-foreground">Undertittel under firmanavnet</p>
                    </div>
                  </div>

                  {/* Primærfarge */}
                  <div className="space-y-3">
                    <Label>Primærfarge</Label>
                    <div className="flex items-center gap-3 flex-wrap">
                      {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setTilpassSettings(s => ({ ...s, primary_color: color }))}
                          className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                            tilpassSettings.primary_color === color
                              ? "border-foreground scale-110"
                              : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                      <div className="flex items-center gap-2 ml-2">
                        <input
                          type="color"
                          value={tilpassSettings.primary_color}
                          onChange={(e) => setTilpassSettings(s => ({ ...s, primary_color: e.target.value }))}
                          className="h-8 w-8 cursor-pointer rounded border"
                          title="Velg egendefinert farge"
                        />
                        <span className="text-xs font-mono text-muted-foreground">
                          {tilpassSettings.primary_color}
                        </span>
                      </div>
                    </div>

                    {/* Forhåndsvisning */}
                    <div className="rounded-lg border p-4 bg-muted/20 space-y-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Forhåndsvisning</p>
                      <div className="flex items-center gap-3">
                        {tilpassSettings.logo_url && tilpassSettings.logo_url.includes("supabase.co/storage/") && (
                          <img src={tilpassSettings.logo_url} alt="" className="h-8 w-auto object-contain" />
                        )}
                        <div>
                          <p className="font-bold text-sm" style={{ color: tilpassSettings.primary_color }}>
                            {tilpassSettings.company_name || "Firmanavn"}
                          </p>
                          {tilpassSettings.company_tagline && (
                            <p className="text-xs text-muted-foreground">{tilpassSettings.company_tagline}</p>
                          )}
                        </div>
                      </div>
                      <button
                        className="rounded px-3 py-1.5 text-sm font-medium text-white"
                        style={{ backgroundColor: tilpassSettings.primary_color }}
                      >
                        Eksempelknapp
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
