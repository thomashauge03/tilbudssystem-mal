import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/lib/dashboard-typer";
import { BorSjekkes } from "./bor-sjekkes";
import { Byggeplass } from "./byggeplass";
import { Kort, dempet, knappKlasse } from "./felles";
import { datoOverskrift } from "./format";
import { KravSomVenter } from "./krav-som-venter";
import { Kunder } from "./kunder";
import { Maneder } from "./maneder";
import { PengerInn } from "./penger-inn";
import { SisteDager } from "./siste-dager";
import { TilbudSetninger } from "./tilbud-setninger";
import { TilbudSomVenter } from "./tilbud-som-venter";

// Hele dashbordet på én side, uten faner. Rekkefølgen i koden er rekkefølgen
// på mobil (det som må gjøres står høyt). Fra nettbrett og opp flyttes
// «Nye jobber og fakturert» opp ved siden av «Penger inn» med `order`.
//
// Bevegelse: bare det som forklarer tallene, i ren CSS, og aldri i løkke.
// Med redusert bevegelse vises alt ferdig med en kort opasitetsovergang.

const STIL = `
.dashbord {
  --bp-topp: oklch(0.74 0.15 150);
  --bp-venstre: oklch(0.66 0.16 150);
  --bp-hoyre: oklch(0.60 0.15 150);
  --bp-stillas-topp: oklch(0.95 0.004 80 / 0.7);
  --bp-stillas-venstre: oklch(0.90 0.005 80 / 0.6);
  --bp-stillas-hoyre: oklch(0.84 0.006 80 / 0.6);
  --bp-strek: oklch(0.55 0.013 58);
  --bp-tomt: oklch(0.92 0.01 80);
  --bp-tomt-valgt: oklch(0.88 0.016 80);
  --bp-grunn: oklch(0.87 0.008 80);
}
.dark .dashbord {
  --bp-stillas-topp: oklch(0.50 0.005 80 / 0.55);
  --bp-stillas-venstre: oklch(0.42 0.005 80 / 0.55);
  --bp-stillas-hoyre: oklch(0.36 0.005 80 / 0.55);
  --bp-strek: oklch(0.74 0.01 60);
  --bp-tomt: oklch(0.30 0.004 80);
  --bp-tomt-valgt: oklch(0.35 0.006 80);
  --bp-grunn: oklch(0.38 0.005 80);
}
.bp-strek, .bp-strek * { stroke: var(--bp-strek); vector-effect: non-scaling-stroke; }

.db-striper-nye { background: repeating-linear-gradient(45deg, oklch(0.554 0.046 257) 0 4px, oklch(0.80 0.03 257) 4px 8px); }
.db-striper-fakturert { background: repeating-linear-gradient(45deg, oklch(0.627 0.194 149) 0 4px, oklch(0.84 0.13 150) 4px 8px); }
.dark .db-striper-nye { background: repeating-linear-gradient(45deg, oklch(0.704 0.04 257) 0 4px, oklch(0.86 0.02 257) 4px 8px); }
.dark .db-striper-fakturert { background: repeating-linear-gradient(45deg, oklch(0.627 0.194 149) 0 4px, oklch(0.82 0.15 150) 4px 8px); }

.db-inn { animation: db-inn 250ms cubic-bezier(0.2, 0.8, 0.2, 1) both; animation-delay: calc(var(--db-i, 0) * 40ms); }
@keyframes db-inn { from { opacity: 0; transform: translateY(6px); } }

.db-linje { transform-origin: left center; animation: db-skala-x 800ms cubic-bezier(0.2, 0.8, 0.2, 1) 150ms both; }
@keyframes db-skala-x { from { transform: scaleX(0); } }

.db-stolpe { transform-origin: bottom; animation: db-skala-y 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both; animation-delay: calc(var(--db-i, 0) * 40ms); }
@keyframes db-skala-y { from { transform: scaleY(0); } }

.bp-vent .bp-gronn { transform: translateY(var(--bp-h)); }
.bp-synlig .bp-gronn { animation: bp-reis 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.bp-synlig > :nth-child(2) .bp-gronn { animation-delay: 40ms; }
.bp-synlig > :nth-child(3) .bp-gronn { animation-delay: 80ms; }
.bp-synlig > :nth-child(4) .bp-gronn { animation-delay: 120ms; }
.bp-synlig > :nth-child(5) .bp-gronn { animation-delay: 160ms; }
.bp-synlig > :nth-child(6) .bp-gronn { animation-delay: 200ms; }
.bp-synlig > :nth-child(7) .bp-gronn { animation-delay: 240ms; }
.bp-synlig > :nth-child(8) .bp-gronn { animation-delay: 280ms; }
@keyframes bp-reis { from { transform: translateY(var(--bp-h)); } }

.db-ny { position: relative; isolation: isolate; }
.db-ny::before {
  content: ""; position: absolute; inset: -2px -6px; z-index: -1; border-radius: 6px;
  background: oklch(0.87 0.12 150 / 0.7); animation: db-blekne 1.5s ease-out both;
}
.dark .db-ny::before { background: oklch(0.45 0.12 150 / 0.7); }
@keyframes db-blekne { from { opacity: 1; } to { opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .db-inn { animation: db-tone 150ms linear both; }
  .db-linje, .db-stolpe, .bp-synlig .bp-gronn { animation: none; }
  .bp-vent .bp-gronn { transform: none; }
}
@keyframes db-tone { from { opacity: 0; } }

@media print {
  .db-inn, .db-linje, .db-stolpe, .bp-synlig .bp-gronn { animation: none; }
  .bp-vent .bp-gronn { transform: none; }
}
`;

// Plassering i rutenettet. `order` står fra mobil og opp, fordi rad 4–5 ligger
// i to omslag (se Innhold) og kodens rekkefølge derfor ikke er mobilrekkefølgen.
// Mobil: Penger inn, Tilbud som venter, Endringer, Nye jobber, Jobbene, Tilbud,
// Største kunder, Bør sjekkes, Siste 7 dager.
// Nettbrett (md): rad 1 og 2 blir 12 + 12. Desktop (xl): 7 + 5, 6 + 6, 12, og så
// to kolonner som stables: Tilbud + Siste 7 dager [7] og Største kunder + Bør sjekkes [5].
const PLASS = {
  penger: "order-1 md:col-span-12 xl:col-span-7",
  tilbud: "order-2 md:order-3 md:col-span-12 xl:col-span-6",
  krav: "order-3 md:order-4 md:col-span-12 xl:col-span-6",
  maneder: "order-4 md:order-2 md:col-span-12 xl:col-span-5",
  bygg: "order-5 md:col-span-12",
  setninger: "order-6 md:col-span-7",
  kunder: "order-7 md:col-span-5",
  sjekk: "order-8 md:col-span-7",
  siste: "order-9 md:col-span-5",
};

/** Omslag for rad 4–5: usynlig (`contents`) under xl, en kolonne fra xl. */
const KOLONNE_VENSTRE = "contents xl:order-6 xl:col-span-7 xl:flex xl:flex-col xl:gap-6";
const KOLONNE_HOYRE = "contents xl:order-7 xl:col-span-5 xl:flex xl:flex-col xl:gap-6";

const RUTENETT = "grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-x-4 md:gap-y-6";

export type DashboardVisningProps = {
  data: DashboardData | null | undefined;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Dagens dato. Kan settes ved forhåndsvisning med eksempeldata. */
  idag?: Date;
};

export function DashboardVisning({ data, isLoading, error, onRetry, idag }: DashboardVisningProps) {
  const dag = idag ?? new Date();
  return (
    <div className="dashbord space-y-6 tabular-nums">
      <style>{STIL}</style>

      <header>
        <h1 className="text-[28px] font-semibold leading-[34px] tracking-tight">Oversikt</h1>
        <p className={cn("mt-0.5 text-[15px] leading-[22px]", dempet)}>{datoOverskrift(dag)}</p>
      </header>

      {!!error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.12] dark:bg-[oklch(0.25_0.004_80)]"
        >
          <p className="text-base leading-6">Klarte ikke å hente tallene. Prøv igjen.</p>
          {onRetry && (
            <Button variant="outline" className={cn(knappKlasse, "self-start sm:self-auto")} onClick={onRetry}>
              <RefreshCw aria-hidden />
              Prøv igjen
            </Button>
          )}
        </div>
      )}

      {data ? <Innhold d={data} idag={dag} /> : isLoading || !error ? <Skjelett /> : null}
    </div>
  );
}

function Innhold({ d, idag }: { d: DashboardData; idag: Date }) {
  const harSjekk = d.borSjekkes.length > 0;
  return (
    <div className={RUTENETT}>
      <PengerInn pengene={d.pengene} className={PLASS.penger} indeks={0} />
      <TilbudSomVenter tilbud={d.tilbudSomVenter} sum={d.tilbudSomVenterSum} className={PLASS.tilbud} indeks={1} />
      <KravSomVenter
        krav={d.kravSomVenter}
        sum={d.kravSomVenterSum}
        antallOver30Dager={d.antallKravOver30Dager}
        className={PLASS.krav}
        indeks={2}
      />
      <Maneder
        maneder={d.maneder}
        setning={d.manederSetning}
        mindreArbeidIgjen={d.mindreArbeidIgjen}
        className={PLASS.maneder}
        indeks={1}
      />
      <Byggeplass jobber={d.jobber} faser={d.faser} className={PLASS.bygg} indeks={3} />
      <div className={KOLONNE_VENSTRE}>
        <TilbudSetninger
          tilbud={d.tilbud}
          antallGodkjenteEndringer={d.pengene.antallGodkjenteEndringer}
          kontraktEndringer={d.pengene.kontraktEndringer}
          idag={idag}
          className={PLASS.setninger}
          indeks={4}
        />
        {/* Uten «Bør sjekkes» står «Siste 7 dager» alene på nettbrett, og får da full bredde. */}
        <SisteDager
          hendelser={d.siste7Dager}
          idag={idag}
          className={harSjekk ? PLASS.siste : "order-9 md:col-span-12"}
          indeks={5}
        />
      </div>
      <div className={KOLONNE_HOYRE}>
        <Kunder kunder={d.kunder} className={PLASS.kunder} indeks={4} />
        <BorSjekkes punkter={d.borSjekkes} className={PLASS.sjekk} indeks={5} />
      </div>
    </div>
  );
}

// --- Laster: samme form som blokkene -----------------------------------------

/** Rolig, stillestående plassholder (ingen puls). */
function Strek({ className, hoyde }: { className: string; hoyde?: number }) {
  return (
    <Skeleton
      className={cn("animate-none rounded-md bg-foreground/[0.08]", className)}
      style={hoyde ? { height: hoyde } : undefined}
    />
  );
}

function Skjelett() {
  return (
    <div className={RUTENETT} aria-busy="true" aria-label="Henter tallene">
      <Kort className={PLASS.penger}>
        <Strek className="h-5 w-32" />
        <Strek className="mt-5 h-4 w-36" />
        <Strek className="mt-2 h-10 w-64 max-w-full" />
        <Strek className="mt-2 h-4 w-80 max-w-full" />
        <Strek className="mt-6 h-4 w-full rounded-full" />
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Strek key={i} className="h-11" />
          ))}
        </div>
      </Kort>
      <Kort className={PLASS.tilbud}>
        <ListeSkjelett />
      </Kort>
      <Kort className={PLASS.krav}>
        <ListeSkjelett />
      </Kort>
      <Kort className={PLASS.maneder}>
        <Strek className="h-5 w-48" />
        <div className="mt-6 flex h-[148px] items-end gap-2">
          {[40, 70, 100, 60, 90, 25].map((h, i) => (
            <Strek key={i} className="flex-1 rounded-b-none" hoyde={h} />
          ))}
        </div>
        <Strek className="mt-4 h-4 w-3/4" />
      </Kort>
      <Kort className={PLASS.bygg}>
        <Strek className="h-5 w-36" />
        <div className="mt-5 grid grid-cols-4 gap-3 md:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <Strek key={i} className={i % 3 === 0 ? "h-40" : i % 3 === 1 ? "h-32" : "h-24"} />
          ))}
        </div>
      </Kort>
      <Kort className={PLASS.setninger}>
        <Strek className="h-5 w-24" />
        <Strek className="mt-4 h-4 w-full" />
        <Strek className="mt-3 h-4 w-5/6" />
        <Strek className="mt-3 h-4 w-4/6" />
      </Kort>
      <Kort className={PLASS.kunder}>
        <Strek className="h-5 w-36" />
        {Array.from({ length: 5 }, (_, i) => (
          <Strek key={i} className="mt-3 h-9 w-full" />
        ))}
      </Kort>
    </div>
  );
}

function ListeSkjelett() {
  return (
    <>
      <Strek className="h-5 w-56 max-w-full" />
      <Strek className="mt-4 h-8 w-32" />
      <Strek className="mt-2 h-4 w-48" />
      {Array.from({ length: 4 }, (_, i) => (
        <Strek key={i} className="mt-4 h-12 w-full" />
      ))}
    </>
  );
}
