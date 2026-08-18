import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { nok, fmtDate, offerTotal, isOfferExpired, offerHasDeadline } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, Trash2, PenLine, FileCheck } from "lucide-react";
import { useAppSettings } from "@/hooks/use-app-settings";

const STATUSES = ["utkast", "sendt", "godkjent", "fullført", "avslått"] as const;
type OfferStatus = typeof STATUSES[number];

const STATUS_STYLE: Record<OfferStatus, string> = {
  utkast:   "bg-gray-100 text-gray-700 border-gray-300",
  sendt:    "bg-yellow-100 text-yellow-800 border-yellow-300",
  godkjent: "bg-green-100 text-green-800 border-green-300",
  fullført: "bg-blue-100 text-blue-800 border-blue-300",
  avslått:  "bg-red-100 text-red-700 border-red-300",
};

const STATUS_LABEL: Record<OfferStatus, string> = {
  utkast: "Utkast", sendt: "Sendt", godkjent: "Godkjent", fullført: "Fullført", avslått: "Avslått",
};

function StatusBadge({ status, offerId, onUpdate }: { status: OfferStatus; offerId: string; onUpdate: () => void }) {
  const update = async (next: OfferStatus) => {
    const { error } = await supabase.from("offers").update({ status: next }).eq("id", offerId);
    // Uten dette gikk merkelappen tilbake til gammel status ved neste henting,
    // uten noe tegn til at lagringen feilet
    if (error) { toast.error(error.message); return; }
    onUpdate();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold cursor-pointer transition-colors ${STATUS_STYLE[status] ?? "bg-muted text-muted-foreground"}`}
        >
          {STATUS_LABEL[status] ?? status}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => update(s)} className="cursor-pointer">
            <span className={`mr-2 inline-block h-2 w-2 rounded-full border ${STATUS_STYLE[s]}`} />
            {STATUS_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const Route = createFileRoute("/tilbud/")({
  component: OffersList,
});

function OffersList() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: appSettings } = useAppSettings();
  const signedRefs = new Set(
    (appSettings?.our_refs ?? []).filter((r) => r.signature).map((r) => r.name)
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      setDeleteTarget(null);
    },
    // Uten onError ble dialogen stående åpen uten forklaring når slettingen
    // ble avvist, f.eks. av en fremmednøkkel eller radsikkerhet
    onError: (err: any) => {
      toast.error(err?.message ?? "Kunne ikke slette tilbudet");
      setDeleteTarget(null);
    },
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select(`
          id, offer_number, title, status, valid_until, our_ref, customer_ref, created_at,
          customer_signed_at, contract_signed, admin_cost_pct,
          customers(name),
          offer_lines(quantity, unit_price, discount_pct, included)
        `)
        .order("offer_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []).filter((o: any) => {
    // Et godkjent tilbud er aktivt uansett dato — fristen gjelder bare de andre
    if (filter === "active" && isOfferExpired(o, today)) return false;
    if (filter === "expired" && !isOfferExpired(o, today)) return false;
    if (!q) return true;
    const t = q.toLowerCase();
    const customerName = o.customers?.name ?? "";
    return [o.title, customerName, String(o.offer_number)].some((s) => (s ?? "").toLowerCase().includes(t));
  });

  const sumOf = (o: any) => offerTotal(o.offer_lines, o.admin_cost_pct);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tilbud</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} tilbud</p>
        </div>
        <Button asChild>
          <Link to="/tilbud/ny"><Plus className="mr-2 h-4 w-4" />Nytt tilbud</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Søk på kunde, beskrivelse eller nr…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex rounded-md border bg-card p-1">
          {(["all", "active", "expired"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f === "all" ? "Alle" : f === "active" ? "Aktive" : "Utløpte"}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Kunne ikke hente tilbudene: {(error as Error)?.message ?? "ukjent feil"}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nr.</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Beskrivelse</th>
              <th className="px-4 py-3">Opprettet</th>
              <th className="px-4 py-3">Gyldig t.o.m.</th>
              <th className="px-4 py-3">Vår ref.</th>
              <th className="px-4 py-3 text-center" title="Kunde signert">
                <PenLine className="inline h-3.5 w-3.5" />
              </th>
              <th className="px-4 py-3 text-center" title="Kontrakt signert">
                <FileCheck className="inline h-3.5 w-3.5" />
              </th>
              <th className="px-4 py-3 text-right">Sum eks. mva</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Laster…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Ingen tilbud funnet.</td></tr>
            ) : (
              rows.map((o: any, i: number) => (
                <tr
                  key={o.id}
                  className={`cursor-pointer border-b transition-colors hover:bg-accent/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                  onClick={() => navigate({ to: "/tilbud/$id", params: { id: o.id } })}
                >
                  <td className="px-4 py-3 tabular-nums text-sm text-primary">#{o.offer_number}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={(o.status ?? "utkast") as OfferStatus}
                      offerId={o.id}
                      onUpdate={() => queryClient.invalidateQueries({ queryKey: ["offers"] })}
                    />
                  </td>
                  <td className="px-4 py-3">{o.customers?.name ?? "—"}</td>
                  <td className="px-4 py-3">{o.title}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(o.created_at)}</td>
                  <td className={`px-4 py-3 text-sm ${isOfferExpired(o, today) ? "text-destructive" : "text-muted-foreground"}`}>
                    {!offerHasDeadline(o.status)
                      ? <span className="text-muted-foreground/50" title="Godkjent tilbud har ingen frist">—</span>
                      : o.valid_until ? fmtDate(o.valid_until) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">{o.our_ref ?? "—"}</td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()} title={o.customer_signed_at ? `Signert av kunde` : "Ikke signert av kunde"}>
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${o.customer_signed_at ? "bg-green-500" : "bg-red-400"}`} />
                  </td>
                  {(() => {
                    const autoSigned = !!o.customer_signed_at && signedRefs.has(o.our_ref);
                    const contractGreen = o.contract_signed || autoSigned;
                    return (
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          title={
                            contractGreen
                              ? autoSigned
                                ? "Kontrakt signert (vår referanse + kunde)"
                                : "Kontrakt signert"
                              : "Kontrakt ikke signert — klikk for å endre"
                          }
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { error: updateError } = await supabase.from("offers").update({ contract_signed: !o.contract_signed }).eq("id", o.id);
                            // Uten dette slo prikken tilbake ved neste henting
                            // uten at noen fikk vite at lagringen feilet
                            if (updateError) { toast.error(updateError.message); return; }
                            queryClient.invalidateQueries({ queryKey: ["offers"] });
                          }}
                          className="inline-flex items-center justify-center"
                        >
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${contractGreen ? "bg-green-500" : "bg-red-400"}`} />
                        </button>
                      </td>
                    );
                  })()}
                  <td className="px-4 py-3 text-right font-medium">{nok(sumOf(o))}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: o.id, title: o.title }); }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Slett tilbud"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett tilbud</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette <strong>{deleteTarget?.title}</strong>? Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
