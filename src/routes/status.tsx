import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  nok, fmtDate, compareAmendmentNumber, OFFER_WON_STATUSES, OFFER_COMPLETED,
  offerTotal, amendmentTotal,
} from "@/lib/format";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { PaymentsPanel, syncInvoicedAmount } from "@/components/payments-panel";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

type Filter = "all" | "active" | "partial" | "fullført";

// H3/M7: derive today at call time so it doesn't go stale if the app is open across midnight
const getToday = () => new Date().toISOString().slice(0, 10);

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
      <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}


function StatusPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const today = useMemo(() => getToday(), []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const { data: offers, isLoading: loadO, error: errorO } = useQuery({
    queryKey: ["status-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        // discount_pct og included må være med, ellers regner offerTotal feil i stillhet
        .select("id, offer_number, title, customer_name, status, valid_until, project_number, admin_cost_pct, invoiced_amount, offer_lines(quantity, unit_price, discount_pct, included)")
        .in("status", OFFER_WON_STATUSES)
        .order("offer_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: amendments, isLoading: loadA, error: errorA } = useQuery({
    queryKey: ["status-amendments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amendments")
        .select("id, amendment_number, project_ref, internal_description, notified_date, invoiced_amount, amendment_lines(quantity, unit_price, discount_pct)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Sorteres på klienten: databasen kan bare sortere teksten alfabetisk, og
      // ville lagt "1001-10" foran "1001-2". Nyeste nummer først.
      return (data ?? []).sort((x: any, y: any) =>
        compareAmendmentNumber(y.amendment_number, x.amendment_number)
      );
    },
  });

  const matchesSearch = (fields: (string | null | undefined)[]) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return fields.some((s) => (s ?? "").toLowerCase().includes(t));
  };

  const filteredOffers = useMemo(
    () =>
      (offers ?? []).filter((o: any) => {
        const total = offerTotal(o.offer_lines, o.admin_cost_pct);
        const inv = Number(o.invoiced_amount ?? 0);
        // Alle tilbudene her er godkjente, og da gjelder ikke fristen lenger.
        // "Aktive" betyr derfor: ikke ferdig betalt.
        if (filter === "active" && total > 0 && inv >= total) return false;
        if (filter === "partial" && (inv === 0 || inv >= total)) return false;
        if (filter === "fullført" && o.status !== OFFER_COMPLETED) return false;
        return matchesSearch([o.title, o.customer_name, String(o.offer_number), o.project_number]);
      }),
    [offers, filter, q, today],
  );

  const filteredAmendments = useMemo(
    () =>
      (amendments ?? []).filter((a: any) => {
        const total = amendmentTotal(a.amendment_lines);
        const inv = Number(a.invoiced_amount ?? 0);
        if (filter === "active" || filter === "fullført") return false;
        if (filter === "partial" && (inv === 0 || inv >= total)) return false;
        return matchesSearch([a.amendment_number, a.project_ref, a.internal_description]);
      }),
    [amendments, filter, q],
  );

  // Summene regnes av det som faktisk vises, ikke av hele basen — ellers ville
  // toppen vist ett tall og tabellen under et annet.
  const totalSum = useMemo(
    () =>
      filteredOffers.reduce((s: number, o: any) => s + offerTotal(o.offer_lines, o.admin_cost_pct), 0) +
      filteredAmendments.reduce((s: number, a: any) => s + amendmentTotal(a.amendment_lines), 0),
    [filteredOffers, filteredAmendments],
  );

  const totalInvoiced = useMemo(
    () =>
      [...filteredOffers, ...filteredAmendments].reduce(
        (s: number, x: any) => s + Number(x.invoiced_amount ?? 0),
        0,
      ),
    [filteredOffers, filteredAmendments],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["status-offers"] });
    qc.invalidateQueries({ queryKey: ["status-amendments"] });
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "Alle" },
    { key: "active", label: "Aktive tilbud" },
    { key: "partial", label: "Delvis betalt" },
    { key: "fullført", label: "Fullført" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Oversikt over betalingsgrad per tilbud og endringsmelding
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Total kontraktssum" value={nok(totalSum)} sub="Eks. mva" />
        {/* Tallet summerer bare fakturaer som er huket av som betalt, derfor "Betalt" og ikke "Fakturert" */}
        <SummaryCard
          label="Betalt"
          value={nok(totalInvoiced)}
          sub={`${totalSum > 0 ? Math.round((totalInvoiced / totalSum) * 100) : 0} % av total`}
        />
        <SummaryCard label="Gjenstår" value={nok(Math.max(0, totalSum - totalInvoiced))} sub="Eks. mva" />
      </div>

      {(errorO || errorA) && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Feil: {((errorO ?? errorA) as Error).message}
        </div>
      )}

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
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nr.</th>
                <th className="px-4 py-3">Kunde</th>
                <th className="px-4 py-3">Beskrivelse</th>
                <th className="px-4 py-3">Prosjektnr.</th>
                <th className="px-4 py-3 text-right">Kontraktssum</th>
                <th className="px-4 py-3 text-right">Betalt</th>
                <th className="px-4 py-3 text-right">Gjenstår</th>
                <th className="w-36 px-4 py-3">Andel</th>
                <th className="w-10 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loadO ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Laster…</td>
                </tr>
              ) : filteredOffers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Ingen tilbud.</td>
                </tr>
              ) : (
                filteredOffers.map((o: any, i: number) => {
                  const total = offerTotal(o.offer_lines, o.admin_cost_pct);
                  const inv = Number(o.invoiced_amount ?? 0);
                  const rem = total - inv;
                  const pct = total > 0 ? (inv / total) * 100 : 0;
                  const isExpanded = expanded.has(o.id);
                  return (
                    <Fragment key={o.id}>
                      <tr className={`border-b ${i % 2 === 1 ? "bg-muted/20" : ""} ${isExpanded ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-3 tabular-nums">
                          <Link to="/tilbud/$id" params={{ id: o.id }} className="text-primary hover:underline">
                            #{o.offer_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{o.customer_name ?? "—"}</td>
                        <td className="px-4 py-3">{o.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">{o.project_number ?? "—"}</td>
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
                          <td colSpan={9} className="p-0">
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

      {/* Endringsmeldinger */}
      {filter !== "active" && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Endringsmeldinger</h2>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Nr.</th>
                  <th className="px-4 py-3">Prosjekt</th>
                  <th className="px-4 py-3">Beskrivelse</th>
                  <th className="px-4 py-3">Dato varslet</th>
                  <th className="px-4 py-3 text-right">Prisoverslag</th>
                  <th className="px-4 py-3 text-right">Betalt</th>
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
                    const total = amendmentTotal(a.amendment_lines);
                    const inv = Number(a.invoiced_amount ?? 0);
                    const rem = total - inv;
                    const pct = total > 0 ? (inv / total) * 100 : 0;
                    const isExpanded = expanded.has(a.id);
                    return (
                      <Fragment key={a.id}>
                        <tr className={`border-b ${i % 2 === 1 ? "bg-muted/20" : ""} ${isExpanded ? "bg-primary/5" : ""}`}>
                          <td className="px-4 py-3 tabular-nums">
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
