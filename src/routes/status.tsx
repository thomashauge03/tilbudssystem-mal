import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { nok, fmtDate } from "@/lib/format";
import { Check, Search, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

type Filter = "all" | "active" | "partial";

const today = new Date().toISOString().slice(0, 10);

function progressColor(pct: number) {
  if (pct >= 100) return "bg-green-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-primary";
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${progressColor(pct)}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

async function syncInvoicedAmount(parentId: string, parentType: "offers" | "amendments") {
  const col = parentType === "offers" ? "offer_id" : "amendment_id";
  const { data } = await supabase.from("payments").select("amount, paid").eq(col, parentId);
  const invoiced = (data ?? [])
    .filter((p: any) => p.paid)
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  await supabase.from(parentType).update({ invoiced_amount: invoiced }).eq("id", parentId);
}

function PaymentsPanel({
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
  const [newDate, setNewDate] = useState(today);
  const [adding, setAdding] = useState(false);

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
      .update({ paid, paid_date: paid ? today : null })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await syncInvoicedAmount(parentId, parentType);
    invalidate();
  };

  const deletePayment = async (id: string) => {
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
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
    };
    const { error } = await supabase.from("payments").insert({ ...payload, tenant_id: tenantId } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Faktura lagt til");
    setNewDesc("");
    setNewAmount("");
    setNewDate(today);
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
            <p className="text-sm text-muted-foreground italic">Ingen fakturaer registrert enno.</p>
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
                  <span className="w-24 flex-shrink-0 font-mono text-xs text-muted-foreground">
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
                    onClick={() => deletePayment(p.id)}
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
    </div>
  );
}

function StatusPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const { data: offers, isLoading: loadO } = useQuery({
    queryKey: ["status-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, offer_number, title, customer_name, valid_until, project_number, admin_cost_pct, invoiced_amount, offer_lines(quantity, unit_price, included)")
        .eq("status", "godkjent")
        .order("offer_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: amendments, isLoading: loadA } = useQuery({
    queryKey: ["status-amendments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amendments")
        .select("id, amendment_number, project_ref, internal_description, notified_date, invoiced_amount, amendment_lines(quantity, unit_price)")
        .order("amendment_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const offerTotal = (o: any) => {
    const base = (o.offer_lines ?? [])
      .filter((l: any) => l.included !== false)
      .reduce((s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0);
    return base + base * (Number(o.admin_cost_pct ?? 0) / 100);
  };

  const amendmentTotal = (a: any) =>
    (a.amendment_lines ?? []).reduce(
      (s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0),
      0,
    );

  const matchesSearch = (fields: (string | null | undefined)[]) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return fields.some((s) => (s ?? "").toLowerCase().includes(t));
  };

  const filteredOffers = useMemo(
    () =>
      (offers ?? []).filter((o: any) => {
        const total = offerTotal(o);
        const inv = Number(o.invoiced_amount ?? 0);
        if (filter === "active" && o.valid_until < today) return false;
        if (filter === "partial" && (inv === 0 || inv >= total)) return false;
        return matchesSearch([o.title, o.customer_name, String(o.offer_number), o.project_number]);
      }),
    [offers, filter, q, today],
  );

  const filteredAmendments = useMemo(
    () =>
      (amendments ?? []).filter((a: any) => {
        const total = amendmentTotal(a);
        const inv = Number(a.invoiced_amount ?? 0);
        if (filter === "active") return false;
        if (filter === "partial" && (inv === 0 || inv >= total)) return false;
        return matchesSearch([a.amendment_number, a.project_ref, a.internal_description]);
      }),
    [amendments, filter, q],
  );

  const totalSum = useMemo(
    () =>
      (offers ?? []).reduce((s: number, o: any) => s + offerTotal(o), 0) +
      (amendments ?? []).reduce((s: number, a: any) => s + amendmentTotal(a), 0),
    [offers, amendments],
  );

  const totalInvoiced = useMemo(
    () =>
      [...(offers ?? []), ...(amendments ?? [])].reduce(
        (s: number, x: any) => s + Number(x.invoiced_amount ?? 0),
        0,
      ),
    [offers, amendments],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["status-offers"] });
    qc.invalidateQueries({ queryKey: ["status-amendments"] });
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "Alle" },
    { key: "active", label: "Aktive tilbud" },
    { key: "partial", label: "Delvis fakturert" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Oversikt over faktureringsgrad per tilbud og endringsmelding
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Total kontraktssum" value={nok(totalSum)} sub="Eks. mva" />
        <SummaryCard
          label="Fakturert"
          value={nok(totalInvoiced)}
          sub={`${totalSum > 0 ? Math.round((totalInvoiced / totalSum) * 100) : 0} % av total`}
        />
        <SummaryCard label="Gjenstår" value={nok(Math.max(0, totalSum - totalInvoiced))} sub="Eks. mva" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Søk på kunde, prosjektnr, beskrivelse…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tilbud */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Tilbud</h2>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nr.</th>
                <th className="px-4 py-3">Kunde</th>
                <th className="px-4 py-3">Beskrivelse</th>
                <th className="px-4 py-3">Prosjektnr.</th>
                <th className="px-4 py-3">Gyldig t.o.m.</th>
                <th className="px-4 py-3 text-right">Kontraktssum</th>
                <th className="px-4 py-3 text-right">Fakturert</th>
                <th className="px-4 py-3 text-right">Gjenstår</th>
                <th className="w-36 px-4 py-3">Andel</th>
                <th className="w-10 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loadO ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">Laster…</td>
                </tr>
              ) : filteredOffers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">Ingen tilbud.</td>
                </tr>
              ) : (
                filteredOffers.map((o: any, i: number) => {
                  const total = offerTotal(o);
                  const inv = Number(o.invoiced_amount ?? 0);
                  const rem = total - inv;
                  const pct = total > 0 ? (inv / total) * 100 : 0;
                  const isExpanded = expanded.has(o.id);
                  return (
                    <Fragment key={o.id}>
                      <tr className={`border-b ${i % 2 === 1 ? "bg-muted/20" : ""} ${isExpanded ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-3 font-mono">
                          <Link to="/tilbud/$id" params={{ id: o.id }} className="text-primary hover:underline">
                            #{o.offer_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{o.customer_name ?? "—"}</td>
                        <td className="px-4 py-3">{o.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">{o.project_number ?? "—"}</td>
                        <td className={`px-4 py-3 ${o.valid_until < today ? "text-destructive" : "text-muted-foreground"}`}>
                          {fmtDate(o.valid_until)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{nok(total)}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          <span className={inv > 0 ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>
                            {nok(inv)}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${rem < 0 ? "text-destructive" : rem === 0 ? "text-green-600" : ""}`}>
                          {nok(rem)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <ProgressBar pct={pct} />
                            <div className="text-right text-xs text-muted-foreground">{Math.round(pct)} %</div>
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => toggleExpanded(o.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} className="p-0">
                            <PaymentsPanel parentId={o.id} parentType="offers" onSaved={invalidate} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Endringsmeldingar */}
      {filter !== "active" && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Endringsmeldinger</h2>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Nr.</th>
                  <th className="px-4 py-3">Prosjekt</th>
                  <th className="px-4 py-3">Beskrivelse</th>
                  <th className="px-4 py-3">Dato varslet</th>
                  <th className="px-4 py-3 text-right">Prisoverslag</th>
                  <th className="px-4 py-3 text-right">Fakturert</th>
                  <th className="px-4 py-3 text-right">Gjenstår</th>
                  <th className="w-36 px-4 py-3">Andel</th>
                  <th className="w-10 px-2 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loadA ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Laster…</td>
                  </tr>
                ) : filteredAmendments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Ingen endringsmeldinger.</td>
                  </tr>
                ) : (
                  filteredAmendments.map((a: any, i: number) => {
                    const total = amendmentTotal(a);
                    const inv = Number(a.invoiced_amount ?? 0);
                    const rem = total - inv;
                    const pct = total > 0 ? (inv / total) * 100 : 0;
                    const isExpanded = expanded.has(a.id);
                    return (
                      <Fragment key={a.id}>
                        <tr className={`border-b ${i % 2 === 1 ? "bg-muted/20" : ""} ${isExpanded ? "bg-primary/5" : ""}`}>
                          <td className="px-4 py-3 font-mono">
                            <Link to="/endringsmeldinger/$id" params={{ id: a.id }} className="text-primary hover:underline">
                              {a.amendment_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3">{a.project_ref ?? "—"}</td>
                          <td className="px-4 py-3">{a.internal_description ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtDate(a.notified_date)}</td>
                          <td className="px-4 py-3 text-right font-medium">{nok(total)}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            <span className={inv > 0 ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>
                              {nok(inv)}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${rem < 0 ? "text-destructive" : rem === 0 ? "text-green-600" : ""}`}>
                            {nok(rem)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <ProgressBar pct={pct} />
                              <div className="text-right text-xs text-muted-foreground">{Math.round(pct)} %</div>
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              onClick={() => toggleExpanded(a.id)}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="p-0">
                              <PaymentsPanel parentId={a.id} parentType="amendments" onSaved={invalidate} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
