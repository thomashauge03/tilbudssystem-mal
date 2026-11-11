// Datalaget til dashbordet: henting, utregning og react-query.
//
// Utregningen ligger i dashboard-utregning.ts uten Supabase, så den kan
// kjøres og etterprøves med node. Her hentes bare rådataene.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alleRader } from "@/lib/alle-rader";
import type { DashboardData } from "@/lib/dashboard-typer";
import {
  UTVALG,
  lagDashboard,
  lokalDato,
  type Raadata,
  type RaaTilbud,
  type RaaEndring,
  type RaaBetaling,
  type RaaFullfort,
} from "@/lib/dashboard-utregning";

export { lagDashboard, type Raadata };

type Svar<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
type Sporring<T> = Svar<T> & {
  order: (kolonne: string) => Sporring<T>;
  range: (fra: number, til: number) => Svar<T>;
};

/**
 * Typene i types.ts er utdaterte (mangler bl.a. customer_signed_at, sent_at,
 * tripletex_status og delpost_fullfort). Kolonnene står i UTVALG, og radene
 * castes til egne typer her, på ett sted.
 */
const les = <T>(tabell: string, select: string) =>
  supabase.from(tabell as never).select(select as never) as unknown as Sporring<T>;

/** Alle rader, i sider på 1000, sortert på id så ingen rad havner på to sider. */
const alle = <T>(tabell: string, select: string) =>
  alleRader<T>((fra, til) => les<T>(tabell, select).order("id").range(fra, til));

/** Poster merket ferdig. Tom liste når tabellen mangler eller ikke kan leses: den bare trekker fra. */
async function hentFerdigePoster(): Promise<RaaFullfort[]> {
  try {
    const { data, error } = await les<RaaFullfort>("delpost_fullfort", UTVALG.delpost_fullfort);
    return error ? [] : (data ?? []);
  } catch {
    return [];
  }
}

/** Betalinger og poster merket ferdig, for å regne «igjen» med samme regel som dashbordet (Status-siden). */
export async function hentBetalingerOgFerdigePoster() {
  const [betalinger, ferdige] = await Promise.all([alle<RaaBetaling>("payments", UTVALG.payments), hentFerdigePoster()]);
  return { betalinger, ferdige };
}

/**
 * Henter alt dashbordet trenger. Ingen tak på antall rader: et tak avkorter
 * kontraktssummen stille. Første feil kastes, slik at en feilet spørring ikke
 * blir vist som 0 kr. Unntaket er delpost_fullfort: den bare trekker fra, og
 * mangler den, er tallene som før merkingen fantes.
 */
export async function hentRaadata(): Promise<Raadata> {
  const fullfort = hentFerdigePoster();

  const innstillinger = (async () => {
    const { data, error } = await les<{ payment_terms: string | null }>("app_settings", UTVALG.app_settings);
    if (error) throw error;
    return data?.[0]?.payment_terms ?? null;
  })();

  const [offers, amendments, payments, delpostFullfort, paymentTerms] = await Promise.all([
    alle<RaaTilbud>("offers", UTVALG.offers),
    alle<RaaEndring>("amendments", UTVALG.amendments),
    alle<RaaBetaling>("payments", UTVALG.payments),
    fullfort,
    innstillinger,
  ]);
  return { offers, amendments, payments, delpostFullfort, paymentTerms };
}

/**
 * Feltene mobil.tsx leste fra den gamle useDashboard. De står ikke i
 * DashboardData, så de regnes ut av den her til mobilsiden er skrevet om.
 */
export type MobilFelt = {
  totalGjenstår: number;
  åpneCount: number;
  amendmentsCount: number;
  amendmentTotalSum: number;
  expiring: { id: string; offer_number: number; title: string; customer_name: string | null; daysLeft: number }[];
};

function mobilFelt(d: DashboardData): MobilFelt {
  return {
    totalGjenstår: d.pengene.igjen,
    åpneCount: d.jobber.filter((j) => j.igjen > 0).length,
    amendmentsCount: d.pengene.antallGodkjenteEndringer,
    amendmentTotalSum: d.pengene.kontraktEndringer,
    expiring: d.tilbudSomVenter
      .filter((t) => t.dagerTilFrist !== null && t.dagerTilFrist >= 0 && t.dagerTilFrist <= 14)
      .map((t) => ({
        id: t.id,
        offer_number: t.nummer,
        title: t.tittel,
        customer_name: t.kunde,
        daysLeft: t.dagerTilFrist!,
      })),
  };
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardData & MobilFelt> => {
      const raa = await hentRaadata();
      const d = lagDashboard(raa, lokalDato(new Date())!);
      return { ...d, ...mobilFelt(d) };
    },
  });
}
