import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nok, fmtDate } from "@/lib/format";
import {
  FileText, TrendingUp, ClipboardEdit, CheckCircle2,
  Clock, AlertTriangle, ArrowRight, CircleDollarSign,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});


function offerTotal(lines: any[], adminCostPct: number) {
  const base = (lines ?? [])
    .filter((l: any) => l.included !== false)
    .reduce((s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0);
  return base + base * (Number(adminCostPct ?? 0) / 100);
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const [offersRes, amendmentsRes, recentRes, expiringRes] = await Promise.all([
        supabase.from("offers").select("id, offer_number, title, customer_name, offer_date, valid_until, invoiced_amount, admin_cost_pct, offer_lines(quantity, unit_price, included)").eq("status", "godkjent").order("offer_number", { ascending: false }).limit(500),
        supabase.from("amendments").select("id, amendment_number, project_ref, notified_date, invoiced_amount, amendment_lines(quantity, unit_price)").limit(500),
        supabase.from("offers").select("id, offer_number, title, customer_name, offer_date, valid_until, invoiced_amount, admin_cost_pct, offer_lines(quantity, unit_price, included)").eq("status", "godkjent").order("created_at", { ascending: false }).limit(6),
        supabase.from("offers").select("id, offer_number, title, customer_name, valid_until, admin_cost_pct, offer_lines(quantity, unit_price, included)").eq("status", "godkjent").gte("valid_until", today).lte("valid_until", soon),
      ]);

      const offers = offersRes.data ?? [];
      const amendments = amendmentsRes.data ?? [];

      // Rekn ut stats for kvart tilbud
      const offerStats = offers.map((o: any) => {
        const total = offerTotal(o.offer_lines, o.admin_cost_pct);
        const inv = Number(o.invoiced_amount ?? 0);
        const expired = o.valid_until < today;
        return { id: o.id, total, inv, expired, pct: total > 0 ? inv / total : 0 };
      });

      const totalKontraktssum = offerStats.reduce((s, o) => s + o.total, 0);
      const totalFakturert = offerStats.reduce((s, o) => s + o.inv, 0);
      const totalGjenstår = totalKontraktssum - totalFakturert;

      const åpne = offerStats.filter((o) => !o.expired && o.pct < 1);
      const utgåtte = offerStats.filter((o) => o.expired && o.inv < o.total);
      const delvisFakturert = offerStats.filter((o) => o.inv > 0 && o.inv < o.total);
      const fullFakturert = offerStats.filter((o) => o.total > 0 && o.inv >= o.total);
      const ikkjeStarta = offerStats.filter((o) => o.inv === 0 && o.total > 0);

      // Amendments
      const amendmentStats = amendments.map((a: any) => {
        const total = (a.amendment_lines ?? []).reduce((s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0);
        return { total, inv: Number(a.invoiced_amount ?? 0) };
      });
      const amendmentTotalSum = amendmentStats.reduce((s, a) => s + a.total, 0);
      const amendmentFakturert = amendmentStats.reduce((s, a) => s + a.inv, 0);

      // Nylige + utgåande
      const recent = (recentRes.data ?? []).map((o: any) => ({
        ...o,
        total: offerTotal(o.offer_lines, o.admin_cost_pct),
        inv: Number(o.invoiced_amount ?? 0),
        expired: o.valid_until < today,
      }));

      const expiring = (expiringRes.data ?? []).map((o: any) => ({
        ...o,
        total: offerTotal(o.offer_lines, o.admin_cost_pct),
        daysLeft: Math.ceil((new Date(o.valid_until).getTime() - Date.now()) / 86400000),
      }));

      return {
        totalKontraktssum,
        totalFakturert,
        totalGjenstår,
        åpneCount: åpne.length,
        utgåtteCount: utgåtte.length,
        delvisFakturertCount: delvisFakturert.length,
        fullFakturertCount: fullFakturert.length,
        ikkjeStartaCount: ikkjeStarta.length,
        totalOffers: offers.length,
        amendmentsCount: amendments.length,
        amendmentTotalSum,
        amendmentFakturert,
        recent,
        expiring,
      };
    },
  });
}

// --- Sub-komponentar ---

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  to,
}: {
  icon: any; label: string; value: string; hint?: string; accent?: string; to?: string;
}) {
  const inner = (
    <div className={`rounded-xl border bg-card p-5 shadow-sm transition-colors ${to ? "hover:bg-accent/30 cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight truncate">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={`rounded-lg p-2.5 flex-shrink-0 ml-3 ${accent ?? "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

const RING_COLORS = {
  fakturert: "#16a34a",
  delvis: "#f59e0b",
  ikkjeStarta: "#e5e7eb",
  utgått: "#ef4444",
};

function DonutChart({
  data,
  label,
  centerVal,
  centerSub,
  valueFormatter = (v) => String(v),
}: {
  data: { name: string; value: number; color: string }[];
  label: string;
  centerVal: string;
  centerSub: string;
  valueFormatter?: (v: number) => string;
}) {
  const filtered = data.filter((d) => d.value > 0);
  return (
    <div className="flex flex-col items-center">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="relative h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filtered.length ? filtered : [{ name: "Tom", value: 1, color: "#e5e7eb" }]}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={72}
              paddingAngle={filtered.length > 1 ? 2 : 0}
              dataKey="value"
              strokeWidth={0}
            >
              {(filtered.length ? filtered : [{ color: "#e5e7eb" }]).map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            {filtered.length > 0 && (
              <Tooltip
                formatter={(v: any, name: string) => [valueFormatter(Number(v)), name]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold leading-tight">{centerVal}</span>
          <span className="text-xs text-muted-foreground">{centerSub}</span>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

function Dashboard() {
  const { data: d, isLoading } = useDashboard();

  const faktureringsRing = d ? [
    { name: "Fullstendig fakturert", value: d.totalFakturert, color: RING_COLORS.fakturert },
    { name: "Delvis / ikkje fakturert", value: d.totalGjenstår, color: RING_COLORS.ikkjeStarta },
  ] : [];

  const tilbudStatusRing = d ? [
    { name: "Fullstendig fakturert", value: d.fullFakturertCount, color: RING_COLORS.fakturert },
    { name: "Delvis fakturert", value: d.delvisFakturertCount, color: RING_COLORS.delvis },
    { name: "Ikkje starta", value: d.ikkjeStartaCount, color: "#94a3b8" },
    { name: "Utgåtte", value: d.utgåtteCount, color: RING_COLORS.utgått },
  ] : [];

  const fakturertPct = d && d.totalKontraktssum > 0
    ? (d.totalFakturert / d.totalKontraktssum) * 100
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Oversikt over tilbud, fakturering og aktivitet</p>
      </div>

      {/* Hovudkort — rad 1 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={CircleDollarSign} label="Total kontraktssum" value={isLoading ? "…" : nok(d?.totalKontraktssum ?? 0)} hint="Alle tilbud" />
        <StatCard icon={CheckCircle2} label="Fakturert" value={isLoading ? "…" : nok(d?.totalFakturert ?? 0)} hint={isLoading ? "" : `${fakturertPct.toFixed(1)} % av total`} accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
        <StatCard icon={TrendingUp} label="Gjenstår" value={isLoading ? "…" : nok(d?.totalGjenstår ?? 0)} hint="Ikkje fakturert enno" accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />
        <StatCard icon={ClipboardEdit} label="Endringsmeldingar" value={isLoading ? "…" : String(d?.amendmentsCount ?? 0)} hint={isLoading ? "" : `${nok(d?.amendmentTotalSum ?? 0)} total`} to="/endringsmeldinger" />
      </div>

      {/* Rad 2: talstatistikk */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Åpne tilbud" value={isLoading ? "…" : String(d?.åpneCount ?? 0)} hint="Innanfor gyldigheitsperiode" to="/tilbud" />
        <StatCard icon={CheckCircle2} label="Fullt fakturert" value={isLoading ? "…" : String(d?.fullFakturertCount ?? 0)} hint="100 % fakturert" accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" to="/status" />
        <StatCard icon={Clock} label="Delvis fakturert" value={isLoading ? "…" : String(d?.delvisFakturertCount ?? 0)} hint="Mellom 1–99 %" accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" to="/status" />
        <StatCard icon={AlertTriangle} label="Utgåtte tilbud" value={isLoading ? "…" : String(d?.utgåtteCount ?? 0)} hint="Utløpt, ikkje fullt fakturert" accent="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" />
      </div>

      {/* Diagram-seksjon */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Faktureringsring */}
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col items-center">
          <DonutChart
            data={faktureringsRing}
            label="Fakturert av total"
            centerVal={isLoading ? "…" : `${fakturertPct.toFixed(0)} %`}
            centerSub="fakturert"
            valueFormatter={(v) => nok(v)}
          />
          <div className="mt-4 w-full space-y-2">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Fakturert</span><span className="font-medium text-emerald-600">{isLoading ? "…" : nok(d?.totalFakturert ?? 0)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Gjenstår</span><span className="font-medium">{isLoading ? "…" : nok(d?.totalGjenstår ?? 0)}</span></div>
          </div>
        </div>

        {/* Tilbud-statusring */}
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col items-center">
          <DonutChart
            data={tilbudStatusRing}
            label="Tilbud etter status"
            centerVal={isLoading ? "…" : String(d?.totalOffers ?? 0)}
            centerSub="tilbud totalt"
            valueFormatter={(v) => `${v} tilbud`}
          />
          <div className="mt-4 w-full space-y-1.5 text-xs">
            {[
              { label: "Fullstendig fakturert", val: d?.fullFakturertCount ?? 0, color: RING_COLORS.fakturert },
              { label: "Delvis fakturert", val: d?.delvisFakturertCount ?? 0, color: RING_COLORS.delvis },
              { label: "Ikkje starta", val: d?.ikkjeStartaCount ?? 0, color: "#94a3b8" },
              { label: "Utgåtte", val: d?.utgåtteCount ?? 0, color: RING_COLORS.utgått },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                  {r.label}
                </span>
                <span className="font-medium">{r.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Utløper snart */}
        <div className="rounded-xl border bg-card shadow-sm flex flex-col">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Utløper snart</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Neste 14 dagar</p>
          </div>
          <div className="flex-1 divide-y overflow-auto">
            {isLoading ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Laster…</p>
            ) : (d?.expiring ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Ingen tilbud utløper snart</p>
            ) : (d?.expiring ?? []).map((o: any) => (
              <Link key={o.id} to="/tilbud/$id" params={{ id: o.id }} className="flex items-center justify-between px-5 py-3 hover:bg-accent/30 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">#{o.offer_number} {o.title}</p>
                  <p className="text-xs text-muted-foreground">{o.customer_name}</p>
                </div>
                <span className={`ml-3 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${o.daysLeft <= 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {o.daysLeft}d
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Siste tilbud */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Siste godkjente tilbud</h2>
          <Link to="/tilbud" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Sjå alle <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="divide-y">
          {isLoading ? (
            <p className="px-6 py-8 text-center text-muted-foreground">Laster…</p>
          ) : (d?.recent ?? []).length === 0 ? (
            <p className="px-6 py-8 text-center text-muted-foreground">
              Ingen godkjente tilbud enno.{" "}
              <Link to="/tilbud" className="text-primary hover:underline">Gå til tilbud og godkjenn</Link>
            </p>
          ) : (d?.recent ?? []).map((o: any) => {
            const pct = o.total > 0 ? (o.inv / o.total) * 100 : 0;
            const barColor = pct >= 100 ? "#16a34a" : pct > 0 ? "#f59e0b" : "#e5e7eb";
            return (
              <Link key={o.id} to="/tilbud/$id" params={{ id: o.id }} className="flex items-center gap-4 px-6 py-3.5 hover:bg-accent/30 transition-colors">
                <div className="w-14 flex-shrink-0 tabular-nums text-sm text-muted-foreground">#{o.offer_number}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{o.title}</p>
                  <p className="text-xs text-muted-foreground">{o.customer_name ?? "—"}</p>
                  <div className="mt-1.5">
                    <ProgressBar pct={pct} color={barColor} />
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-medium">{nok(o.total)}</p>
                  <p className="text-xs text-muted-foreground">{pct.toFixed(0)} % fakturert</p>
                </div>
                {o.expired && (
                  <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">Utgått</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
