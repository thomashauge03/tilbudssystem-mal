import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Check, Phone, Mail, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAppSettings } from "@/hooks/use-app-settings";

export const Route = createFileRoute("/potensielle-kunder")({
  component: PotensielleKunderPage,
});

const STATUSES = [
  "Forespørsel Mottatt",
  "Under Oppfølging",
  "Tilbud Sendt",
  "Tilbud Avslått",
] as const;

type Status = (typeof STATUSES)[number];

// Rekkjefølgje for sortering — lågast tal kjem øvst
const STATUS_ORDER: Record<Status, number> = {
  "Forespørsel Mottatt": 0,
  "Under Oppfølging":    1,
  "Tilbud Sendt":      2,
  "Tilbud Avslått":      3,
};

interface Lead {
  id: string;
  ansvarlig: string;
  status: Status;
  dato: string | null;
  navn: string;
  adresse: string;
  postnr_sted: string;
  telefon: string;
  mail: string;
  hva: string;
  naar: string;
  merknad: string;
  created_at: string;
  status_changed_at: string | null;
}

// Fargeklassar for statusbadges og teljekorta
const STATUS_BADGE: Record<Status, string> = {
  "Forespørsel Mottatt": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "Under Oppfølging":    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Tilbud Sendt":      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Tilbud Avslått":      "bg-zinc-800 text-zinc-100 dark:bg-zinc-900 dark:text-zinc-300",
};

const STATUS_CARD: Record<Status, string> = {
  "Forespørsel Mottatt": "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
  "Under Oppfølging":    "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30",
  "Tilbud Sendt":      "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30",
  "Tilbud Avslått":      "border-zinc-700 bg-zinc-900 dark:border-zinc-600 dark:bg-zinc-900",
};

const STATUS_CARD_TEXT: Record<Status, string> = {
  "Forespørsel Mottatt": "text-red-700 dark:text-red-400",
  "Under Oppfølging":    "text-yellow-700 dark:text-yellow-400",
  "Tilbud Sendt":      "text-green-700 dark:text-green-400",
  "Tilbud Avslått":      "text-zinc-100",
};

const EMPTY_LEAD: Omit<Lead, "id" | "created_at" | "status_changed_at"> = {
  ansvarlig: "", status: "Forespørsel Mottatt", dato: null,
  navn: "", adresse: "", postnr_sted: "", telefon: "", mail: "",
  hva: "", naar: "", merknad: "",
};

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_BADGE[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function StatusPicker({ lead, onUpdate }: { lead: Lead; onUpdate: (id: string, status: Status) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${STATUS_BADGE[lead.status as Status] ?? "bg-muted text-muted-foreground"}`}>
          {lead.status}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => onUpdate(lead.id, s)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
              s === "Forespørsel Mottatt" ? "bg-red-500"
              : s === "Under Oppfølging" ? "bg-yellow-500"
              : s === "Tilbud Sendt" ? "bg-green-500"
              : "bg-zinc-700"
            }`} />
            {s}
            {s === lead.status && <Check className="h-3 w-3 ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EditRow({ lead, refs, onSave, onCancel }: {
  lead: Partial<Lead>;
  refs: string[];
  onSave: (data: Omit<Lead, "id" | "created_at" | "status_changed_at">) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Omit<Lead, "id" | "created_at" | "status_changed_at">>({
    ...EMPTY_LEAD, ...lead,
  });
  const f = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <tr className="bg-muted/30 border-y-2 border-primary/20">
      <td className="px-2 py-2 min-w-[140px]">
        <Select value={form.ansvarlig || "__none"} onValueChange={(v) => f("ansvarlig", v === "__none" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vel…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— Ikkje tildelt —</SelectItem>
            {refs.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-2 min-w-[160px]">
        <Select value={form.status} onValueChange={(v) => f("status", v as Status)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-2 min-w-[110px]">
        <Input type="date" value={form.dato ?? ""} onChange={(e) => f("dato", e.target.value || null)} className="h-8 text-xs" />
      </td>
      <td className="px-2 py-2 min-w-[160px]">
        <Input value={form.navn} onChange={(e) => f("navn", e.target.value)} placeholder="Kundenavn *" className="h-8 text-xs" />
      </td>
      <td className="px-2 py-2 min-w-[150px]">
        <Input value={form.adresse} onChange={(e) => f("adresse", e.target.value)} placeholder="Adresse" className="h-8 text-xs" />
      </td>
      <td className="px-2 py-2 min-w-[120px]">
        <Input value={form.postnr_sted} onChange={(e) => f("postnr_sted", e.target.value)} placeholder="Postnr/stad" className="h-8 text-xs" />
      </td>
      <td className="px-2 py-2 min-w-[120px]">
        <Input value={form.telefon} onChange={(e) => f("telefon", e.target.value)} placeholder="Telefon" className="h-8 text-xs" />
      </td>
      <td className="px-2 py-2 min-w-[160px]">
        <Input type="email" value={form.mail} onChange={(e) => f("mail", e.target.value)} placeholder="E-post" className="h-8 text-xs" />
      </td>
      <td className="px-2 py-2 min-w-[200px]">
        <Input value={form.hva} onChange={(e) => f("hva", e.target.value)} placeholder="Hva skal gjøres" className="h-8 text-xs" />
      </td>
      <td className="px-2 py-2 min-w-[100px]">
        <Input value={form.naar} onChange={(e) => f("naar", e.target.value)} placeholder="Når" className="h-8 text-xs" />
      </td>
      <td className="px-2 py-2 min-w-[180px]">
        <Input value={form.merknad} onChange={(e) => f("merknad", e.target.value)} placeholder="Merknad" className="h-8 text-xs" />
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onSave(form)}>
            <Check className="h-4 w-4 text-green-600" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancel}>
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

async function upsertCustomer(lead: Omit<Lead, "id" | "created_at" | "status_changed_at">) {
  if (!lead.navn.trim()) return;
  // Sjekk om kunden finst frå før på namn
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("name", lead.navn)
    .maybeSingle();

  const adresse = [lead.adresse, lead.postnr_sted].filter(Boolean).join(", ");
  const notes = lead.hva || null;

  if (existing) {
    // Oppdater med ny info om feltet er tomt
    await supabase.from("customers").update({
      email: lead.mail || null,
      phone: lead.telefon || null,
      address: adresse || null,
      notes: notes,
    }).eq("id", existing.id);
  } else {
    await supabase.from("customers").insert({
      name: lead.navn,
      email: lead.mail || null,
      phone: lead.telefon || null,
      address: adresse || null,
      notes: notes,
    });
  }
}

function PotensielleKunderPage() {
  const qc = useQueryClient();
  const { data: appSettings } = useAppSettings();
  const refs = (appSettings?.our_refs ?? []).map((r) => r.name);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [filterStatus, setFilterStatus] = useState<Status | "Alle">("Alle");
  const [search, setSearch] = useState("");

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["potential-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("potential_customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["potential-customers"] });

  // Slett automatisk "Tilbud Avslått" som er eldre enn 24 timar
  useEffect(() => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("potential_customers")
      .delete()
      .eq("status", "Tilbud Avslått")
      .lt("status_changed_at", cutoff)
      .then(({ error }) => {
        if (!error) refresh();
      });
  }, []); // køyr berre ved sidelast

  const save = async (id: string | "new", data: Omit<Lead, "id" | "created_at" | "status_changed_at">) => {
    if (!data.navn.trim()) { toast.error("Kundenavn er påkrevd"); return; }

    const now = new Date().toISOString();
    const prevLead = leads.find((l) => l.id === id);
    const statusChanged = prevLead?.status !== data.status || id === "new";
    const payload = {
      ...data,
      status_changed_at: statusChanged ? now : undefined,
    };

    if (id === "new") {
      const { error } = await supabase.from("potential_customers").insert({ ...payload, status_changed_at: now });
      if (error) { toast.error(error.message); return; }
      toast.success("Lead lagt til");
    } else {
      const { error } = await supabase.from("potential_customers").update(payload).eq("id", id);
      if (error) { toast.error(error.message); return; }
      toast.success("Lagra");
    }

    // Opprett/oppdater kunden i kunderegister
    await upsertCustomer(data);
    qc.invalidateQueries({ queryKey: ["customers-simple"] });
    qc.invalidateQueries({ queryKey: ["customers"] });

    setEditingId(null);
    refresh();
  };

  const updateStatus = async (id: string, status: Status) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("potential_customers")
      .update({ status, status_changed_at: now })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status: ${status}`);
    refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Slett denne raden?")) return;
    const { error } = await supabase.from("potential_customers").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Sletta");
    refresh();
  };

  // Sorter: etter status-rekkjefølgje, deretter dato (nyaste øvst)
  const sorted = [...leads].sort((a, b) => {
    const sA = STATUS_ORDER[a.status as Status] ?? 99;
    const sB = STATUS_ORDER[b.status as Status] ?? 99;
    if (sA !== sB) return sA - sB;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const filtered = sorted.filter((l) => {
    if (filterStatus !== "Alle" && l.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return [l.navn, l.ansvarlig, l.adresse, l.postnr_sted, l.hva, l.merknad, l.telefon, l.mail]
        .some((v) => v?.toLowerCase().includes(s));
    }
    return true;
  });

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s).length;
    return acc;
  }, {} as Record<Status, number>);

  if (isLoading) return <div className="text-muted-foreground">Laster…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Potensielle kunder</h1>
          <p className="mt-1 text-sm text-muted-foreground">{leads.length} forespørslar totalt</p>
        </div>
        <Button onClick={() => setEditingId("new")}>
          <Plus className="mr-2 h-4 w-4" />Ny forespørsel
        </Button>
      </div>

      {/* Statuskort */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? "Alle" : s)}
            className={`rounded-lg border-2 p-4 text-left transition-all ${
              filterStatus === s
                ? STATUS_CARD[s] + " ring-2 ring-offset-1 ring-current"
                : STATUS_CARD[s]
            }`}
          >
            <div className={`text-3xl font-bold ${STATUS_CARD_TEXT[s]}`}>{counts[s]}</div>
            <div className={`mt-1 text-xs font-medium leading-tight ${STATUS_CARD_TEXT[s]}`}>{s}</div>
          </button>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Søk på navn, adresse, hva…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {(filterStatus !== "Alle" || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("Alle"); setSearch(""); }}>
            <X className="mr-1 h-4 w-4" />Nullstill filter
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} av {leads.length} viser
        </span>
      </div>

      {/* Tabell */}
      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[1200px]">
          <thead className="border-b bg-muted/30">
            <tr>
              {["Ansvarlig","Status","Dato","Kunde","Adresse","Postnr/stad","Telefon","E-post","Hva skal gjøres","Når","Merknad",""].map((h, i) => (
                <th key={i} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {editingId === "new" && (
              <EditRow
                lead={EMPTY_LEAD}
                refs={refs}
                onSave={(data) => save("new", data)}
                onCancel={() => setEditingId(null)}
              />
            )}
            {filtered.length === 0 && editingId !== "new" && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                  Ingen forespørslar. Klikk «Ny forespørsel» for å starte.
                </td>
              </tr>
            )}
            {filtered.map((lead) =>
              editingId === lead.id ? (
                <EditRow
                  key={lead.id}
                  lead={lead}
                  refs={refs}
                  onSave={(data) => save(lead.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <tr key={lead.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{lead.ansvarlig || "—"}</td>
                  <td className="px-3 py-2.5"><StatusPicker lead={lead} onUpdate={updateStatus} /></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {lead.dato ? new Date(lead.dato).toLocaleDateString("nb-NO", { day:"2-digit", month:"short" }) : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{lead.navn || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{lead.adresse || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{lead.postnr_sted || "—"}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {lead.telefon
                      ? <a href={`tel:${lead.telefon}`} className="flex items-center gap-1 text-primary hover:underline"><Phone className="h-3 w-3" />{lead.telefon}</a>
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {lead.mail
                      ? <a href={`mailto:${lead.mail}`} className="flex items-center gap-1 text-primary hover:underline"><Mail className="h-3 w-3" />{lead.mail}</a>
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs max-w-[200px] text-muted-foreground">
                    <span className="line-clamp-2">{lead.hva || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{lead.naar || "—"}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[180px] text-muted-foreground">
                    <span className="line-clamp-2">{lead.merknad || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(lead.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(lead.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        * Tilbud Avslått-rader vert automatisk sletta etter 24 timar.
        Nye kunder vert automatisk lagt til i kunderegister.
      </p>
    </div>
  );
}
