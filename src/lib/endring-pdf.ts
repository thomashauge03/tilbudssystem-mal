// Endringsmeldingens PDF slik kunden får den — samlet ett sted, så skjemaet
// og delordrene på Status-siden legger ved nøyaktig det samme dokumentet.
// Tvillingen for tilbud er tilbud-pdf.ts.

import { openAmendmentPdf } from "@/lib/pdf";
import { supabase } from "@/integrations/supabase/client";
import { endringstyperFra, type Endringstyper } from "@/lib/endringstyper";
import type { AppSettings } from "@/hooks/use-app-settings";

export interface EndringForPdf extends Partial<Endringstyper> {
  amendment_number?: string | null;
  project_ref?: string | null;
  internal_description?: string | null;
  change_description?: string | null;
  reason?: string | null;
  other_notes?: string | null;
  notified_date?: string | null;
  revised_date?: string | null;
  project_manager?: string | null;
  customer_email?: string | null;
  status?: string | null;
  customer_signed_at?: string | null;
  signature_method?: string | null;
}

export interface EndringslinjeForPdf {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_heading?: boolean | null;
}

/** Skriver endringsmeldingen inn i vinduet, slik «Last ned PDF» gjør. */
export function skrivEndringsPdf(
  win: Window | null | undefined,
  e: EndringForPdf,
  linjer: EndringslinjeForPdf[],
  kundeNavn: string,
  kundesignatur: string,
  innst: AppSettings | null | undefined,
) {
  const ref = (innst?.our_refs ?? []).find((r) => r.name === e.project_manager);
  // Endringsmeldingen har ingen adm.påslag, så totalen er summen av linjene.
  const subtotal = linjer
    .filter((l) => !l.is_heading)
    .reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);
  openAmendmentPdf(
    {
      amendment_number: e.amendment_number ?? "",
      project_ref: e.project_ref ?? "",
      internal_description: e.internal_description ?? "",
      change_description: e.change_description ?? "",
      reason: e.reason ?? "",
      other_notes: e.other_notes ?? "",
      notified_date: e.notified_date ?? "",
      revised_date: e.revised_date,
      project_manager: e.project_manager ?? "",
      // Kunden og prosjektlederens adresse skal stå i dokumentet, ikke bare i e-posten
      project_manager_email: ref?.email ?? "",
      customer_name: kundeNavn,
      customer_email: e.customer_email ?? "",
      ...endringstyperFra(e),
      status: e.status ?? undefined,
      customer_signed_at: e.customer_signed_at,
      signature_method: e.signature_method,
      customer_signature: kundesignatur,
    },
    linjer.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity || 0),
      unit: l.unit,
      unit_price: Number(l.unit_price || 0),
      is_heading: !!l.is_heading,
    })),
    { subtotal, total: subtotal },
    {
      company_name: innst?.company_name ?? "",
      company_tagline: innst?.company_tagline ?? "",
      logo_url: innst?.logo_url ?? "",
      company_org_nr: innst?.company_org_nr ?? "",
      vat_pct: innst?.vat_pct ?? 25,
      payment_terms: innst?.payment_terms ?? "30 dager netto",
      ref_phone: ref?.phone ?? "",
      ref_email: ref?.email ?? "",
      ref_position: ref?.position ?? "",
      ref_signature: ref?.signature ?? "",
    },
    win,
  );
}

/**
 * Kundens signaturbilde ligger på tokenet han signerte med, ikke på selve
 * meldingen. Feiler oppslaget, skal PDF-en likevel komme — da står
 * datolinjen alene.
 */
export async function hentKundesignatur(amendmentId: string): Promise<string> {
  const { data } = await supabase
    .from("amendment_signing_tokens")
    .select("signer_signature, used_at")
    .eq("amendment_id", amendmentId)
    .not("used_at", "is", null)
    .order("used_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { signer_signature?: string } | null)?.signer_signature ?? "";
}

/** Henter det PDF-en trenger om en lagret endringsmelding. */
export async function hentEndringForPdf(amendmentId: string) {
  const [e, l] = await Promise.all([
    supabase.from("amendments").select("*, offers(customer_name)").eq("id", amendmentId).single(),
    supabase
      .from("amendment_lines")
      .select("*")
      .eq("amendment_id", amendmentId)
      .order("sort_order"),
  ]);
  if (e.error) throw e.error;
  if (l.error) throw l.error;
  const rad = e.data as EndringForPdf & { offers?: { customer_name?: string | null } | null };
  return {
    endring: rad,
    linjer: (l.data ?? []) as unknown as EndringslinjeForPdf[],
    kundeNavn: rad.offers?.customer_name ?? "",
    kundesignatur: rad.customer_signed_at ? await hentKundesignatur(amendmentId) : "",
  };
}
