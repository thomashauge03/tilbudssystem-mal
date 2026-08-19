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
import { Check, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

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

  const togglePaid = async (p: any) => {
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
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                      p.paid
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-muted-foreground hover:border-primary"
                    }`}
                  >
                    {p.paid && <Check className="h-3 w-3" />}
                  </button>
                  <span className="w-24 flex-shrink-0 tabular-nums text-xs text-muted-foreground">
                    {p.invoice_date ? fmtDate(p.invoice_date) : "—"}
                  </span>
                  <span className={`flex-1 ${p.paid ? "text-muted-foreground line-through" : ""}`}>
                    {p.description || <span className="italic text-muted-foreground">Ingen beskrivelse</span>}
                  </span>
                  <span className={`tabular-nums font-semibold ${p.paid ? "text-green-700 dark:text-green-400" : ""}`}>
                    {nok(Number(p.amount))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Slett faktura"
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
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Legg til faktura
            </Button>
          )}
        </>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett faktura</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette fakturaen på{" "}
              <strong>{nok(Number(deleteTarget?.amount ?? 0))}</strong>
              {deleteTarget?.description ? <> – {deleteTarget.description}</> : null}? Beløpet
              trekkes fra det som er registrert som betalt. Dette kan ikke angres.
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
