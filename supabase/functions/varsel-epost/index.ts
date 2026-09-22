// Sender varsel på e-post når en kunde har signert eller avslått.
//
// Rulles ut med:
//   supabase functions deploy varsel-epost --no-verify-jwt
//
// --no-verify-jwt er nødvendig fordi det er en databasetrigger som ringer, og
// den har ingen Supabase-innlogging. Tilgangen styres i stedet av nøkkelen
// under, på samme måte som sms-inn gjør det.
//
// Triggeren sender bare {type, id, hendelse}. Alt annet slås opp her, slik at
// den som måtte få tak i kallet ikke kan bestemme hva det står i e-posten
// eller hvem den går til.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  byggVarsel,
  splittMottakere,
  summerLinjer,
  type DokumentType,
  type Hendelse,
  type Linje,
} from "./tekst.ts";

function svar(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return svar(405, { error: "Bruk POST" });

  // Samme svar på manglende og feil nøkkel, så endepunktet ikke kan brukes til
  // å finne ut hvilke nøkler som finnes.
  const nokkel = req.headers.get("x-varsel-nokkel") ?? "";
  const fasit = Deno.env.get("VARSEL_NOKKEL") ?? "";
  if (!fasit || nokkel !== fasit) return svar(401, { error: "Ugyldig nøkkel" });

  const { type, id, hendelse } = await req.json().catch(() => ({}));
  if (type !== "offer" && type !== "amendment") return svar(400, { error: "Ukjent type" });
  if (hendelse !== "signert" && hendelse !== "avslaatt") {
    return svar(400, { error: "Ukjent hendelse" });
  }
  if (!id) return svar(400, { error: "Mangler id" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const erTilbud = type === "offer";
  const tabell = erTilbud ? "offers" : "amendments";

  const { data: sak, error: oppslag } = await supabase
    .from(tabell)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (oppslag || !sak) return svar(404, { error: "Fant ikke saken" });

  const { data: innst } = await supabase
    .from("app_settings")
    .select(
      "notify_email, notify_offer_signed, notify_offer_rejected, " +
        "notify_amendment_signed, notify_amendment_rejected",
    )
    .eq("tenant_id", sak.tenant_id)
    .maybeSingle();

  // Feltet kan holde flere adresser i samme firma. Se splittMottakere.
  const mottakere = splittMottakere(innst?.notify_email);

  // Tomt felt betyr at firmaet ikke har slått på varsling. Det er ikke en feil.
  if (!mottakere.length) {
    return svar(200, { ok: true, hoppet_over: "ingen varsel-e-post satt" });
  }

  // Firmaet velger selv hva som er verdt en e-post.
  const flagg = {
    offer: { signert: "notify_offer_signed", avslaatt: "notify_offer_rejected" },
    amendment: {
      signert: "notify_amendment_signed",
      avslaatt: "notify_amendment_rejected",
    },
  }[type as DokumentType][hendelse as Hendelse];

  // Bare et uttrykkelig false stopper varselet. Er kolonnen ikke der — en base
  // som ikke har fått migrasjonen ennå — sender vi heller. Et varsel for mye er
  // til å leve med; et som forsvinner uten spor er ikke det.
  if ((innst as Record<string, unknown> | null)?.[flagg] === false) {
    return svar(200, { ok: true, hoppet_over: `${flagg} er av` });
  }

  // ─── Hvem som svarte ──────────────────────────────────────────────────────
  // Ved avslag ligger navnet på saken. Ved signering gjør det ikke det: der
  // står det på engangslenken som ble brukt, satt av sign_offer.
  let svartAv = String(sak.rejected_by ?? "");
  if (hendelse === "signert") {
    const { data: token } = await supabase
      .from(erTilbud ? "offer_signing_tokens" : "amendment_signing_tokens")
      .select("signer_name")
      .eq(erTilbud ? "offer_id" : "amendment_id", id)
      .not("used_at", "is", null)
      .order("used_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    svartAv = String(token?.signer_name ?? "");
  }

  // ─── Hva det er verdt ─────────────────────────────────────────────────────
  // Ingen ferdig sum ligger i basen; den regnes av linjene, med de samme
  // reglene som resten av systemet. Se kommentaren over summerLinjer.
  const { data: linjer } = await supabase
    .from(erTilbud ? "offer_lines" : "amendment_lines")
    .select("quantity, unit_price, discount_pct, is_heading" + (erTilbud ? ", included" : ""))
    .eq(erTilbud ? "offer_id" : "amendment_id", id);

  const belop = linjer?.length
    ? summerLinjer(linjer as Linje[], erTilbud ? sak.admin_cost_pct : null)
    : null;

  // ─── Hvem kunden er ───────────────────────────────────────────────────────
  // Et krav om endring bærer ikke kundenavnet selv — det henger på tilbudet
  // kravet gjelder. Står kravet alene, faller vi tilbake på adressen det ble
  // sendt til, så emnefeltet ikke ender som «avslått av ».
  let kunde = String(sak.customer_name ?? "");
  if (!erTilbud) {
    if (sak.offer_id) {
      const { data: tilbud } = await supabase
        .from("offers")
        .select("customer_name")
        .eq("id", sak.offer_id)
        .maybeSingle();
      kunde = String(tilbud?.customer_name ?? "");
    }
    if (!kunde) kunde = String(sak.sent_to ?? sak.customer_email ?? "kunden");
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
  const { emne, tekst } = byggVarsel({
    type: type as DokumentType,
    hendelse: hendelse as Hendelse,
    nummer: String((erTilbud ? sak.offer_number : sak.amendment_number) ?? ""),
    tittel: String(sak.title ?? ""),
    kunde,
    svartAv,
    tidspunkt: String(
      (hendelse === "signert" ? sak.customer_signed_at : sak.rejected_at) ??
        new Date().toISOString(),
    ),
    belop,
    begrunnelse: sak.rejected_note ?? null,
    prosjektRef: erTilbud ? null : (sak.project_ref ?? null),
    lenke: `${appUrl}/${erTilbud ? "tilbud" : "endringsmeldinger"}/${id}`,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("VARSEL_FRA") ?? "onboarding@resend.dev",
      to: mottakere,
      subject: emne,
      text: tekst,
    }),
  });

  if (!res.ok) {
    // Logges slik at det er synlig i funksjonsloggen. Triggeren venter ikke på
    // svaret vårt, så dette er eneste stedet feilen blir sett.
    const detalj = await res.text();
    console.error(`Resend avviste varselet (${res.status}): ${detalj}`);
    return svar(502, { error: "Resend avviste varselet", status: res.status });
  }

  return svar(200, { ok: true });
});
