// Tilbuds-PDF-en slik kunden får den — samlet ett sted, så tilbudsskjemaet og
// delordrene på Status-siden legger ved nøyaktig det samme dokumentet.

import { openOfferPdf } from "@/lib/pdf";
import { lineNet } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import type { AppSettings } from "@/hooks/use-app-settings";

type Forbehold = string | { title: string; description: string };

export interface TilbudForPdf {
  offer_number?: number;
  title?: string | null;
  offer_date?: string | null;
  valid_until?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  their_ref?: string | null;
  our_ref?: string | null;
  project_number?: string | null;
  offer_text?: string | null;
  admin_cost_pct?: number | null;
  status?: string | null;
  forbehold?: Forbehold[] | null;
}

export interface LinjeForPdf {
  description: string;
  comment?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct?: number | null;
  included: boolean;
  is_heading?: boolean | null;
  ns_code?: string | null;
}

/** Skriver tilbudet inn i vinduet, slik «Last ned PDF» gjør. */
export function skrivTilbudsPdf(
  win: Window,
  tilbud: TilbudForPdf,
  linjer: LinjeForPdf[],
  kunde: { phone?: string | null; address?: string | null } | null | undefined,
  innst: AppSettings | null | undefined,
) {
  const subtotal = linjer.filter((l) => l.included).reduce((s, l) => s + lineNet(l), 0);
  const admin = subtotal * (Number(tilbud.admin_cost_pct || 0) / 100);
  const ref = (innst?.our_refs ?? []).find((r) => r.name === tilbud.our_ref);

  openOfferPdf(
    {
      offer_number: tilbud.offer_number,
      title: tilbud.title ?? "",
      offer_date: tilbud.offer_date ?? "",
      valid_until: tilbud.valid_until ?? "",
      customer_name: tilbud.customer_name ?? "",
      customer_email: tilbud.customer_email ?? "",
      customer_phone: kunde?.phone ?? "",
      customer_address: kunde?.address ?? "",
      their_ref: tilbud.their_ref ?? "",
      our_ref: tilbud.our_ref ?? "",
      project_number: tilbud.project_number ?? "",
      offer_text: tilbud.offer_text ?? "",
      admin_cost_pct: Number(tilbud.admin_cost_pct || 0),
      status: tilbud.status ?? undefined,
    },
    linjer.map((l) => ({
      ...l,
      comment: l.comment ?? "",
      discount_pct: Number(l.discount_pct ?? 0),
      is_heading: !!l.is_heading,
    })),
    { subtotal, admin, total: subtotal + admin },
    {
      company_name: innst?.company_name ?? "",
      company_tagline: innst?.company_tagline ?? "",
      logo_url: innst?.logo_url ?? "",
      company_org_nr: innst?.company_org_nr ?? "",
      payment_terms: innst?.payment_terms ?? "30 dager netto",
      vat_pct: innst?.vat_pct ?? 25,
      ref_phone: ref?.phone ?? "",
      ref_email: ref?.email ?? "",
      ref_position: ref?.position ?? "",
      ref_signature: ref?.signature ?? "",
      closing_page_offset_mm: innst?.closing_page_offset_mm ?? 90,
      forbehold: (tilbud.forbehold ?? []).map((f) =>
        typeof f === "string" ? { title: f, description: "" } : f,
      ),
    },
    win,
  );
}

/** Henter det PDF-en trenger om et lagret tilbud. */
export async function hentTilbudForPdf(offerId: string) {
  const [o, l] = await Promise.all([
    supabase.from("offers").select("*").eq("id", offerId).single(),
    supabase.from("offer_lines").select("*").eq("offer_id", offerId).order("sort_order"),
  ]);
  if (o.error) throw o.error;
  if (l.error) throw l.error;
  const tilbud = o.data as TilbudForPdf & { customer_id?: string | null };
  let kunde: { phone: string | null; address: string | null } | null = null;
  if (tilbud.customer_id) {
    const { data } = await supabase
      .from("customers")
      .select("phone, address")
      .eq("id", tilbud.customer_id)
      .maybeSingle();
    kunde = data;
  }
  return { tilbud, linjer: (l.data ?? []) as unknown as LinjeForPdf[], kunde };
}
