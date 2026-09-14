import { createFileRoute } from "@tanstack/react-router";
import { AmendmentForm } from "@/components/amendment-form";

// ?offer=<id> settes når man oppretter kravet fra inne i et tilbud, slik at
// tilbudet og prosjektet blir fylt inn automatisk.
//
// ?prosjekt og ?prosjektref er for «Lagre og ny»: en endring kan høre til et
// prosjekt uten at det finnes et tilbud i systemet, og da må konteksten likevel
// følge med til neste melding. Den ligger i adressen og ikke i sessionStorage,
// fordi en mal appen legger igjen et sted, blir liggende der og dukker opp i
// neste krav — også det som skulle handlet om noe helt annet.
//
// Kundens e-post er bevisst ikke med: personopplysninger skal ikke i en URL.
// Er kravet knyttet til et tilbud, hentes den derfra som før.
/**
 * Verdien som tekst.
 *
 * Ruteren tolker en bar tallverdi i adressen som et tall: «?prosjektref=2026118»
 * kommer tilbake som 2026118, ikke som «2026118». En sjekk på `typeof === "string"`
 * alene kastet derfor referansen bort i nettopp det vanligste tilfellet —
 * prosjektnumrene her er rene sifre.
 */
const tekst = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

export const Route = createFileRoute("/endringsmeldinger/ny")({
  validateSearch: (search: Record<string, unknown>): { offer?: string; prosjekt?: string; prosjektref?: string } => ({
    offer: tekst(search.offer),
    prosjekt: tekst(search.prosjekt),
    prosjektref: tekst(search.prosjektref),
  }),
  component: NewAmendment,
});

function NewAmendment() {
  const { offer, prosjekt, prosjektref } = Route.useSearch();
  return <AmendmentForm initialOfferId={offer} initialProjectId={prosjekt} initialProjectRef={prosjektref} />;
}
