import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nok, fmtDate } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useDashboard } from "@/routes/dashboard";
import {
  CircleDollarSign, CheckCircle2, TrendingUp, FileText,
  ClipboardEdit, AlertTriangle, PenLine, FileCheck,
} from "lucide-react";

export const Route = createFileRoute("/mobil")({
  component: MobileDashboard,
});

function sumOf(o: any) {
  const base = (o.offer_lines ?? [])
    .filter((l: any) => l.included !== false)
    .reduce((s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0);
  return base + base * (Number(o.admin_cost_pct ?? 0) / 100);
}

function StatTile({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-1.5 ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
      </div>
      <p className="mt-1.5 text-lg font-bold tracking-tight truncate">{value}</p>
    </div>
  );
}

function MobileDashboard() {
  const { branding } = useAuth();
  const { data: d, isLoading } = useDashboard();

  const { data: offers } = useQuery({
    queryKey: ["mobil-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, offer_number, title, status, customer_name, valid_until, customer_signed_at, contract_signed, admin_cost_pct, offer_lines(quantity, unit_price, included)")
        .order("offer_number", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-[100dvh] bg-background pb-8" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <img
          src={branding?.logo_url || "/logo.png"}
          alt={branding?.company_name || "Dashboard"}
          className="h-7 w-auto"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <span className="text-sm font-bold truncate">{branding?.company_name || "Dashboard"}</span>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-3 py-4">
        {/* Nøkkeltal */}
        <section className="grid grid-cols-2 gap-2.5">
          <StatTile icon={CircleDollarSign} label="Kontraktssum" value={isLoading ? "…" : nok(d?.totalKontraktssum ?? 0)} tone="bg-primary/10 text-primary" />
          <StatTile icon={CheckCircle2} label="Fakturert" value={isLoading ? "…" : nok(d?.totalFakturert ?? 0)} tone="bg-emerald-100 text-emerald-700" />
          <StatTile icon={TrendingUp} label="Gjenstår" value={isLoading ? "…" : nok(d?.totalGjenstår ?? 0)} tone="bg-amber-100 text-amber-700" />
          <StatTile icon={FileText} label="Åpne tilbud" value={isLoading ? "…" : String(d?.åpneCount ?? 0)} tone="bg-blue-100 text-blue-700" />
        </section>

        {/* Endringsmeldingar */}
        <Link to="/endringsmeldinger" className="flex items-center justify-between rounded-xl border bg-card p-3 active:bg-accent/40">
          <span className="flex items-center gap-2">
            <span className="rounded-lg bg-primary/10 p-1.5 text-primary"><ClipboardEdit className="h-4 w-4" /></span>
            <span className="text-sm font-medium">Endringsmeldingar</span>
          </span>
          <span className="text-sm font-semibold">{isLoading ? "…" : `${d?.amendmentsCount ?? 0} · ${nok(d?.amendmentTotalSum ?? 0)}`}</span>
        </Link>

        {/* Utløper snart */}
        <section className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold">Utløper snart</h2>
            <span className="ml-auto text-[11px] text-muted-foreground">Neste 14 dagar</span>
          </div>
          <div className="divide-y">
            {isLoading ? (
              <p className="px-3 py-5 text-center text-xs text-muted-foreground">Laster…</p>
            ) : (d?.expiring ?? []).length === 0 ? (
              <p className="px-3 py-5 text-center text-xs text-muted-foreground">Ingen tilbud utløper snart</p>
            ) : (d?.expiring ?? []).map((o: any) => (
              <Link key={o.id} to="/tilbud/$id" params={{ id: o.id }} className="flex items-center justify-between px-3 py-2.5 active:bg-accent/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">#{o.offer_number} {o.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.customer_name}</p>
                </div>
                <span className={`ml-2 flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${o.daysLeft <= 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {o.daysLeft}d
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Tilbud-liste */}
        <section className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Siste tilbud</h2>
            <Link to="/tilbud" className="ml-auto text-[11px] font-medium text-primary">Sjå alle</Link>
          </div>
          <div className="divide-y">
            {!offers ? (
              <p className="px-3 py-5 text-center text-xs text-muted-foreground">Laster…</p>
            ) : offers.length === 0 ? (
              <p className="px-3 py-5 text-center text-xs text-muted-foreground">Ingen tilbud enno</p>
            ) : offers.map((o: any) => (
              <Link key={o.id} to="/tilbud/$id" params={{ id: o.id }} className="flex items-center gap-2 px-3 py-2.5 active:bg-accent/40">
                <span className="w-12 flex-shrink-0 font-mono text-xs text-muted-foreground">#{o.offer_number}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.customer_name ?? "—"}</p>
                </div>
                {/* Signeringsindikatorar */}
                <span className="flex flex-shrink-0 items-center gap-1" title="Kunde / kontrakt signert">
                  <PenLine className={`h-3.5 w-3.5 ${o.customer_signed_at ? "text-green-600" : "text-muted-foreground/30"}`} />
                  <FileCheck className={`h-3.5 w-3.5 ${o.contract_signed || o.customer_signed_at ? "text-green-600" : "text-muted-foreground/30"}`} />
                </span>
                <span className="flex-shrink-0 text-right text-xs font-semibold">{nok(sumOf(o))}</span>
              </Link>
            ))}
          </div>
        </section>

        <p className="pt-2 text-center text-[11px] text-muted-foreground">
          {fmtDate(new Date().toISOString().slice(0, 10))}
        </p>
      </main>
    </div>
  );
}
