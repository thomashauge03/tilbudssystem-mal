import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Users, Building2, RefreshCw, Search, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Tenant = { id: string; name: string; slug: string; created_at: string };
type TenantUser = { id: string; tenant_id: string; user_id: string; role: string };
type AuthUser = { id: string; email: string; confirmed_at: string | null; created_at: string };

function SectionCard({ title, description, icon: Icon, children }: {
  title: string;
  description?: string;
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate({ to: "/" });
  }, [isAdmin, authLoading]);

  if (authLoading || !isAdmin) return null;

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "confirmed" | "unconfirmed">("all");

  // New tenant form
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  // Link user form
  const [linkTenantId, setLinkTenantId] = useState("");
  const [linkUserId, setLinkUserId] = useState("");
  const [linkRole, setLinkRole] = useState("member");
  const [linking, setLinking] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: tu }] = await Promise.all([
      supabase.from("tenants").select("*").order("created_at"),
      supabase.from("tenant_users").select("*"),
    ]);
    setTenants(t ?? []);
    setTenantUsers(tu ?? []);

    const { data: users } = await supabase.rpc("list_auth_users" as never);
    if (users) setAuthUsers(users as AuthUser[]);

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleNameChange = (name: string) => {
    setNewName(name);
    setNewSlug(name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
  };

  const createTenant = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("tenants").insert({ name: newName.trim(), slug: newSlug.trim() });
    setSaving(false);
    if (error) { toast.error("Feil: " + error.message); return; }
    toast.success(`Kunde «${newName}» opprettet!`);
    setNewName(""); setNewSlug("");
    load();
  };

  const deleteTenant = async (id: string, name: string) => {
    if (!confirm(`Slett «${name}»? Dette sletter ALL data for denne tenanten.`)) return;
    const { error } = await supabase.from("tenants").delete().eq("id", id);
    if (error) { toast.error("Feil: " + error.message); return; }
    toast.success(`«${name}» slettet`);
    load();
  };

  const linkUser = async () => {
    if (!linkTenantId || !linkUserId) return;
    setLinking(true);
    const { error } = await supabase.from("tenant_users").insert({
      tenant_id: linkTenantId,
      user_id: linkUserId,
      role: linkRole,
    });
    setLinking(false);
    if (error) { toast.error("Feil: " + error.message); return; }
    const tenant = tenants.find(t => t.id === linkTenantId);
    const user = authUsers.find(u => u.id === linkUserId);
    toast.success(`${user?.email ?? linkUserId} koblet til «${tenant?.name}»!`);
    setLinkUserId(""); setLinkTenantId("");
    load();
  };

  const unlinkUser = async (id: string) => {
    const { error } = await supabase.from("tenant_users").delete().eq("id", id);
    if (error) { toast.error("Feil: " + error.message); return; }
    toast.success("Bruker fjernet");
    load();
  };

  const getTenantUsers = (tenantId: string) =>
    tenantUsers.filter(tu => tu.tenant_id === tenantId);

  const getUserEmail = (userId: string) =>
    authUsers.find(u => u.id === userId)?.email ?? userId.slice(0, 8) + "…";

  const filteredUsers = authUsers.filter(u => {
    const matchSearch = u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchFilter =
      userFilter === "all" ? true :
      userFilter === "confirmed" ? !!u.confirmed_at :
      !u.confirmed_at;
    return matchSearch && matchFilter;
  });

  const confirmedCount = authUsers.filter(u => !!u.confirmed_at).length;
  const unconfirmedCount = authUsers.filter(u => !u.confirmed_at).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Administrer kunder (tenants) og brukertilganger</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Oppdater
        </Button>
      </div>

      {/* Brukeroversikt */}
      <SectionCard title="Brukere" description="Alle registrerte brukere og bekreftelsestatus" icon={Users}>
        {/* Statistikk */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <p className="text-2xl font-bold">{authUsers.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Totalt</p>
          </div>
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{confirmedCount}</p>
            <p className="text-xs text-green-600/70 mt-0.5">Bekreftet</p>
          </div>
          <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{unconfirmedCount}</p>
            <p className="text-xs text-amber-600/70 mt-0.5">Ikke bekreftet</p>
          </div>
        </div>

        {/* Søk og filter */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Søk på e-post…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(["all", "confirmed", "unconfirmed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setUserFilter(f)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  userFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "Alle" : f === "confirmed" ? "Bekreftet" : "Ubekreftet"}
              </button>
            ))}
          </div>
        </div>

        {/* Brukerliste */}
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Ingen brukere funnet</p>
          ) : filteredUsers.map(u => {
            const tenant = tenantUsers.find(tu => tu.user_id === u.id);
            const tenantName = tenant ? tenants.find(t => t.id === tenant.tenant_id)?.name : null;
            return (
              <div key={u.id} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {u.confirmed_at ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.confirmed_at
                        ? `Bekreftet ${new Date(u.confirmed_at).toLocaleDateString("nb-NO")}`
                        : "Venter på e-postbekreftelse"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {tenantName && (
                    <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                      {tenantName}
                    </span>
                  )}
                  {tenant && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tenant.role === "admin"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {tenant.role}
                    </span>
                  )}
                  {!tenantName && (
                    <span className="text-xs text-muted-foreground italic">Ingen kunde</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Opprett tenant */}
      <SectionCard title="Opprett ny kunde" description="Legg til en ny bedrift/tenant i systemet" icon={Building2}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Firmanavn</Label>
            <Input
              placeholder="T.d. TT Anlegg"
              value={newName}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Slug (unik ID)</Label>
            <Input
              placeholder="tt-anlegg"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Genereres automatisk — kan endres</p>
          </div>
        </div>
        <Button className="mt-4" onClick={createTenant} disabled={saving || !newName || !newSlug}>
          <Plus className="mr-2 h-4 w-4" />
          {saving ? "Oppretter…" : "Opprett kunde"}
        </Button>
      </SectionCard>

      {/* Koble bruker til tenant */}
      <SectionCard title="Koble bruker til kunde" description="Gi en bruker tilgang til en tenant" icon={Users}>
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
          <div className="space-y-2">
            <Label>Bruker</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={linkUserId}
              onChange={(e) => setLinkUserId(e.target.value)}
            >
              <option value="">Velg bruker…</option>
              {authUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.email} {!u.confirmed_at ? "⚠️" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Kunde</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={linkTenantId}
              onChange={(e) => setLinkTenantId(e.target.value)}
            >
              <option value="">Velg kunde…</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Rolle</Label>
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={linkRole}
              onChange={(e) => setLinkRole(e.target.value)}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button onClick={linkUser} disabled={linking || !linkTenantId || !linkUserId}>
            <Plus className="mr-1 h-4 w-4" />
            {linking ? "Kobler…" : "Koble"}
          </Button>
        </div>
      </SectionCard>

      {/* Kunder og brukere */}
      <SectionCard title="Kunder og brukere" description="Oversikt over alle tenants og hvem som har tilgang" icon={Building2}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Laster…</p>
        ) : tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen kunder opprettet ennå.</p>
        ) : (
          <div className="space-y-4">
            {tenants.map(tenant => {
              const users = getTenantUsers(tenant.id);
              return (
                <div key={tenant.id} className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-sm">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{tenant.slug}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteTenant(tenant.id, tenant.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {users.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Ingen brukere koblet til ennå</p>
                  ) : (
                    <div className="space-y-1">
                      {users.map(tu => {
                        const authUser = authUsers.find(u => u.id === tu.user_id);
                        return (
                          <div key={tu.id} className="flex items-center justify-between rounded bg-background px-3 py-1.5 text-sm">
                            <div className="flex items-center gap-2">
                              {authUser?.confirmed_at ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <Clock className="h-3.5 w-3.5 text-amber-500" />
                              )}
                              <span>{getUserEmail(tu.user_id)}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                tu.role === "admin"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {tu.role}
                              </span>
                              <button
                                onClick={() => unlinkUser(tu.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="Fjern tilgang"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
