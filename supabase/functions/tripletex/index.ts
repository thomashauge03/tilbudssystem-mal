// Kobling til Tripletex: delordre fra tilbud og endringsmeldinger, status
// tilbake, og kunderegisteret.
//
// Kalles fra appen med brukerens innlogging (verify_jwt på), og hvert 30.
// minutt av synkjobben i basen. Nøklene til Tripletex forlater aldri denne
// funksjonen: firmaets API-nøkkel ligger i tripletex_oppsett, som bare service
// role kan lese. Tilbud, kunder og betalinger leses og skrives som brukeren, så
// RLS holder hvert firma i sitt eget.
//
// API-nøkkelen er vanligvis Tripletex sin «refresh token» (tlxr_…), som firmaet
// lager selv under Selskap → API-tokens og som alene gir en økt. Den gamle
// innloggingen — employee token pluss en integrasjonsnøkkel (secret
// TRIPLETEX_CONSUMER_TOKEN) — virker fortsatt for den som har den.
//
// Appen lager bare ordre. Den fakturerer aldri og sender aldri noe til
// kunden — det gjør firmaet selv i Tripletex, etter å ha gått gjennom ordren.
//
// Handlinger (feltet «handling»):
//   status          — er firmaet koblet til?
//   lagre           — lagre firmaets API-nøkkel og test den (bare admin)
//   koble-fra       — slett nøkkelen (bare admin)
//   hent-kunder     — hent kundene fra Tripletex inn i appen
//   lag-delordre    — multipart: offer_id eller amendment_id, andeler (JSON), pdf
//   slett-delordre  — payment_id; sletter ordren i Tripletex og raden her
//   synk            — hent status for firmaets ordre (valgfritt offer_id/amendment_id)
//   synk-alle       — synkjobben; x-synk-nokkel i stedet for innlogging

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  delordre,
  andelerPasser,
  gjeldendeAndeler,
  fakturastatus,
  mvaNummer,
  planleggKunder,
  tilTripletexKunde,
  orgnr,
  type Andeler,
  type Tilbudslinje,
  type AppKunde,
  type TripletexKunde,
  type TripletexFaktura,
} from "./mapping.ts";

const BASER = {
  produksjon: "https://tripletex.no/v2",
  test: "https://api-test.tripletex.tech/v2",
} as const;
type Miljo = keyof typeof BASER;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function svar(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** En feil vi vil vise brukeren som den er. */
class Brukerfeil extends Error {
  constructor(
    public status: number,
    melding: string,
  ) {
    super(melding);
  }
}

interface Oppsett {
  tenant_id: string;
  consumer_token: string;
  employee_token: string;
  miljo: Miljo;
  session_token: string | null;
  session_utloper: string | null;
  session_gyldig_til?: string | null;
  sist_hentet_kunder: string | null;
}

/** Tripletex sin nye nøkkel, som gir en økt uten integrasjonsnøkkel. */
const erRefreshToken = (nokkel: string | null | undefined) =>
  (nokkel ?? "").trim().startsWith("tlxr_");

/** Integrasjonsnøkkelen til den gamle innloggingen. Trengs ikke med tlxr_-nøkkel. */
const integrasjonsnokkel = (o: Pick<Oppsett, "consumer_token"> | null) =>
  (o?.consumer_token ?? "").trim() || (Deno.env.get("TRIPLETEX_CONSUMER_TOKEN") ?? "").trim();

/** Har firmaet det som trengs for å logge inn i Tripletex? */
const kanLoggeInn = (o: Oppsett | null) =>
  !!o?.employee_token && (erRefreshToken(o.employee_token) || !!integrasjonsnokkel(o));

/** Datoen i Norge, med et antall dager lagt til, som yyyy-mm-dd. */
function osloDato(pluss = 0, fra = Date.now()): string {
  const d = new Date(fra + pluss * 86_400_000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(d);
}

// ─── Tripletex ──────────────────────────────────────────────────────────────

/** Gjør Tripletex sitt feilsvar om til én lesbar setning. */
async function tripletexFeil(res: Response): Promise<string> {
  const tekst = await res.text();
  try {
    const j = JSON.parse(tekst);
    const felt = (j.validationMessages ?? [])
      .map((v: { field?: string; message?: string }) =>
        [v.field, v.message].filter(Boolean).join(": "),
      )
      .filter(Boolean);
    return [j.message, ...felt].filter(Boolean).join(" — ") || `HTTP ${res.status}`;
  } catch {
    return tekst.slice(0, 300) || `HTTP ${res.status}`;
  }
}

class Tripletex {
  private token: string | null;

  constructor(
    private admin: SupabaseClient,
    private oppsett: Oppsett,
  ) {
    // En lagret øktnøkkel brukes så lenge den har god tid igjen: en økt fra
    // refresh token minst ti minutter, en fra den gamle innloggingen minst ett
    // døgn.
    const gyldig = oppsett.session_gyldig_til
      ? Date.parse(oppsett.session_gyldig_til) > Date.now() + 10 * 60_000
      : !!oppsett.session_utloper && oppsett.session_utloper > osloDato(0);
    this.token = gyldig ? oppsett.session_token : null;
  }

  get base() {
    return BASER[this.oppsett.miljo] ?? BASER.produksjon;
  }

  /** Lager en ny øktnøkkel fra firmaets nøkkel, og tar vare på den. */
  private async nyOkt(): Promise<string> {
    if (erRefreshToken(this.oppsett.employee_token)) return this.oktFraRefreshToken();

    const consumer = integrasjonsnokkel(this.oppsett);
    if (!consumer) {
      throw new Brukerfeil(500, "Appens integrasjonsnøkkel for Tripletex er ikke lagt inn ennå");
    }
    const utloper = osloDato(2);
    const q = new URLSearchParams({
      consumerToken: consumer,
      employeeToken: this.oppsett.employee_token,
      expirationDate: utloper,
    });
    const res = await fetch(`${this.base}/token/session/:create?${q}`, { method: "PUT" });
    if (!res.ok) {
      throw new Brukerfeil(
        502,
        `Tripletex godtok ikke API-nøkkelen (${await tripletexFeil(res)}). ` +
          "Sjekk at nøkkelen er riktig og hører til valgt miljø.",
      );
    }
    const token = String((await res.json())?.value?.token ?? "");
    if (!token) throw new Brukerfeil(502, "Tripletex ga ingen øktnøkkel tilbake");
    this.token = token;
    await this.admin
      .from("tripletex_oppsett")
      .update({ session_token: token, session_utloper: utloper, session_gyldig_til: null })
      .eq("tenant_id", this.oppsett.tenant_id);
    return token;
  }

  /** Økt på 8 timer — det lengste Tripletex gir — fra en tlxr_-nøkkel. */
  private async oktFraRefreshToken(): Promise<string> {
    const ttl = 8 * 3600;
    const res = await fetch(`${this.base}/token/session/:createFromRefreshToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken: this.oppsett.employee_token.trim(), ttlSeconds: ttl }),
    });
    if (!res.ok) {
      throw new Brukerfeil(
        502,
        `Tripletex godtok ikke API-nøkkelen (${await tripletexFeil(res)}). ` +
          "Sjekk at nøkkelen er riktig, ikke er utløpt, og hører til valgt miljø.",
      );
    }
    const token = String((await res.json())?.value?.token ?? "");
    if (!token) throw new Brukerfeil(502, "Tripletex ga ingen øktnøkkel tilbake");
    this.token = token;
    await this.admin
      .from("tripletex_oppsett")
      .update({
        session_token: token,
        session_utloper: null,
        session_gyldig_til: new Date(Date.now() + ttl * 1000).toISOString(),
      })
      .eq("tenant_id", this.oppsett.tenant_id);
    return token;
  }

  /**
   * @param valg.ingen404 Gi null i stedet for feil når objektet ikke finnes —
   *   slik oppdager synken en ordre som er slettet i Tripletex.
   */
  async kall(
    metode: string,
    sti: string,
    valg: {
      query?: Record<string, string | number | boolean>;
      json?: unknown;
      form?: FormData;
      ingen404?: boolean;
    } = {},
  ): Promise<any> {
    const url = new URL(this.base + sti);
    for (const [k, v] of Object.entries(valg.query ?? {})) url.searchParams.set(k, String(v));

    // Én ny runde med fersk øktnøkkel hvis den lagrede er gått ut eller er
    // trukket tilbake i Tripletex.
    for (let forsok = 0; forsok < 2; forsok++) {
      const token = this.token ?? (await this.nyOkt());
      const headers: Record<string, string> = {
        Authorization: "Basic " + btoa(`0:${token}`),
        Accept: "application/json",
      };
      let body: BodyInit | undefined;
      if (valg.json !== undefined) {
        headers["Content-Type"] = "application/json; charset=utf-8";
        body = JSON.stringify(valg.json);
      } else if (valg.form) {
        body = valg.form;
      }
      const res = await fetch(url, { method: metode, headers, body });
      if (res.status === 401 && forsok === 0) {
        this.token = null;
        continue;
      }
      if (res.status === 404 && valg.ingen404) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) {
        throw new Brukerfeil(502, `Tripletex sa nei: ${await tripletexFeil(res)}`);
      }
      const tekst = await res.text();
      return tekst ? JSON.parse(tekst) : {};
    }
  }

  /** Alle sider av en liste. Tripletex gir maks 1000 om gangen. */
  async alle(sti: string, query: Record<string, string | number | boolean>): Promise<any[]> {
    const ut: any[] = [];
    for (let fra = 0; ; fra += 1000) {
      const side = await this.kall("GET", sti, { query: { ...query, from: fra, count: 1000 } });
      const verdier = side?.values ?? [];
      ut.push(...verdier);
      if (verdier.length < 1000) return ut;
    }
  }
}

// ─── Kunder ─────────────────────────────────────────────────────────────────

const KUNDEFELT =
  "id,name,organizationNumber,email,invoiceEmail,phoneNumber,phoneNumberMobile," +
  "postalAddress(addressLine1,addressLine2,postalCode,city)," +
  "physicalAddress(addressLine1,addressLine2,postalCode,city)";

async function hentKunder(
  tx: Tripletex,
  bruker: SupabaseClient,
  admin: SupabaseClient,
  tenantId: string,
) {
  const fraTripletex = (await tx.alle("/customer", {
    isInactive: false,
    fields: KUNDEFELT,
  })) as TripletexKunde[];

  // Alle kundene, i sider på 1000: Supabase kutter stille ved 1000 rader, og
  // da ville resten sett ut som nye og blitt forsøkt lagt inn på nytt.
  const iAppen: AppKunde[] = [];
  for (let fra = 0; ; fra += 1000) {
    const { data, error } = await bruker
      .from("customers")
      .select("id, name, org_number, email, phone, address, tripletex_id")
      .order("id")
      .range(fra, fra + 999);
    if (error) throw new Brukerfeil(500, error.message);
    iAppen.push(...((data ?? []) as AppKunde[]));
    if ((data ?? []).length < 1000) break;
  }

  const plan = planleggKunder(fraTripletex, iAppen);
  const forrigeNavn = new Map(iAppen.map((k) => [k.id, k.name]));

  const nye = plan.filter((v) => v.type === "ny");
  if (nye.length) {
    const { error: e } = await bruker
      .from("customers")
      .insert(nye.map((v) => ({ ...v.felt, tripletex_id: v.tripletexId, tenant_id: tenantId })));
    if (e) throw new Brukerfeil(500, `Kunne ikke legge inn nye kunder: ${e.message}`);
  }

  let koblet = 0;
  let oppdatert = 0;
  for (const v of plan) {
    if (v.type !== "oppdater") continue;
    const endring: Record<string, unknown> = { ...v.felt };
    if (v.kobles) endring.tripletex_id = v.tripletexId;
    const { error: e } = await bruker.from("customers").update(endring).eq("id", v.id);
    if (e) throw new Brukerfeil(500, `Kunne ikke oppdatere ${forrigeNavn.get(v.id)}: ${e.message}`);
    if (v.kobles) koblet++;
    else oppdatert++;

    // Tilbudene har en kopi av kundenavnet, slik kundesiden også passer på.
    if (v.felt.name && v.felt.name !== forrigeNavn.get(v.id)) {
      await bruker.from("offers").update({ customer_name: v.felt.name }).eq("customer_id", v.id);
    }
  }

  await admin
    .from("tripletex_oppsett")
    .update({ sist_hentet_kunder: new Date().toISOString() })
    .eq("tenant_id", tenantId);

  return { i_tripletex: fraTripletex.length, nye: nye.length, koblet, oppdatert };
}

/** Kunden i Tripletex for en kunde i appen — finnes den ikke, lages den. */
async function tripletexKunde(
  tx: Tripletex,
  bruker: SupabaseClient,
  kunde: AppKunde,
): Promise<number> {
  if (kunde.tripletex_id) return Number(kunde.tripletex_id);

  // Finnes firmaet alt i Tripletex, kobles det heller enn å lage en kopi.
  let id: number | null = null;
  const org = orgnr(kunde.org_number);
  if (org) {
    const treff = await tx.kall("GET", "/customer", {
      query: { organizationNumber: org, fields: "id", count: 1 },
    });
    id = treff?.values?.[0]?.id ?? null;
  }
  if (!id) {
    const ny = await tx.kall("POST", "/customer", { json: tilTripletexKunde(kunde) });
    id = Number(ny?.value?.id);
  }
  await bruker.from("customers").update({ tripletex_id: id }).eq("id", kunde.id);
  return id!;
}

/**
 * Prosjektet i Tripletex for tilbudets prosjekt, funnet på prosjektnummeret.
 *
 * Prosjektnumrene i appen er de samme som i Tripletex (2026118 osv.), så
 * nummeret er nok. Uten nummer, eller uten treff, blir ordren uten prosjekt —
 * appen lager aldri prosjekter i Tripletex selv.
 */
async function tripletexProsjekt(
  tx: Tripletex,
  bruker: SupabaseClient,
  tilbud: { project_number?: string | null; project_id?: string | null },
): Promise<{ id: number; number: string; name: string } | null> {
  let nummer = String(tilbud.project_number ?? "").trim();
  if (!nummer && tilbud.project_id) {
    const { data } = await bruker
      .from("projects")
      .select("project_number")
      .eq("id", tilbud.project_id)
      .maybeSingle();
    nummer = String(data?.project_number ?? "").trim();
  }
  if (!nummer) return null;
  const treff = await tx.kall("GET", "/project", {
    query: { number: nummer, fields: "id,number,name", count: 5 },
  });
  const p = (treff?.values ?? []).find((x: { number?: string }) => String(x.number) === nummer);
  return p ? { id: Number(p.id), number: String(p.number), name: String(p.name ?? "") } : null;
}

/** Id-en til mva-koden for firmaets sats. */
async function mvaTypeId(tx: Tripletex, sats: number): Promise<number> {
  const typer = (await tx.alle("/ledger/vatType", { fields: "id,number,percentage" })) as Array<{
    id: number;
    number: string;
    percentage: number;
  }>;
  const nummer = mvaNummer(sats);
  const valgt =
    typer.find((t) => nummer && t.number === nummer) ??
    typer
      .filter((t) => Number(t.percentage) === sats)
      .sort((a, b) => Number(a.number) - Number(b.number))[0];
  if (!valgt) throw new Brukerfeil(502, `Fant ingen mva-kode med ${sats} % i Tripletex`);
  return valgt.id;
}

// ─── Betalt-summen ──────────────────────────────────────────────────────────

/**
 * Skriver summen av betalte rader tilbake på tilbudet eller endringen.
 * Tvilling av syncInvoicedAmount i src/components/payments-panel.tsx.
 */
async function oppdaterBetalt(
  db: SupabaseClient,
  rad: { offer_id?: string | null; amendment_id?: string | null },
) {
  const [kol, tabell, id] = rad.offer_id
    ? ["offer_id", "offers", rad.offer_id]
    : ["amendment_id", "amendments", rad.amendment_id];
  if (!id) return;
  const { data, error } = await db.from("payments").select("amount, paid").eq(kol, id);
  if (error) return; // Heller la summen stå enn å nullstille den på en lesefeil.
  const betalt = (data ?? []).filter((p) => p.paid).reduce((s, p) => s + Number(p.amount), 0);
  await db.from(tabell).update({ invoiced_amount: betalt }).eq("id", id);
}

// ─── Delordre ───────────────────────────────────────────────────────────────

/** Det en delordre lages av: et tilbud eller en endringsmelding. */
type Kilde = { type: "offer" | "amendment"; id: string };

interface Grunnlag {
  linjer: Array<Tilbudslinje & { id: string }>;
  adminPct: number;
  kundeId: string | null;
  prosjekt: { project_number?: string | null; project_id?: string | null };
  deresRef: string;
  /** «iht. tilbud nr. 1050 – Graving Storgata» */
  hva: string;
  pdfNavn: string;
  /** Kolonnen i payments og delpost_fullfort. */
  kol: "offer_id" | "amendment_id";
  /** Ord til feilmeldingene: «tilbudet» / «endringsmeldingen». */
  ord: string;
}

/**
 * Leser det delordren trenger, likt for tilbud og endringsmeldinger.
 *
 * En endringsmelding har ingen kunde og ofte ikke prosjektnummer selv — de
 * står på tilbudet den hører til. Den har heller ikke adm.påslag, og må være
 * godkjent av kunden: et krav kunden ikke har sagt ja til, skal ikke faktureres.
 */
async function hentGrunnlag(bruker: SupabaseClient, kilde: Kilde): Promise<Grunnlag> {
  if (kilde.type === "offer") {
    const { data: t, error } = await bruker
      .from("offers")
      .select("*, offer_lines(*)")
      .eq("id", kilde.id)
      .maybeSingle();
    if (error) throw new Brukerfeil(500, error.message);
    if (!t) throw new Brukerfeil(404, "Fant ikke tilbudet");
    const tittel = String(t.title ?? "").trim();
    return {
      linjer: t.offer_lines ?? [],
      adminPct: Number(t.admin_cost_pct ?? 0),
      kundeId: t.customer_id,
      prosjekt: { project_number: t.project_number, project_id: t.project_id },
      deresRef: String(t.their_ref ?? "").trim(),
      hva: `iht. tilbud nr. ${t.offer_number}` + (tittel ? ` – ${tittel}` : ""),
      pdfNavn: `Tilbud ${t.offer_number}.pdf`,
      kol: "offer_id",
      ord: "tilbudet",
    };
  }

  const { data: e, error } = await bruker
    .from("amendments")
    .select("*, amendment_lines(*)")
    .eq("id", kilde.id)
    .maybeSingle();
  if (error) throw new Brukerfeil(500, error.message);
  if (!e) throw new Brukerfeil(404, "Fant ikke endringsmeldingen");
  if (!e.customer_signed_at && e.status !== "endringsmelding") {
    throw new Brukerfeil(
      400,
      "Endringsmeldingen er ikke godkjent av kunden ennå, og kan ikke faktureres",
    );
  }
  let tilbud: Record<string, unknown> | null = null;
  if (e.offer_id) {
    const { data } = await bruker
      .from("offers")
      .select("offer_number, customer_id, project_number, project_id, their_ref")
      .eq("id", e.offer_id)
      .maybeSingle();
    tilbud = data;
  }
  const tittel = String(e.title ?? e.internal_description ?? "").trim();
  return {
    linjer: e.amendment_lines ?? [],
    adminPct: 0,
    kundeId: (tilbud?.customer_id as string) ?? null,
    // project_ref er prosjektnummeret («2026165»); ellers tilbudets.
    prosjekt: {
      project_number:
        String(e.project_ref ?? "").trim() || (tilbud?.project_number as string) || null,
      project_id: e.project_id ?? (tilbud?.project_id as string) ?? null,
    },
    deresRef: String(tilbud?.their_ref ?? "").trim(),
    hva:
      `iht. endringsmelding nr. ${e.amendment_number}` +
      (tilbud ? ` (tilbud nr. ${tilbud.offer_number})` : "") +
      (tittel ? ` – ${tittel}` : ""),
    pdfNavn: `Endringsmelding ${e.amendment_number}.pdf`,
    kol: "amendment_id",
    ord: "endringsmeldingen",
  };
}

async function lagDelordre(
  tx: Tripletex,
  bruker: SupabaseClient,
  tenantId: string,
  kilde: Kilde,
  nye: Andeler,
  pdf: File | null,
) {
  const g = await hentGrunnlag(bruker, kilde);
  if (!g.kundeId) {
    throw new Brukerfeil(
      400,
      kilde.type === "offer"
        ? "Tilbudet har ingen kunde"
        : "Endringsmeldingen er ikke koblet til et tilbud med kunde",
    );
  }

  // Andelene leses rett før ordren lages, så det som alt er sendt — også fra
  // en annen fane eller en kollega — aldri tas med to ganger.
  const { data: rader, error: radfeil } = await bruker
    .from("payments")
    .select("andeler, tripletex_status, tripletex_ordre_id")
    .eq(g.kol, kilde.id);
  if (radfeil) throw new Brukerfeil(500, radfeil.message);

  // Peker andelene på linjer som ikke finnes lenger, ville neste ordre tatt
  // alt med på nytt. Da stopper vi heller.
  if (
    !andelerPasser(
      rader ?? [],
      g.linjer.map((l) => l.id),
    )
  ) {
    throw new Brukerfeil(
      409,
      `Linjene i ${g.ord} er byttet ut etter forrige delordre, så appen vet ikke lenger hva som er fakturert. ` +
        "Ingen ordre er laget. Ta kontakt for å få koblet andelene til de nye linjene.",
    );
  }

  const { data: fullfort, error: fullfortFeil } = await bruker
    .from("delpost_fullfort")
    .select("offer_line_id")
    .eq(g.kol, kilde.id);
  if (fullfortFeil) throw new Brukerfeil(500, fullfortFeil.message);

  const { data: kunde } = await bruker
    .from("customers")
    .select("id, name, org_number, email, phone, address, tripletex_id")
    .eq("id", g.kundeId)
    .maybeSingle();
  if (!kunde) throw new Brukerfeil(404, `Fant ikke kunden på ${g.ord}`);

  const { data: innst } = await bruker
    .from("app_settings")
    .select("vat_pct")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const sats = Number(innst?.vat_pct ?? 25);

  let plan;
  try {
    plan = delordre(
      g.linjer,
      gjeldendeAndeler(rader ?? []),
      nye,
      g.adminPct,
      await mvaTypeId(tx, sats),
      new Set((fullfort ?? []).map((f) => f.offer_line_id as string)),
    );
  } catch (e) {
    if (e instanceof Brukerfeil) throw e;
    throw new Brukerfeil(400, (e as Error).message);
  }

  const kundeId = await tripletexKunde(tx, bruker, kunde as AppKunde);
  const prosjekt = await tripletexProsjekt(tx, bruker, g.prosjekt);
  const nummer = (rader ?? []).filter((r) => r.tripletex_ordre_id).length + 1;
  const idag = osloDato(0);
  const ordreBody = {
    customer: { id: kundeId },
    orderDate: idag,
    deliveryDate: idag,
    reference: g.deresRef || undefined,
    invoiceComment: `Delfaktura ${nummer} ${g.hva}`,
    orderLines: plan.linjer,
  };
  let ordre;
  let prosjektFeil: string | null = null;
  try {
    ordre = await tx.kall("POST", "/order", {
      json: prosjekt ? { ...ordreBody, project: { id: prosjekt.id } } : ordreBody,
    });
  } catch (e) {
    // Nekter Tripletex prosjektet — lukket, eller hører til en annen kunde —
    // er ordren viktigere enn koblingen. Den lages uten, og det sies fra.
    if (!prosjekt) throw e;
    prosjektFeil = `Prosjekt ${prosjekt.number} ble ikke satt på ordren: ${(e as Error).message}`;
    ordre = await tx.kall("POST", "/order", { json: ordreBody });
  }
  const ordreId = Number(ordre?.value?.id);
  // Tripletex gir ordren et nummer bare når nummerserien er slått på; ellers er
  // det tomt, og da er id-en det som finnes igjen i Tripletex.
  const ordreNr = String(ordre?.value?.number || ordreId);

  const { error: lagrefeil } = await bruker.from("payments").insert({
    tenant_id: tenantId,
    [g.kol]: kilde.id,
    amount: plan.sum,
    description: `Delordre ${nummer}`,
    invoice_date: idag,
    paid: false,
    andeler: plan.andeler,
    tripletex_ordre_id: ordreId,
    tripletex_ordre_nr: ordreNr,
    tripletex_status: "ordre",
    tripletex_synket: new Date().toISOString(),
  });
  if (lagrefeil) {
    // Uten raden her vet ikke appen om ordren, og andelene ville blitt sendt
    // på nytt neste gang. Da er det tryggere at ordren ikke finnes.
    await tx.kall("DELETE", `/order/${ordreId}`, { ingen404: true }).catch(() => null);
    throw new Brukerfeil(
      500,
      `Ordren ble ikke lagret i appen, og er slettet igjen: ${lagrefeil.message}`,
    );
  }

  let vedleggFeil: string | null = null;
  if (pdf) {
    const form = new FormData();
    form.append("file", pdf, g.pdfNavn);
    try {
      // NONE: PDF-en ligger på ordren som dokumentasjon, men følger ikke
      // automatisk med fakturaen kunden får.
      await tx.kall("PUT", `/order/${ordreId}/:attach`, {
        query: { addToInvoiceMode: "NONE" },
        form,
      });
    } catch (e) {
      vedleggFeil = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    ordre_id: ordreId,
    ordre_nr: ordreNr,
    sum: plan.sum,
    vedlegg_feil: vedleggFeil,
    prosjekt: prosjekt && !prosjektFeil ? `${prosjekt.number} ${prosjekt.name}`.trim() : null,
    prosjekt_feil: prosjektFeil,
  };
}

async function slettDelordre(tx: Tripletex, bruker: SupabaseClient, paymentId: string) {
  const { data: rad } = await bruker
    .from("payments")
    .select("id, offer_id, amendment_id, tripletex_ordre_id, tripletex_ordre_nr, tripletex_status")
    .eq("id", paymentId)
    .maybeSingle();
  if (!rad) throw new Brukerfeil(404, "Fant ikke raden");
  if (!rad.tripletex_ordre_id) throw new Brukerfeil(400, "Raden er ikke en ordre i Tripletex");
  if (rad.tripletex_status && rad.tripletex_status !== "ordre") {
    throw new Brukerfeil(
      409,
      `Ordre ${rad.tripletex_ordre_nr} er fakturert i Tripletex. Krediter fakturaen der — da åpnes andelen igjen her.`,
    );
  }
  // Tripletex nekter selv å slette en ordre som er fakturert. Er den alt
  // slettet der, er det greit.
  await tx.kall("DELETE", `/order/${rad.tripletex_ordre_id}`, { ingen404: true });
  await bruker.from("payments").delete().eq("id", paymentId);
  await oppdaterBetalt(bruker, rad);
  return { slettet: rad.tripletex_ordre_nr };
}

// ─── Synk ───────────────────────────────────────────────────────────────────

/**
 * Henter status for firmaets ordre fra Tripletex og skriver den inn i appen.
 *
 * Kreditert er endelig og hoppes over. Betalt sjekkes fortsatt, fordi en
 * betalt faktura kan bli kreditert etterpå.
 */
async function synk(
  db: SupabaseClient,
  tx: Tripletex,
  tenantId: string,
  offerId?: string,
  amendmentId?: string,
) {
  let sporring = db
    .from("payments")
    .select(
      "id, offer_id, amendment_id, created_at, paid, tripletex_ordre_id, tripletex_status, tripletex_faktura_nr",
    )
    .eq("tenant_id", tenantId)
    .not("tripletex_ordre_id", "is", null)
    .neq("tripletex_status", "kreditert");
  if (offerId) sporring = sporring.eq("offer_id", offerId);
  if (amendmentId) sporring = sporring.eq("amendment_id", amendmentId);
  const { data: rader, error } = await sporring;
  if (error) throw new Brukerfeil(500, error.message);
  if (!rader?.length) return { endret: 0, slettet: 0 };

  // Fakturaer fra dagen før den eldste ordren og fram til i morgen. Tripletex
  // krever et datointervall, og en faktura kan ikke være eldre enn ordren.
  const eldste = Math.min(...rader.map((r) => Date.parse(r.created_at)));
  const fakturaer = (await tx.alle("/invoice", {
    invoiceDateFrom: osloDato(-1, eldste),
    invoiceDateTo: osloDato(1),
    fields:
      "id,invoiceNumber,invoiceDate,amount,amountOutstanding,isCredited,isCreditNote,orders(id)",
  })) as TripletexFaktura[];
  const perOrdre = new Map<number, TripletexFaktura>();
  for (const f of fakturaer) {
    if (f.isCreditNote) continue;
    for (const o of f.orders ?? []) perOrdre.set(Number(o.id), f);
  }

  let endret = 0;
  let slettet = 0;
  const berorte = new Map<string, { offer_id?: string | null; amendment_id?: string | null }>();
  const idag = osloDato(0);

  for (const r of rader) {
    const ordreId = Number(r.tripletex_ordre_id);
    const faktura = perOrdre.get(ordreId);

    // Uten faktura kan ordren være slettet i Tripletex. Da forsvinner den
    // her også, og andelene den tok med er åpne igjen.
    if (!faktura) {
      const finnes = await tx.kall("GET", `/order/${ordreId}`, {
        query: { fields: "id" },
        ingen404: true,
      });
      if (!finnes) {
        await db.from("payments").delete().eq("id", r.id);
        berorte.set(r.offer_id ?? r.amendment_id, r);
        slettet++;
        continue;
      }
    }

    const status = fakturastatus(faktura);
    const betalt = status === "betalt";
    const fakturaNr = faktura?.invoiceNumber != null ? String(faktura.invoiceNumber) : null;
    const uendret =
      status === r.tripletex_status &&
      fakturaNr === (r.tripletex_faktura_nr ?? null) &&
      betalt === r.paid;

    await db
      .from("payments")
      .update(
        uendret
          ? { tripletex_synket: new Date().toISOString() }
          : {
              tripletex_status: status,
              tripletex_faktura_nr: fakturaNr,
              tripletex_faktura_dato: faktura?.invoiceDate ?? null,
              paid: betalt,
              paid_date: betalt ? (r.paid ? undefined : idag) : null,
              tripletex_synket: new Date().toISOString(),
            },
      )
      .eq("id", r.id);
    if (!uendret) {
      endret++;
      berorte.set(r.offer_id ?? r.amendment_id, r);
    }
  }

  for (const rad of berorte.values()) await oppdaterBetalt(db, rad);
  return { endret, slettet };
}

// ─── Inngangen ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return svar(405, { error: "Bruk POST" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const bruker = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  try {
    const erSkjema = (req.headers.get("Content-Type") ?? "").includes("multipart/form-data");
    const skjema = erSkjema ? await req.formData() : null;
    const json = erSkjema ? {} : await req.json().catch(() => ({}));
    const felt = (n: string) => (skjema ? skjema.get(n) : json[n]);
    const handling = String(felt("handling") ?? "");

    // ── Synkjobben ── ingen innlogging; nøkkelen i tripletex_drift avgjør.
    if (handling === "synk-alle") {
      const { data: drift } = await admin
        .from("tripletex_drift")
        .select("synk_nokkel")
        .maybeSingle();
      const nokkel = req.headers.get("x-synk-nokkel") ?? "";
      if (!drift?.synk_nokkel || nokkel !== drift.synk_nokkel) {
        return svar(401, { error: "Ugyldig nøkkel" });
      }
      const { data: alle } = await admin
        .from("tripletex_oppsett")
        .select("*")
        .neq("employee_token", "");
      const resultat: Record<string, unknown> = {};
      for (const o of (alle ?? []) as Oppsett[]) {
        // Ett firma med feil nøkkel skal ikke stoppe synken for de andre.
        try {
          resultat[o.tenant_id] = await synk(admin, new Tripletex(admin, o), o.tenant_id);
        } catch (e) {
          resultat[o.tenant_id] = { feil: (e as Error).message };
          console.error(`Synk for ${o.tenant_id}:`, e);
        }
      }
      return svar(200, { ok: true, resultat });
    }

    const { data: auth } = await bruker.auth.getUser();
    if (!auth?.user) throw new Brukerfeil(401, "Du er ikke logget inn");

    const { data: tenantId } = await bruker.rpc("current_tenant_id");
    if (!tenantId) throw new Brukerfeil(403, "Du hører ikke til noe firma");

    const { data: medlem } = await admin
      .from("tenant_users")
      .select("role")
      .eq("user_id", auth.user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const erAdmin = medlem?.role === "admin";

    const { data: rad } = await admin
      .from("tripletex_oppsett")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const oppsett = rad as Oppsett | null;
    const tilkoblet = kanLoggeInn(oppsett);

    if (handling === "status") {
      return svar(200, {
        tilkoblet,
        miljo: oppsett?.miljo ?? "produksjon",
        sist_hentet_kunder: oppsett?.sist_hentet_kunder ?? null,
        kan_endre: erAdmin,
        // Med tlxr_-nøkkel trengs ingen integrasjonsnøkkel, så firmaet kan
        // alltid koble til selv.
        integrasjon_klar: true,
      });
    }

    if (handling === "lagre") {
      if (!erAdmin) throw new Brukerfeil(403, "Bare administratorer kan koble til Tripletex");
      const miljo: Miljo = json.miljo === "test" ? "test" : "produksjon";
      // Et tomt felt betyr «behold den som er lagret», så man kan bytte miljø
      // uten å lime inn nøkkelen på nytt.
      const nytt: Oppsett = {
        tenant_id: tenantId,
        consumer_token: oppsett?.consumer_token ?? "",
        employee_token: String(json.employee_token ?? "").trim() || oppsett?.employee_token || "",
        miljo,
        session_token: null,
        session_utloper: null,
        session_gyldig_til: null,
        sist_hentet_kunder: oppsett?.sist_hentet_kunder ?? null,
      };
      if (!nytt.employee_token) throw new Brukerfeil(400, "Lim inn API-nøkkelen fra Tripletex");
      if (!kanLoggeInn(nytt)) {
        throw new Brukerfeil(
          400,
          "Nøkkelen ser ut som en gammel employee token. Lag en API-token under Selskap → API-tokens i Tripletex — den starter med tlxr_.",
        );
      }

      // Testes før noe lagres: en feil nøkkel skal ikke erstatte en som virker.
      const tx = new Tripletex(admin, nytt);
      const hvem = await tx.kall("GET", "/token/session/>whoAmI", {
        query: { fields: "companyId,company(name),employee(firstName,lastName)" },
      });
      // whoAmI gir ikke alltid firmanavnet med API-token; da spør vi firmaet.
      if (!hvem?.value?.company?.name && hvem?.value?.companyId) {
        const firma = await tx
          .kall("GET", `/company/${hvem.value.companyId}`, { query: { fields: "name" } })
          .catch(() => null);
        if (firma?.value?.name) hvem.value.company = { name: firma.value.name };
      }

      const { error } = await admin
        .from("tripletex_oppsett")
        .upsert({ ...nytt, oppdatert: new Date().toISOString() });
      if (error) throw new Brukerfeil(500, error.message);
      return svar(200, {
        ok: true,
        firma: hvem?.value?.company?.name ?? null,
        bruker: [hvem?.value?.employee?.firstName, hvem?.value?.employee?.lastName]
          .filter(Boolean)
          .join(" "),
      });
    }

    if (handling === "koble-fra") {
      if (!erAdmin) throw new Brukerfeil(403, "Bare administratorer kan koble fra Tripletex");
      await admin.from("tripletex_oppsett").delete().eq("tenant_id", tenantId);
      return svar(200, { ok: true });
    }

    if (!tilkoblet || !oppsett) {
      throw new Brukerfeil(
        400,
        "Firmaet er ikke koblet til Tripletex. En admin kan legge inn API-nøkkelen under Innstillinger.",
      );
    }
    const tx = new Tripletex(admin, oppsett);

    if (handling === "hent-kunder") {
      return svar(200, { ok: true, ...(await hentKunder(tx, bruker, admin, tenantId)) });
    }

    if (handling === "lag-delordre") {
      const offerId = String(felt("offer_id") ?? "");
      const amendmentId = String(felt("amendment_id") ?? "");
      if (!offerId && !amendmentId)
        throw new Brukerfeil(400, "Mangler offer_id eller amendment_id");
      const kilde: Kilde = offerId
        ? { type: "offer", id: offerId }
        : { type: "amendment", id: amendmentId };
      let nye: Andeler;
      try {
        nye = JSON.parse(String(felt("andeler") ?? "{}"));
      } catch {
        throw new Brukerfeil(400, "Andelene kunne ikke leses");
      }
      const pdf = skjema?.get("pdf");
      const resultat = await lagDelordre(
        tx,
        bruker,
        tenantId,
        kilde,
        nye,
        pdf instanceof File ? pdf : null,
      );
      return svar(200, { ok: true, ...resultat });
    }

    if (handling === "slett-delordre") {
      const paymentId = String(felt("payment_id") ?? "");
      if (!paymentId) throw new Brukerfeil(400, "Mangler payment_id");
      return svar(200, { ok: true, ...(await slettDelordre(tx, bruker, paymentId)) });
    }

    if (handling === "synk") {
      const offerId = String(felt("offer_id") ?? "") || undefined;
      const amendmentId = String(felt("amendment_id") ?? "") || undefined;
      return svar(200, { ok: true, ...(await synk(bruker, tx, tenantId, offerId, amendmentId)) });
    }

    throw new Brukerfeil(400, `Ukjent handling «${handling}»`);
  } catch (e) {
    if (e instanceof Brukerfeil) return svar(e.status, { error: e.message });
    console.error(e);
    return svar(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
