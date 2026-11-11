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
  /** Appens integrasjonsnøkkel er lagt inn. Uten den kan ingen firmaer koble til. */
  integrasjon_klar: boolean;
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

// ─── Delordre ───────────────────────────────────────────────────────────────

/** {offer_line_id: prosent} — hvor stor del av hver post som er tatt med totalt. */
export type Andeler = Record<string, number>;

export type Tripletexstatus = "ordre" | "fakturert" | "delvis_betalt" | "betalt" | "kreditert";

export const STATUS_TEKST: Record<Tripletexstatus, string> = {
  ordre: "Ordre",
  fakturert: "Fakturert",
  delvis_betalt: "Delvis betalt",
  betalt: "Betalt",
  kreditert: "Kreditert",
};

/**
 * Hvor langt hver post er tatt med, etter delordrene som gjelder. Kreditert
 * teller ikke. Tvilling av gjeldendeAndeler i edge functionen — den avgjør,
 * denne viser bare tallene i dialogen.
 */
export function gjeldendeAndeler(
  rader: Array<{ andeler?: unknown; tripletex_status?: string | null }>,
): Andeler {
  const ut: Andeler = {};
  for (const r of rader ?? []) {
    if (r.tripletex_status === "kreditert" || !r.andeler) continue;
    for (const [id, pct] of Object.entries(r.andeler as Andeler)) {
      ut[id] = Math.max(ut[id] ?? 0, Number(pct) || 0);
    }
  }
  return ut;
}

export interface LagetOrdre {
  ordre_id: number;
  ordre_nr: string;
  sum: number;
  vedlegg_feil: string | null;
}

export function lagDelordre(offerId: string, andeler: Andeler, pdf: Blob | null) {
  const form = new FormData();
  form.append("handling", "lag-delordre");
  form.append("offer_id", offerId);
  form.append("andeler", JSON.stringify(andeler));
  if (pdf) form.append("pdf", pdf, "tilbud.pdf");
  return tripletexKall<LagetOrdre>(form);
}

export function slettDelordre(paymentId: string) {
  return tripletexKall<{ slettet: string }>({ handling: "slett-delordre", payment_id: paymentId });
}

export function synkTripletex(offerId?: string) {
  return tripletexKall<{ endret: number; slettet: number }>({
    handling: "synk",
    offer_id: offerId,
  });
}

/** Toasten etter en delordre: sier fra om PDF-en ikke kom med. */
export function delordreTekst(r: LagetOrdre, pdfLaget: boolean): { ok: boolean; tekst: string } {
  const sum = new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(r.sum);
  if (!pdfLaget || r.vedlegg_feil) {
    return {
      ok: false,
      tekst:
        `Ordre ${r.ordre_nr} på ${sum} eks. mva er laget i Tripletex, men PDF-en kom ikke med` +
        (r.vedlegg_feil ? `: ${r.vedlegg_feil}` : ". Legg den ved for hånd."),
    };
  }
  return { ok: true, tekst: `Ordre ${r.ordre_nr} på ${sum} eks. mva er laget i Tripletex` };
}
