import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus, Trash2, Users, Building2, RefreshCw, Search,
  CheckCircle2, Clock, ChevronLeft, ChevronRight,
  LayoutDashboard, Link2, X,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Tenant = { id: string; name: string; slug: string; created_at: string };
type TenantUser = { id: string; tenant_id: string; user_id: string; role: string };
type AuthUser = { id: string; email: string; confirmed_at: string | null; created_at: string };

const PAGE_SIZE = 15;

function usePagination<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [items.length]);
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

type Tab = "oversikt" | "brukere" | "kunder" | "koble";

function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate({ to: "/" });
  }, [isAdmin, authLoading]);

  if (authLoading || !isAdmin) return null;

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

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: tu }] = await Promise.all([
      supabase.from("tenants").select("*").order("name"),
      supabase.from("tenant_users").select("*"),
    ]);
    setTenants(t ?? []);
    setTenantUsers(tu ?? []);
    const { data: users } = await supabase.rpc("list_auth_users" as never);
    if (users) setAuthUsers(users as AuthUser[]);
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

  const userPagination = usePagination(filteredUsers);
  const tenantPagination = usePagination(filteredTenants);

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
    const { error } = await supabase.from("tenants").insert({ name: newName.trim(), slug: newSlug.trim() });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`«${newName}» opprettet!`);
    setNewName(""); setNewSlug("");
    load();
  };

  const deleteTenant = async (id: string, name: string) => {
    if (!confirm(`Slett «${name}»? Dette sletter ALL data for denne kunden.`)) return;
    const { error } = await supabase.from("tenants").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`«${name}» slettet`);
    load();
  };

  const linkUser = async () => {
    if (!linkTenantId || !linkUserId) return;
    setLinking(true);
    const { error } = await supabase.from("tenant_users").insert({
      tenant_id: linkTenantId, user_id: linkUserId, role: linkRole,
    });
    setLinking(false);
    if (error) { toast.error(error.message); return; }
    const t = tenants.find(t => t.id === linkTenantId);
    const u = authUsers.find(u => u.id === linkUserId);
    toast.success(`${u?.email} koblet til «${t?.name}»`);
    setLinkUserId(""); setLinkTenantId(""); setLinkUserSearch(""); setLinkTenantSearch("");
    load();
  };

  const unlinkUser = async (tuId: string) => {
    const { error } = await supabase.from("tenant_users").delete().eq("id", tuId);
    if (error) { toast.error(error.message); return; }
    toast.success("Tilgang fjernet");
    load();
  };

  const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "oversikt", label: "Oversikt", icon: LayoutDashboard },
    { id: "brukere", label: `Brukere (${authUsers.length})`, icon: Users },
    { id: "kunder", label: `Kunder (${tenants.length})`, icon: Building2 },
    { id: "koble", label: "Koble bruker", icon: Link2 },
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
                          title="Fjern tilgang"
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
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
                          onClick={() => deleteTenant(tenant.id, tenant.name)}
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
    </div>
  );
}
