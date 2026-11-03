// Kobling til Tripletex: sender tilbud over som ordre med PDF-en som vedlegg,
// og henter kunderegisteret derfra.
//
// Kalles fra appen med brukerens innlogging (verify_jwt på). Nøklene til
// Tripletex ligger i tripletex_oppsett, som bare service role kan lese — de
// forlater aldri denne funksjonen. Alt annet (tilbud, kunder) leses og skrives
// som brukeren, så RLS holder hvert firma i sitt eget.
//
// Handlinger (feltet «handling»):
//   status        — er firmaet koblet til?
//   lagre         — lagre nøkler og test dem (bare admin)
//   koble-fra     — slett nøklene (bare admin)
//   hent-kunder   — hent kundene fra Tripletex inn i appen
//   send-tilbud   — multipart: offer_id, pdf, pa_nytt

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ordrelinjer,
  ordresum,
  mvaNummer,
  planleggKunder,
  tilTripletexKunde,
  orgnr,
  type AppKunde,
  type TripletexKunde,
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
  sist_hentet_kunder: string | null;
}

/** Datoen i Norge, med et antall dager lagt til, som yyyy-mm-dd. */
function osloDato(pluss = 0): string {
  const d = new Date(Date.now() + pluss * 86_400_000);
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
    // En lagret øktnøkkel brukes så lenge den har minst ett døgn igjen.
    const gyldig = oppsett.session_utloper && oppsett.session_utloper > osloDato(0);
    this.token = gyldig ? oppsett.session_token : null;
  }

  get base() {
    return BASER[this.oppsett.miljo] ?? BASER.produksjon;
  }

  /** Bytter de to nøklene i en øktnøkkel, og tar vare på den. */
  private async nyOkt(): Promise<string> {
    const utloper = osloDato(2);
    const q = new URLSearchParams({
      consumerToken: this.oppsett.consumer_token,
      employeeToken: this.oppsett.employee_token,
      expirationDate: utloper,
    });
    const res = await fetch(`${this.base}/token/session/:create?${q}`, { method: "PUT" });
    if (!res.ok) {
      throw new Brukerfeil(
        502,
        `Tripletex godtok ikke nøklene (${await tripletexFeil(res)}). ` +
          "Sjekk at begge nøklene er riktige og hører til valgt miljø.",
      );
    }
    const token = String((await res.json())?.value?.token ?? "");
    if (!token) throw new Brukerfeil(502, "Tripletex ga ingen øktnøkkel tilbake");
    this.token = token;
    await this.admin
      .from("tripletex_oppsett")
      .update({ session_token: token, session_utloper: utloper })
      .eq("tenant_id", this.oppsett.tenant_id);
    return token;
  }

  async kall(
    metode: string,
    sti: string,
    valg: {
      query?: Record<string, string | number | boolean>;
      json?: unknown;
      form?: FormData;
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
      if (!res.ok) {
        throw new Brukerfeil(502, `Tripletex sa nei: ${await tripletexFeil(res)}`);
      }
      const tekst = await res.text();
      return tekst ? JSON.parse(tekst) : null;
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

// ─── Handlingene ────────────────────────────────────────────────────────────

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

  const { data: iAppen, error } = await bruker
    .from("customers")
    .select("id, name, org_number, email, phone, address, tripletex_id");
  if (error) throw new Brukerfeil(500, error.message);

  const plan = planleggKunder(fraTripletex, (iAppen ?? []) as AppKunde[]);
  const forrigeNavn = new Map((iAppen ?? []).map((k) => [k.id, k.name]));

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

async function sendTilbud(
  tx: Tripletex,
  bruker: SupabaseClient,
  tenantId: string,
  offerId: string,
  pdf: File | null,
  paNytt: boolean,
) {
  const { data: tilbud, error } = await bruker
    .from("offers")
    .select("*, offer_lines(*)")
    .eq("id", offerId)
    .maybeSingle();
  if (error) throw new Brukerfeil(500, error.message);
  if (!tilbud) throw new Brukerfeil(404, "Fant ikke tilbudet");

  if (tilbud.tripletex_ordre_id && !paNytt) {
    throw new Brukerfeil(
      409,
      `Tilbudet er alt sendt til Tripletex som ordre ${tilbud.tripletex_ordre_nr ?? tilbud.tripletex_ordre_id}`,
    );
  }
  if (!tilbud.customer_id) throw new Brukerfeil(400, "Tilbudet har ingen kunde");

  const { data: kunde } = await bruker
    .from("customers")
    .select("id, name, org_number, email, phone, address, tripletex_id")
    .eq("id", tilbud.customer_id)
    .maybeSingle();
  if (!kunde) throw new Brukerfeil(404, "Fant ikke kunden på tilbudet");

  const { data: innst } = await bruker
    .from("app_settings")
    .select("vat_pct")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const sats = Number(innst?.vat_pct ?? 25);

  const kundeId = await tripletexKunde(tx, bruker, kunde as AppKunde);
  const linjer = ordrelinjer(
    tilbud.offer_lines ?? [],
    tilbud.admin_cost_pct,
    await mvaTypeId(tx, sats),
  );
  if (!linjer.some((l) => l.count && l.unitPriceExcludingVatCurrency)) {
    throw new Brukerfeil(400, "Tilbudet har ingen linjer med pris");
  }

  const idag = osloDato(0);
  const tittel = String(tilbud.title ?? "").trim();
  const ordre = await tx.kall("POST", "/order", {
    json: {
      customer: { id: kundeId },
      orderDate: idag,
      deliveryDate: idag,
      reference: String(tilbud.their_ref ?? "").trim() || undefined,
      invoiceComment: `Iht. tilbud nr. ${tilbud.offer_number}${tittel ? ` – ${tittel}` : ""}`,
      orderLines: linjer,
    },
  });
  const ordreId = Number(ordre?.value?.id);
  const ordreNr = String(ordre?.value?.number ?? ordreId);

  // Lagres før vedlegget, så en ordre som er laget aldri blir glemt — selv om
  // opplastingen skulle feile.
  await bruker
    .from("offers")
    .update({
      tripletex_ordre_id: ordreId,
      tripletex_ordre_nr: ordreNr,
      tripletex_sendt_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  let vedleggFeil: string | null = null;
  if (pdf) {
    const form = new FormData();
    form.append("file", pdf, `Tilbud ${tilbud.offer_number}.pdf`);
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

  return { ordre_id: ordreId, ordre_nr: ordreNr, sum: ordresum(linjer), vedlegg_feil: vedleggFeil };
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

    const erSkjema = (req.headers.get("Content-Type") ?? "").includes("multipart/form-data");
    const skjema = erSkjema ? await req.formData() : null;
    const json = erSkjema ? {} : await req.json().catch(() => ({}));
    const felt = (n: string) => (skjema ? skjema.get(n) : json[n]);
    const handling = String(felt("handling") ?? "");

    const { data: rad } = await admin
      .from("tripletex_oppsett")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const oppsett = rad as Oppsett | null;
    const tilkoblet = !!(oppsett?.consumer_token && oppsett?.employee_token);

    if (handling === "status") {
      return svar(200, {
        tilkoblet,
        miljo: oppsett?.miljo ?? "produksjon",
        sist_hentet_kunder: oppsett?.sist_hentet_kunder ?? null,
        kan_endre: erAdmin,
      });
    }

    if (handling === "lagre") {
      if (!erAdmin) throw new Brukerfeil(403, "Bare administratorer kan koble til Tripletex");
      const miljo: Miljo = json.miljo === "test" ? "test" : "produksjon";
      // Et tomt felt betyr «behold den som er lagret», så man kan bytte miljø
      // eller én nøkkel uten å lime inn begge på nytt.
      const nytt: Oppsett = {
        tenant_id: tenantId,
        consumer_token: String(json.consumer_token ?? "").trim() || oppsett?.consumer_token || "",
        employee_token: String(json.employee_token ?? "").trim() || oppsett?.employee_token || "",
        miljo,
        session_token: null,
        session_utloper: null,
        sist_hentet_kunder: oppsett?.sist_hentet_kunder ?? null,
      };
      if (!nytt.consumer_token || !nytt.employee_token) {
        throw new Brukerfeil(400, "Begge nøklene må fylles ut");
      }

      // Testes før noe lagres: feil nøkler skal ikke erstatte nøkler som virker.
      const tx = new Tripletex(admin, nytt);
      const hvem = await tx.kall("GET", "/token/session/>whoAmI", {
        query: { fields: "company(name),employee(firstName,lastName)" },
      });

      const { error } = await admin
        .from("tripletex_oppsett")
        .upsert({ ...nytt, oppdatert: new Date().toISOString() });
      if (error) throw new Brukerfeil(500, error.message);
      // Øktnøkkelen fra testen ble ikke lagret, fordi raden ikke fantes ennå.
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
        "Firmaet er ikke koblet til Tripletex. Legg inn nøklene under Innstillinger.",
      );
    }
    const tx = new Tripletex(admin, oppsett);

    if (handling === "hent-kunder") {
      return svar(200, { ok: true, ...(await hentKunder(tx, bruker, admin, tenantId)) });
    }

    if (handling === "send-tilbud") {
      const offerId = String(felt("offer_id") ?? "");
      if (!offerId) throw new Brukerfeil(400, "Mangler offer_id");
      const pdf = skjema?.get("pdf");
      const resultat = await sendTilbud(
        tx,
        bruker,
        tenantId,
        offerId,
        pdf instanceof File ? pdf : null,
        String(felt("pa_nytt") ?? "") === "true",
      );
      return svar(200, { ok: true, ...resultat });
    }

    throw new Brukerfeil(400, `Ukjent handling «${handling}»`);
  } catch (e) {
    if (e instanceof Brukerfeil) return svar(e.status, { error: e.message });
    console.error(e);
    return svar(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
