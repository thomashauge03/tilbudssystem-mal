// Appens side av Tripletex-koblingen. Alt går gjennom edge functionen
// `tripletex` — nettleseren ser aldri nøklene, og CSP-en slipper den uansett
// ikke ut til tripletex.no.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TripletexStatus {
  tilkoblet: boolean;
  miljo: "produksjon" | "test";
  sist_hentet_kunder: string | null;
  kan_endre: boolean;
}

/**
 * Kaller funksjonen og gir tilbake svaret, eller kaster med feilmeldingen
 * funksjonen selv skrev. supabase-js pakker et svar som ikke er 2xx inn i en
 * generell «non-2xx status code»; meldingen ligger i selve svaret.
 */
export async function tripletexKall<T = Record<string, unknown>>(
  body: Record<string, unknown> | FormData,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("tripletex", { body });
  if (error) {
    const svar = (error as { context?: Response }).context;
    let melding = error.message;
    try {
      const j = await svar?.json();
      if (j?.error) melding = j.error;
    } catch {
      // Ikke JSON — beholder meldingen fra supabase-js.
    }
    throw new Error(melding);
  }
  return data as T;
}

export function useTripletexStatus() {
  return useQuery({
    queryKey: ["tripletex-status"],
    queryFn: () => tripletexKall<TripletexStatus>({ handling: "status" }),
    // Står funksjonen ikke ute ennå, skal resten av siden virke som før.
    retry: false,
    staleTime: 60_000,
  });
}

export interface KundeHenting {
  i_tripletex: number;
  nye: number;
  koblet: number;
  oppdatert: number;
}

export function hentKunderFraTripletex() {
  return tripletexKall<KundeHenting>({ handling: "hent-kunder" });
}

/** Én setning om hva hentingen gjorde, til en toast. */
export function kundeHentingTekst(r: KundeHenting): string {
  const deler = [
    r.nye && `${r.nye} nye`,
    r.koblet && `${r.koblet} koblet til eksisterende`,
    r.oppdatert && `${r.oppdatert} oppdatert`,
  ].filter(Boolean);
  return `${r.i_tripletex} kunder i Tripletex — ${deler.length ? deler.join(", ") : "alt var likt fra før"}`;
}

export interface SendtOrdre {
  ordre_id: number;
  ordre_nr: string;
  sum: number;
  vedlegg_feil: string | null;
}

export function sendTilbudTilTripletex(offerId: string, pdf: Blob | null, paNytt: boolean) {
  const form = new FormData();
  form.append("handling", "send-tilbud");
  form.append("offer_id", offerId);
  form.append("pa_nytt", String(paNytt));
  if (pdf) form.append("pdf", pdf, "tilbud.pdf");
  return tripletexKall<SendtOrdre>(form);
}
