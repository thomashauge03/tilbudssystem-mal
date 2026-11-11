// Betalinger på ett tilbud eller én endringsmelding.
//
// Lå tidligere inne i status.tsx. Flyttet hit uendret da Ordre skulle kunne
// fakturere endringsmeldinger, slik at begge sidene bruker den samme koden —
// invoiced_amount er et avledet felt, og to steder som regner det ut hver for
// seg ville før eller siden gitt to ulike svar.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { nok, fmtDate } from "@/lib/format";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Plus, Trash2, Send, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { DelordreDialog } from "@/components/delordre-dialog";
import {
  useTripletexStatus, slettDelordre, synkTripletex, STATUS_TEKST, type Tripletexstatus,
} from "@/lib/tripletex";

const STATUS_STIL: Record<Tripletexstatus, string> = {
  ordre: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  fakturert: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  delvis_betalt: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  betalt: "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
  kreditert: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
};

const getToday = () => new Date().toISOString().slice(0, 10);

// Summen skrives tilbake på tilbudet/endringsmeldingen. Feiler lesingen, ville en
// tom liste blitt tolket som "ingenting betalt" og nullstilt beløpet i basen — så
// her avbrytes det heller før skriving.
export async function syncInvoicedAmount(parentId: string, parentType: "offers" | "amendments") {
  const col = parentType === "offers" ? "offer_id" : "amendment_id";
  const { data, error } = await supabase.from("payments").select("amount, paid").eq(col, parentId);
  if (error) { toast.error(error.message); return false; }
  const invoiced = (data ?? [])
    .filter((p: any) => p.paid)
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const { error: updateError } = await supabase
    .from(parentType)
    .update({ invoiced_amount: invoiced })
    .eq("id", parentId);
  if (updateError) { toast.error(updateError.message); return false; }
  return true;
}

export function PaymentsPanel({
  parentId,
  parentType,
  onSaved,
}: {
  parentId: string;
  parentType: "offers" | "amendments";
  onSaved: () => void;
}) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState<number | "">("");
  const [newDate, setNewDate] = useState(() => getToday());
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [delordreApen, setDelordreApen] = useState(false);
  const [synker, setSynker] = useState(false);
  const { data: tripletex } = useTripletexStatus();
  // Delordre gjelder både tilbud og endringsmeldinger. En endringsmelding som
  // ikke er godkjent, nekter serveren å lage ordre av.
  const kanDelordre = !!tripletex?.tilkoblet;

  const col = parentType === "offers" ? "offer_id" : "amendment_id";

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments", parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq(col, parentId)
        .order("invoice_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["payments", parentId] });
    onSaved();
  };

  const oppdaterFraTripletex = async () => {
    setSynker(true);
    try {
      const r = await synkTripletex({ type: parentType, id: parentId });
      toast.success(r.endret || r.slettet
        ? `Oppdatert fra Tripletex: ${r.endret} endret${r.slettet ? `, ${r.slettet} slettet` : ""}`
        : "Alt stemmer med Tripletex");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSynker(false);
    }
  };

  const togglePaid = async (p: any) => {
    // Betalt-haken på en ordre i Tripletex følger Tripletex, ikke klikk her.
    if (p.tripletex_ordre_id) return;
    const paid = !p.paid;
    const { error } = await supabase
      .from("payments")
      .update({ paid, paid_date: paid ? getToday() : null, paid_at: paid ? new Date().toISOString() : null })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await syncInvoicedAmount(parentId, parentType);
    invalidate();
  };

  const deletePayment = async (id: string) => {
    const rad = (payments ?? []).find((p: any) => p.id === id);
    if (rad?.tripletex_ordre_id) {
      // Ordren slettes i Tripletex først. Nekter Tripletex, blir raden stående.
      try {
        await slettDelordre(id);
      } catch (e) {
        toast.error((e as Error).message);
        setDeleteTarget(null);
        return;
      }
      toast.success(`Ordre ${rad.tripletex_ordre_nr} er slettet i Tripletex`);
      setDeleteTarget(null);
      invalidate();
      return;
    }
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDeleteTarget(null);
    await syncInvoicedAmount(parentId, parentType);
    invalidate();
  };

  const addPayment = async () => {
    if (!newAmount || Number(newAmount) <= 0) { toast.error("Skriv inn beløp"); return; }
    const payload: Record<string, unknown> = {
      [col]: parentId,
      amount: Number(newAmount),
      description: newDesc || null,
      invoice_date: newDate || null,
      paid: false,
      paid_at: null, // M4: don't set paid_at when inserting an unpaid invoice
    };
    const { error } = await supabase.from("payments").insert({ ...payload, tenant_id: tenantId } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Faktura lagt til");
    setNewDesc("");
    setNewAmount("");
    setNewDate(getToday());
    setAdding(false);
    invalidate();
  };

  const paidTotal = (payments ?? []).filter((p: any) => p.paid).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const unpaidTotal = (payments ?? []).filter((p: any) => !p.paid).reduce((s: number, p: any) => s + Number(p.amount), 0);

  return (
    <div className="border-t bg-muted/20 px-6 py-4 space-y-3">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laster…</p>
      ) : (
        <>
          {(payments ?? []).length === 0 && !adding && (
            <p className="text-sm text-muted-foreground italic">Ingen fakturaer registrert ennå.</p>
          )}

          {(payments ?? []).length > 0 && (
            <div className="space-y-1.5">
              {(payments ?? []).map((p: any) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    p.paid
                      ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20"
                      : "bg-card"
                  }`}
                >
                  <button
                    onClick={() => togglePaid(p)}
                    disabled={!!p.tripletex_ordre_id}
                    title={p.tripletex_ordre_id ? "Følger Tripletex: settes når fakturaen er betalt der" : undefined}
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors disabled:cursor-default ${
                      p.paid
                        ? "border-green-500 bg-green-500 text-white"
                        : p.tripletex_ordre_id
                          ? "border-muted-foreground/40"
                          : "border-muted-foreground hover:border-primary"
                    }`}
                  >
                    {p.paid && <Check className="h-3 w-3" />}
                  </button>
                  <span className="w-24 flex-shrink-0 tabular-nums text-xs text-muted-foreground">
                    {p.invoice_date ? fmtDate(p.invoice_date) : "—"}
                  </span>
                  <span className={`flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 ${p.paid || p.tripletex_status === "kreditert" ? "text-muted-foreground" : ""}`}>
                    <span className={p.paid ? "line-through" : ""}>
                      {p.description || <span className="italic text-muted-foreground">Ingen beskrivelse</span>}
                    </span>
                    {p.tripletex_ordre_id && (
                      <>
                        <span className="text-xs text-muted-foreground">
                          Ordre {p.tripletex_ordre_nr}
                          {p.tripletex_faktura_nr ? ` · faktura ${p.tripletex_faktura_nr}` : ""}
                          {p.tripletex_faktura_dato ? ` (${fmtDate(p.tripletex_faktura_dato)})` : ""}
                        </span>
                        {p.tripletex_status && (
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STIL[p.tripletex_status as Tripletexstatus] ?? ""}`}>
                            {STATUS_TEKST[p.tripletex_status as Tripletexstatus] ?? p.tripletex_status}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <span className={`tabular-nums font-semibold ${p.paid ? "text-green-700 dark:text-green-400" : p.tripletex_status === "kreditert" ? "text-muted-foreground line-through" : ""}`}>
                    {nok(Number(p.amount))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    // En ordre som er fakturert i Tripletex, slettes ikke herfra:
                    // fakturaen må krediteres der, og synken tar det med seg.
                    disabled={!!p.tripletex_ordre_id && p.tripletex_status !== "ordre"}
                    title={p.tripletex_ordre_id
                      ? p.tripletex_status === "ordre"
                        ? "Slett ordren her og i Tripletex"
                        : "Fakturert i Tripletex — krediter fakturaen der"
                      : "Slett faktura"}
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex justify-end gap-6 pt-1 text-xs">
                {unpaidTotal > 0 && (
                  <span className="text-muted-foreground">
                    Ubetalt: <span className="font-medium text-foreground">{nok(unpaidTotal)}</span>
                  </span>
                )}
                <span className="text-muted-foreground">
                  Betalt: <span className="font-semibold text-green-700 dark:text-green-400">{nok(paidTotal)}</span>
                </span>
              </div>
            </div>
          )}

          {adding ? (
            <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
              <Input
                placeholder="Fakturabeskrivelse…"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="h-8 flex-1 text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") addPayment(); if (e.key === "Escape") setAdding(false); }}
              />
              <Input
                type="number"
                step="1"
                placeholder="Beløp"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value === "" ? "" : Number(e.target.value))}
                className="h-8 w-32 no-spinner text-right text-sm"
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === "Enter") addPayment(); if (e.key === "Escape") setAdding(false); }}
              />
              <Button size="sm" className="h-8 shrink-0" onClick={addPayment}>Legg til</Button>
              <Button size="sm" variant="ghost" className="h-8 shrink-0" onClick={() => setAdding(false)}>Avbryt</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {kanDelordre && (
                <Button size="sm" className="gap-1.5 h-8" onClick={() => setDelordreApen(true)}>
                  <Send className="h-3.5 w-3.5" /> Ny delordre i Tripletex
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" /> {kanDelordre ? "Før faktura for hånd" : "Legg til faktura"}
              </Button>
              {tripletex?.tilkoblet && (payments ?? []).some((p: any) => p.tripletex_ordre_id) && (
                <Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={oppdaterFraTripletex} disabled={synker}>
                  <RefreshCw className={`h-3.5 w-3.5 ${synker ? "animate-spin" : ""}`} />
                  {synker ? "Oppdaterer…" : "Oppdater fra Tripletex"}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {kanDelordre && (
        <DelordreDialog
          kilde={{ type: parentType, id: parentId }}
          open={delordreApen}
          onOpenChange={setDelordreApen}
          onLaget={invalidate}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.tripletex_ordre_id ? "Slett ordre" : "Slett faktura"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.tripletex_ordre_id ? (
                <>
                  Ordre <strong>{deleteTarget.tripletex_ordre_nr}</strong> på{" "}
                  <strong>{nok(Number(deleteTarget.amount ?? 0))}</strong> slettes både her og i Tripletex.
                  Andelene den tok med, blir åpne igjen. Dette kan ikke angres.
                </>
              ) : (
                <>
                  Er du sikker på at du vil slette fakturaen på{" "}
                  <strong>{nok(Number(deleteTarget?.amount ?? 0))}</strong>
                  {deleteTarget?.description ? <> – {deleteTarget.description}</> : null}? Beløpet
                  trekkes fra det som er registrert som betalt. Dette kan ikke angres.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deletePayment(deleteTarget.id)}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
