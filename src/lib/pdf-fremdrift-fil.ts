// Fremdriftsplanen som en ekte PDF-fil.
//
// De andre dokumentene i systemet skrives ut via nettleserens utskriftsdialog.
// Det gir ingen fil, og en fremdriftsplan skal kunne legges ved tilbudet og
// sendes videre — derfor tegnes denne rett til PDF i stedet.
//
// pdf-lib tegner vektor: rektangler, streker og tekst. En Gantt består av
// nettopp det, så resultatet blir skarpt og filen liten. Alternativet — å
// fotografere HTML-en med html2canvas — ville gitt et punktbilde der teksten
// blir uskarp i utskrift og filen mange megabyte.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  lagTidsakse, plassering, planPeriode, isoUke, parseDato, tilDato, finnFarge, naarTekst,
  type Tidsakse,
} from "./fremdrift.ts";

export interface PlanAktivitet {
  name: string;
  responsible?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_milestone?: boolean | null;
  /** Fag eller fase — «Grunnarbeid», «Rør/VA». Grupperer tegnforklaringen. */
  category?: string | null;
  color?: string | null;
  notes?: string | null;
}

export interface PlanDokument {
  title: string;
  revision?: string | null;
  plan_date?: string | null;
  /**
   * Planens egen periode — kalenderen brukeren setter opp før aktivitetene,
   * fordi aktivitetene ikke kan definere aksen de skal legges inn i. Tidsaksen
   * bygges av denne, slik at filen viser nøyaktig den samme kalenderen som
   * skjermen. Eldre planer er lagret uten periode, og de faller tilbake på
   * ytterpunktene til aktivitetene.
   */
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
  offer_number?: number | string | null;
  offer_title?: string | null;
  project_ref?: string | null;
  customer_name?: string | null;
}

export interface PlanInnstillinger {
  company_name: string;
  company_tagline?: string;
  company_org_nr?: string;
  logo_url?: string;
  ref_name?: string;
  ref_phone?: string;
  ref_email?: string;
}

/** Liggende A4 i punkt. */
const BREDDE = 841.89;
const HOYDE = 595.28;

const MARG = 38;
const NAVNEBREDDE = 226;

/**
 * Radhøyden er ikke fast.
 *
 * Med en fast høyde på 17,5 punkt endte en plan på tolv aktiviteter med
 * diagrammet i øverste tredel og et halvt A4 blankt papir under. Radene får
 * derfor vokse til de fyller siden, opp til et tak — over det blir det luft
 * mellom hver strek i stedet for et diagram.
 *
 * Minsteverdien er også den sideinndelingen regner med. Ellers ville en side
 * med høye rader tatt færre aktiviteter enn kapasiteten som ble regnet ut, og
 * de siste radene falt ut av dokumentet.
 */
const RAD_MIN = 17.5;
const RAD_MAKS = 27;

const BLEKK = rgb(0.04, 0.04, 0.04);
const GRAA_700 = rgb(0.18, 0.18, 0.19);
const GRAA_600 = rgb(0.27, 0.27, 0.28);
const GRAA_400 = rgb(0.48, 0.48, 0.51);
const GRAA_300 = rgb(0.78, 0.78, 0.8);
const GRAA_200 = rgb(0.9, 0.9, 0.9);
const GRAA_100 = rgb(0.96, 0.96, 0.95);
/** Panelene: infofeltene på toppen og tegnforklaringen nederst. */
const PANEL = rgb(0.973, 0.973, 0.968);
/** Annenhver måned får et hvilende bånd bak radene, så øyet finner måneden. */
const MAANEDSBAAND = rgb(0.957, 0.959, 0.965);
const AKSENT = rgb(0.89, 0.02, 0.07);

const hex = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Helvetica i PDF bruker WinAnsi. Æ, Ø og Å er med der, men et tegn som ikke er
 * det — for eksempel en tankestrek kopiert fra Word — får pdf-lib til å kaste,
 * og da hadde hele nedlastingen feilet på grunn av ett tegn i et aktivitetsnavn.
 */
function trygg(s: unknown): string {
  return String(s ?? "")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    // Linjeskift og tabulator blir til mellomrom før resten strykes. En PDF-
    // tekst kan uansett ikke inneholde et rått linjeskift, men fjernes det uten
    // å sette noe i stedet, limes ordene på hver side sammen: merknaden
    // «Forutsetninger:» med «Vinterstans uke 52.» på neste linje ble til
    // «Forutsetninger:Vinterstans uke 52.», og merknadsfeltet er en textarea
    // der Enter er det naturlige å trykke.
    .replace(/[\r\n\t\f\v]+/g, " ")
    // Alt som fortsatt ligger utenfor Latin-1 blir borte heller enn å velte filen
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

/** Kutter teksten så den får plass, med ... på slutten. */
function klipp(tekst: string, font: PDFFont, storrelse: number, maks: number): string {
  const t = trygg(tekst);
  if (font.widthOfTextAtSize(t, storrelse) <= maks) return t;
  let ut = t;
  while (ut.length > 1 && font.widthOfTextAtSize(ut + "...", storrelse) > maks) {
    ut = ut.slice(0, -1);
  }
  return ut + "...";
}

/**
 * Bryter en tekst på ordgrense til linjer som får plass i bredden.
 *
 * Skilles ut fordi merknaden nå kan gå over flere linjer og kan havne på en
 * egen side: hvor mange linjer teksten blir, må være kjent før det avgjøres
 * hvor den skal tegnes.
 */
function brytLinjer(tekst: string, font: PDFFont, storrelse: number, maks: number): string[] {
  const ord = trygg(tekst).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const linjer: string[] = [];
  let linje = "";
  for (const o of ord) {
    const prov = linje ? `${linje} ${o}` : o;
    // Et enkelt ord som er bredere enn linjen får stå alene og flyte over
    // heller enn å sende løkken i evig runde uten å legge fra seg noe.
    if (linje && font.widthOfTextAtSize(prov, storrelse) > maks) {
      linjer.push(linje);
      linje = o;
    } else linje = prov;
  }
  if (linje) linjer.push(linje);
  return linjer;
}

/**
 * Månedene som sammenhengende bolker, ikke som enkeltkolonner.
 *
 * Aksen setter månedsnavnet på den første kolonnen i måneden og lar resten stå
 * tomme. Det holdt til å skrive navnet, men ikke til å tegne det båndet bak
 * radene som gjør at øyet finner mars uten å telle uker — til det trengs første
 * og siste kolonne i hver bolk.
 */
function maanedsbolker(akse: Tidsakse): Array<{ fra: number; til: number; navn: string }> {
  const bolker: Array<{ fra: number; til: number; navn: string }> = [];
  akse.kolonner.forEach((k, i) => {
    if (i === 0 || k.overskrift) bolker.push({ fra: i, til: i, navn: k.overskrift });
    else bolker[bolker.length - 1].til = i;
  });
  return bolker;
}

const fmtDato = (s?: string | null) => {
  const d = parseDato(s);
  if (!d) return "-";
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};

/**
 * Skalerer logoen ned før den bygges inn.
 *
 * Firmalogoer lastes opp i den oppløsningen de tilfeldigvis har — den ene her
 * er 1254×1254 px, mens den tegnes 26 punkt høy, altså rundt 108 px selv ved
 * 300 dpi. Uten nedskalering blir hvert vedlegg 650 kB i stedet for 30, og de
 * ligger i en gratis lagringsplan og sendes på e-post.
 *
 * Bare i nettleseren — det er der PDF-en faktisk lages. Kjøres koden et sted
 * uten canvas, brukes originalen, og resultatet blir stort men riktig.
 *
 * Lerretet brukes også til å gjøre om formatet. pdf-lib kan bare bygge inn PNG
 * og JPG, mens opplastingen tilbyr WEBP. En liten WEBP-logo trenger ingen
 * nedskalering, men den må likevel innom her for å bli PNG — ellers faller den
 * ut av dokumentet uten et ord, samtidig som den vises fint i menyen og på
 * tilbudsutskriften.
 */
async function nedskalertLogo(
  bytes: Uint8Array,
  maksHoyde: number,
  maaKonverteres = false,
): Promise<Uint8Array | null> {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return null;
  try {
    const bilde = await createImageBitmap(new Blob([bytes as BlobPart]));
    if (bilde.height <= maksHoyde && !maaKonverteres) return null;
    // Aldri opp — et lite bilde som bare skal skifte format skal beholde sin
    // egen oppløsning, ikke blåses opp til taket og bli uskarpt.
    const hoyde = Math.min(bilde.height, maksHoyde);
    const skala = hoyde / bilde.height;
    const lerret = new OffscreenCanvas(Math.max(1, Math.round(bilde.width * skala)), Math.max(1, hoyde));
    const ctx = lerret.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bilde, 0, 0, lerret.width, lerret.height);
    const blob = await lerret.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

export async function lagFremdriftsplanPdf(
  plan: PlanDokument,
  aktiviteter: PlanAktivitet[],
  settings: PlanInnstillinger,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const vanlig = await doc.embedFont(StandardFonts.Helvetica);
  const fet = await doc.embedFont(StandardFonts.HelveticaBold);

  doc.setTitle(trygg(`Fremdriftsplan - ${plan.title || settings.company_name}`));
  doc.setAuthor(trygg(settings.company_name));
  doc.setCreator(trygg(settings.company_name));

  // Firmalogoen. Hentes over nett, og det kan feile — nettet er nede, bildet er
  // slettet, formatet er noe pdf-lib ikke kan. Da skal dokumentet komme likevel:
  // en fremdriftsplan uten logo er brukbar, en plan som ikke lar seg laste ned
  // er det ikke.
  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (settings.logo_url) {
    try {
      const svar = await fetch(settings.logo_url);
      if (svar.ok) {
        const raa = new Uint8Array(await svar.arrayBuffer());
        // Formatet leses av de første bytene, ikke av filendelsen — URL-en har
        // ofte en spørrestreng bak seg («?t=1782299268014»).
        const erRaaPng = raa[0] === 0x89 && raa[1] === 0x50 && raa[2] === 0x4e;
        const erRaaJpg = raa[0] === 0xff && raa[1] === 0xd8;
        // 200 px er rikelig for et merke som tegnes 26 punkt høyt, også på skjerm
        // med høy oppløsning og ved innzooming. Er formatet noe pdf-lib ikke kan
        // bygge inn — WEBP er et av valgene i opplastingen — må bildet gjennom
        // lerretet uansett hvor lite det er, ellers blir det aldri PNG.
        const bytes = (await nedskalertLogo(raa, 200, !erRaaPng && !erRaaJpg)) ?? raa;
        // Sjekken gjøres på nytt på det som faktisk skal bygges inn:
        // nedskaleringen gir alltid PNG, men kan også ha gitt opp, og da er det
        // originalen som ligger her.
        const erPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
        const erJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
        if (erPng) logo = await doc.embedPng(bytes);
        else if (erJpg) logo = await doc.embedJpg(bytes);
      }
    } catch {
      logo = null;
    }
  }

  const medDato = aktiviteter.filter((a) => parseDato(a.start_date));
  const utenDato = aktiviteter.filter((a) => !parseDato(a.start_date) && String(a.name ?? "").trim());
  // Tidsaksen bygges av planens egen periode, ikke av ytterpunktene til
  // aktivitetene. Brukeren setter perioden først nettopp fordi det er
  // kalenderen arbeidet legges inn i, og slakken foran og bak er som regel lagt
  // inn med vilje. Regnet vi aksen av aktivitetene, ville en plan med periode
  // uke 10-44 og arbeid i uke 12-20 fått 34 kolonner på skjermen og 9 i filen —
  // og grensen på 34 kolonner mellom uke- og månedsakse ville slått inn på to
  // ulike spenn, så utskriften kunne blitt en annen graf enn den som ble
  // godkjent.
  //
  // Eldre planer er lagret uten periode og faller tilbake på aktivitetene. Da
  // må det være de samme aktivitetene som skjermen regner av: en rad med dato,
  // men uten navn, er en halvferdig rad ingen ser på skjermen, og den skal ikke
  // få strekke aksen.
  const planStart = parseDato(plan.start_date);
  const planSlutt = parseDato(plan.end_date);
  const periode = planStart && planSlutt
    ? { start: tilDato(planStart), slutt: tilDato(planSlutt) }
    : planPeriode(medDato.filter((a) => String(a.name ?? "").trim()));
  const akse = periode ? lagTidsakse(periode.start, periode.slutt) : null;
  const bolker = akse ? maanedsbolker(akse) : [];

  const tidX = MARG + NAVNEBREDDE;
  const tidBredde = BREDDE - MARG - tidX;

  // Fagene som faktisk er i bruk. Milepæler holdes utenfor faglista —
  // rutersymbolet sier alt allerede — men fargene deres samles opp, for
  // tegnforklaringen skal vise den fargen romben faktisk får i diagrammet.
  const fag = new Map<string, string>();
  const milepaelFarger: string[] = [];
  for (const a of medDato) {
    const fyll = finnFarge(a.color).fyll;
    if (a.is_milestone) {
      if (!milepaelFarger.includes(fyll)) milepaelFarger.push(fyll);
      continue;
    }
    const navn = String(a.category ?? "").trim();
    if (navn && !fag.has(navn)) fag.set(navn, fyll);
  }

  // Hvor radene begynner regnes ut av de samme leddene som tegningen bruker,
  // ikke av et anslag. Første forsøk hadde hardkodede marger som lå 11 punkt
  // feil, og da havnet siste rad oppå tegnforklaringen.
  const bunn = 86;
  const AKSEHODE = 27;
  const raderStart = (forste: boolean) =>
    HOYDE - MARG - 16 - 22 - 26 - (forste ? 44 : 0) - AKSEHODE;
  const raderForste = Math.floor((raderStart(true) - bunn) / RAD_MIN);
  const raderSenere = Math.floor((raderStart(false) - bunn) / RAD_MIN);

  const sider: PlanAktivitet[][] = [];
  let i = 0;
  while (i < medDato.length) {
    const plass = sider.length === 0 ? raderForste : raderSenere;
    sider.push(medDato.slice(i, i + plass));
    i += plass;
  }
  if (!sider.length) sider.push([]);

  // Merknaden og lista over udaterte aktiviteter deler den plassen som er igjen
  // mellom siste rad og tegnforklaringen. Hvor mye det faktisk er, regnes ut av
  // de samme leddene som tegningen bruker — med full siste side er svaret null,
  // og da la den gamle koden merknaden rett oppå fargerutene i forklaringen.
  const MERKNADSLINJE = 10;
  const merknadBredde = BREDDE - 2 * MARG;
  const merknadPlass = (topp: number) => Math.floor((topp - bunn) / MERKNADSLINJE) + 1;

  const merknadLinjer = plan.notes ? brytLinjer(plan.notes, vanlig, 8, merknadBredde) : [];
  const udatertLinje = utenDato.length
    ? klipp(`Uten dato, ikke tegnet inn: ${utenDato.map((a) => a.name).join(", ")}`, vanlig, 8, merknadBredde)
    : "";
  const merknadBehov = merknadLinjer.length + (udatertLinje ? 1 : 0);

  // Radhøyden settes etter hvor mye plass planen faktisk trenger. Går alt inn
  // på én side, får radene vokse til de fyller den — en plan på tolv linjer
  // skal ikke levere et halvt blankt ark. Går den over flere sider, er sidene
  // fulle likevel, og da holder minstehøyden dem like høye fra side til side.
  // Merknaden får sin plass reservert først, ellers ville radene dyttet den
  // over på en egen side bare fordi de kunne vokse.
  const enSide = sider.length === 1;
  const merknadReserv = merknadBehov ? merknadBehov * MERKNADSLINJE + 16 : 0;
  const ledigTilRader = raderStart(true) - bunn - merknadReserv;
  const radHoyde = enSide && sider[0].length
    ? Math.min(RAD_MAKS, Math.max(RAD_MIN, ledigTilRader / sider[0].length))
    : RAD_MIN;

  /**
   * Hvor kalenderen slutter på en side.
   *
   * Rammen fylles med tomme rader ned til gulvet, og merknaden skal stå under
   * den — ikke oppå de nederste rutene. Derfor må bunnen være regnet ut av de
   * samme leddene som tegningen bruker, ikke anslått.
   */
  const kartBunn = (forste: boolean, antallRader: number, gulv: number) => {
    const topp = raderStart(forste);
    const tomme = Math.max(0, Math.floor((topp - antallRader * radHoyde - gulv) / radHoyde));
    return topp - (antallRader + tomme) * radHoyde;
  };

  // Får ikke hele merknaden plass nederst på siste side, flyttes den til en
  // egen side i stedet for å bli kuttet etter to linjer. Forbehold og
  // forutsetninger er nettopp det byggherren må lese, og en tekst som stopper
  // uten et tegn på at det er mer, leses som om det var hele forbeholdet.
  const sisteAntall = sider[sider.length - 1].length;
  const sisteTopp = kartBunn(enSide, sisteAntall, bunn + merknadReserv) - 14;
  const egenMerknadsside = merknadBehov > 0 && merknadBehov > merknadPlass(sisteTopp);
  const antallSider = sider.length + (egenMerknadsside ? 1 : 0);
  // Skal merknaden på egen side, er det ingen grunn til å holde av plass til
  // den nederst — da fylles kalenderen helt ned.
  const sisteGulv = merknadBehov && !egenMerknadsside ? bunn + merknadReserv : bunn;

  // Perioden vises som de datoene planen faktisk gjelder, ikke som ytterkanten
  // av tidsaksen: aksen er trukket ut til hele uker, så en plan som starter en
  // onsdag ville stått med mandagen foran.
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const sisteDagIAkse = akse ? new Date(akse.til.getTime() - 86400000) : null;
  const fraDato = plan.start_date || (akse ? iso(akse.fra) : null);
  const tilDatoTekst = plan.end_date || (sisteDagIAkse ? iso(sisteDagIAkse) : null);
  const periodeTekst = fraDato && tilDatoTekst
    ? `${fmtDato(fraDato)} - ${fmtDato(tilDatoTekst)}`
    : "Ingen datoer lagt inn";
  // Uker og antall uker hører sammen: ukenumrene sier hvor på kalenderen det
  // ligger, tallet sier hvor lenge det varer.
  const ukerIAlt = akse ? Math.round((akse.til.getTime() - akse.fra.getTime()) / (7 * 86400000)) : 0;
  const kryssarAar = !!akse && !!sisteDagIAkse && isoUke(akse.fra).aar !== isoUke(sisteDagIAkse).aar;
  // Ukenumrene tas bare med når planen holder seg innenfor året. Krysser den
  // nyttår, sier «uke 1 - 26» over 78 uker mer forvirrende enn det opplyser —
  // og datoene står i feltet ved siden av.
  const varighetTekst = !akse
    ? "-"
    : kryssarAar
      ? `${ukerIAlt} uker`
      : `Uke ${isoUke(akse.fra).uke} - ${isoUke(sisteDagIAkse!).uke} (${ukerIAlt} uker)`;

  const tegnTopp = (side: PDFPage, sideNr: number, forste: boolean) => {
    let y = HOYDE - MARG;

    side.drawRectangle({ x: MARG, y: y - 2, width: BREDDE - 2 * MARG, height: 2, color: AKSENT });
    y -= 16;

    side.drawText(trygg(settings.company_name.toUpperCase()), {
      x: MARG, y, size: 6.5, font: vanlig, color: GRAA_600,
    });
    const sideTekst = `SIDE ${sideNr} AV ${antallSider}`;
    side.drawText(sideTekst, {
      x: BREDDE - MARG - vanlig.widthOfTextAtSize(sideTekst, 6.5), y, size: 6.5, font: vanlig, color: GRAA_600,
    });
    y -= 22;

    // Logoen står foran firmanavnet, og teksten flyttes tilsvarende. Mangler
    // den, rykker navnet helt til venstre i stedet for å etterlate et hull.
    let tekstX = MARG;
    if (logo) {
      const h = 26;
      // Taket på bredden. En logo som er bred og lav — mange bygglogoer er det —
      // ville ellers skjøvet firmanavnet helt bort i tittelen ute til høyre.
      // Over taket krymper den i høyden i stedet, så forholdet holder seg.
      const MAKS_LOGOBREDDE = 150;
      const forhold = logo.width / logo.height;
      const b = Math.min(forhold * h, MAKS_LOGOBREDDE);
      const hoyde = b / forhold;
      side.drawImage(logo, { x: MARG, y: y - 8 + (h - hoyde) / 2, width: b, height: hoyde });
      tekstX = MARG + b + 10;
    }

    // «FREMDRIFTS» i svart, «PLAN» i rødt — samme grep som de andre dokumentene.
    // Bredden regnes ut før firmanavnet skrives, for tittelen står fast ute til
    // høyre, og navnet må klippes mot den plassen som faktisk er igjen fram til
    // den. «Hauge Maskin og Transport AS» er 190,9 punkt bredt, og tittelen
    // begynner rundt x=638 — uten klippingen legger de seg oppå hverandre.
    const del1 = "FREMDRIFTS";
    const del2 = "PLAN";
    const st = 18;
    const b2 = fet.widthOfTextAtSize(del2, st);
    const b1 = fet.widthOfTextAtSize(del1, st);
    const navnePlass = Math.max(40, BREDDE - MARG - b1 - b2 - 14 - tekstX);

    side.drawText(klipp(settings.company_name, fet, 13, navnePlass), {
      x: tekstX, y, size: 13, font: fet, color: BLEKK,
    });
    if (settings.company_tagline) {
      side.drawText(klipp(settings.company_tagline, vanlig, 7.5, navnePlass), {
        x: tekstX, y: y - 11, size: 7.5, font: vanlig, color: GRAA_400,
      });
    }

    side.drawText(del1, { x: BREDDE - MARG - b1 - b2, y, size: st, font: fet, color: BLEKK });
    side.drawText(del2, { x: BREDDE - MARG - b2, y, size: st, font: fet, color: AKSENT });
    const under = klipp(plan.title || "Uten tittel", vanlig, 8.5, 320);
    side.drawText(under, {
      x: BREDDE - MARG - vanlig.widthOfTextAtSize(under, 8.5), y: y - 12, size: 8.5, font: vanlig, color: GRAA_400,
    });
    y -= 26;

    if (forste) {
      // Nøkkelopplysningene i et eget felt med egen bakgrunn. Som løs tekst på
      // hvitt fløt de sammen med diagrammet under; en ramme rundt sier at dette
      // er dokumentets hode, og gjør det raskt å slå opp tilbudsnummeret.
      const panelH = 38;
      const panelY = y - panelH;
      side.drawRectangle({
        x: MARG, y: panelY, width: BREDDE - 2 * MARG, height: panelH,
        color: PANEL, borderColor: GRAA_200, borderWidth: 0.5,
      });

      const felt: Array<[string, string]> = [
        ["PROSJEKT", plan.project_ref || plan.offer_title || "-"],
        ["TILBUD", plan.offer_number ? `#${plan.offer_number}` : "-"],
        ["BYGGHERRE", plan.customer_name || "-"],
        ["PERIODE", periodeTekst],
        ["VARIGHET", varighetTekst],
        ["AKTIVITETER", String(medDato.length)],
        ["REVISJON", plan.revision || "-"],
        ["PLANDATO", fmtDato(plan.plan_date)],
      ];
      // Feltene deler bredden mellom seg etter hvor mye hver av dem trenger.
      // Med fast bredde ble «Strand kommune Vest-Agder» klippet mens «REVISJON:
      // B» sto med tom plass ved siden av.
      const luft = 16;
      const onsket = felt.map(([m, v]) =>
        Math.max(vanlig.widthOfTextAtSize(m, 6), fet.widthOfTextAtSize(trygg(v), 9)),
      );
      const tilgjengelig = BREDDE - 2 * MARG - 2 * 12 - luft * (felt.length - 1);
      const sum = onsket.reduce((a, b) => a + b, 0);
      const skala = sum > tilgjengelig ? tilgjengelig / sum : 1;

      let x = MARG + 12;
      felt.forEach(([merkelapp, verdi], idx) => {
        if (idx > 0) {
          side.drawLine({
            start: { x: x - luft / 2, y: panelY + 7 }, end: { x: x - luft / 2, y: panelY + panelH - 7 },
            thickness: 0.5, color: GRAA_300,
          });
        }
        const b = Math.max(28, onsket[idx] * skala);
        side.drawText(merkelapp, { x, y: panelY + 23, size: 6, font: vanlig, color: GRAA_400 });
        side.drawText(klipp(verdi, fet, 9, b), { x, y: panelY + 10, size: 9, font: fet, color: BLEKK });
        x += b + luft;
      });
      y = panelY - 6;
    }
    return y;
  };

  const tegnAksehode = (side: PDFPage, y: number) => {
    if (!akse) return y - 18;
    const kolBredde = tidBredde / akse.kolonner.length;
    const baandH = 13;

    side.drawText("AKTIVITET", { x: MARG + 8, y: y - 19, size: 6, font: vanlig, color: GRAA_400 });
    // Overskriften settes bare når ansvarlig faktisk står i sin egen kolonne
    // ute til høyre. Er radene høye nok til at navnet står under aktiviteten,
    // ville overskriften pekt på tom plass.
    if (radHoyde < 22) {
      side.drawText("ANSVARLIG", {
        x: tidX - 8 - vanlig.widthOfTextAtSize("ANSVARLIG", 6), y: y - 19, size: 6, font: vanlig, color: GRAA_400,
      });
    }

    // Måneden skrives midt over sine egne uker, på et bånd som viser hvor den
    // begynner og slutter. Før sto navnet klemt inn over den første uken i
    // måneden, og «okt» kunne like gjerne ha hørt til uken før.
    bolker.forEach((b, i) => {
      const x = tidX + b.fra * kolBredde;
      const bredde = (b.til - b.fra + 1) * kolBredde;
      if (i % 2 === 1) {
        side.drawRectangle({ x, y: y - baandH, width: bredde, height: baandH, color: MAANEDSBAAND });
      }
      const navn = trygg((b.navn || "").toUpperCase());
      if (navn) {
        const tb = fet.widthOfTextAtSize(navn, 7);
        // Får navnet ikke plass i sin egen bolk, står det venstrestilt i stedet
        // for å flyte inn i naboen — en måned kan være én ukekolonne bred.
        const tx = tb + 4 <= bredde ? x + bredde / 2 - tb / 2 : x + 1;
        side.drawText(navn, { x: tx, y: y - 9.5, size: 7, font: fet, color: GRAA_700 });
      }
    });

    akse.kolonner.forEach((k, idx) => {
      const x = tidX + idx * kolBredde;
      const etikett = trygg(k.etikett);
      const b = vanlig.widthOfTextAtSize(etikett, 6.5);
      side.drawText(etikett, {
        x: x + kolBredde / 2 - b / 2, y: y - baandH - 9, size: 6.5, font: vanlig, color: GRAA_600,
      });
    });

    // «UKE» én gang ute i margen, ikke foran hvert tall. Uten den leses
    // tallrekken like gjerne som datoer.
    if (akse.type === "uke") {
      side.drawText("UKE", {
        x: tidX - 3 - vanlig.widthOfTextAtSize("UKE", 5.5),
        y: y - baandH - 9, size: 5.5, font: vanlig, color: GRAA_300,
      });
    }

    const linjeY = y - AKSEHODE;
    side.drawLine({
      start: { x: MARG, y: linjeY }, end: { x: BREDDE - MARG, y: linjeY },
      thickness: 1.2, color: BLEKK,
    });
    return linjeY;
  };

  const tegnRader = (side: PDFPage, rader: PlanAktivitet[], topp: number, gulv: number) => {
    if (!akse) return topp;
    const kolBredde = tidBredde / akse.kolonner.length;
    // Kalenderen tegnes ferdig ned til gulvet, også der planen har færre
    // aktiviteter enn det er plass til. En plan på to linjer så ellers ut som
    // et uferdig ark med et diagram klistret øverst — og de tomme radene er noe
    // man faktisk bruker: de fylles ut for hånd på byggemøtet.
    const tomme = Math.max(0, Math.floor((topp - rader.length * radHoyde - gulv) / radHoyde));
    const antall = rader.length + tomme;
    const nederst = topp - antall * radHoyde;

    // Månedsbåndene tegnes i full høyde før radene, ikke per rad. Da står de
    // som sammenhengende felt bak diagrammet, og øyet finner mars uten å telle
    // uker bortover fra begynnelsen.
    bolker.forEach((b, i) => {
      if (i % 2 === 0) return;
      side.drawRectangle({
        x: tidX + b.fra * kolBredde, y: nederst,
        width: (b.til - b.fra + 1) * kolBredde, height: topp - nederst,
        color: MAANEDSBAAND,
      });
    });

    let y = topp;
    rader.forEach((a, idx) => {
      const radTopp = y;
      const radBunn = y - radHoyde;

      // Stripen legges bare i navnefeltet. Over hele bredden slo den ut
      // månedsbåndene annenhver rad, og kalenderen bak ble et sjakkbrett.
      if (idx % 2 === 1) {
        side.drawRectangle({
          x: MARG, y: radBunn, width: NAVNEBREDDE, height: radHoyde, color: GRAA_100,
        });
      }

      // Rutenettet tegnes per rad, ellers ville stripene lagt seg oppå det
      akse.kolonner.forEach((k, kIdx) => {
        if (kIdx === 0) return;
        const x = tidX + kIdx * kolBredde;
        side.drawLine({
          start: { x, y: radTopp }, end: { x, y: radBunn },
          thickness: k.overskrift ? 0.7 : 0.4,
          color: k.overskrift ? GRAA_300 : GRAA_200,
        });
      });

      const farge = finnFarge(a.color);
      // Fargemerket foran navnet, så raden kan spores til sitt fag uten å følge
      // streken bortover
      side.drawRectangle({
        x: MARG, y: radBunn + 3.5, width: 3.5, height: radHoyde - 7, color: hex(farge.fyll),
      });

      // Er raden høy nok, står ansvarlig under navnet i stedet for å ta av
      // navnets bredde. Da slipper «Grunnarbeid og masseutskifting» å bli
      // klippet for å gi plass til et navn den ikke har noe med.
      const toLinjer = radHoyde >= 22;
      const navnStorrelse = radHoyde >= 24 ? 8.5 : 8;
      const navnPlass = NAVNEBREDDE - 14 - (toLinjer || !a.responsible ? 0 : 78);
      // En rad med dato, men uten navn, er en halvferdig rad skjermen ikke
      // viser. Den tegnes likevel her, for datoen er noe brukeren faktisk har
      // lagt inn — men den skal si hva den er, ikke bare stå som en bindestrek
      // ingen kan tyde.
      const navn = String(a.name ?? "").trim() || "(uten navn)";
      side.drawText(klipp(navn, fet, navnStorrelse, navnPlass), {
        x: MARG + 9,
        y: toLinjer ? radBunn + radHoyde / 2 - 0.5 : radBunn + radHoyde / 2 - 3,
        size: navnStorrelse, font: fet, color: BLEKK,
      });
      if (a.responsible) {
        const r = klipp(a.responsible, vanlig, 7, toLinjer ? navnPlass : 74);
        if (toLinjer) {
          side.drawText(r, { x: MARG + 9, y: radBunn + radHoyde / 2 - 9.5, size: 7, font: vanlig, color: GRAA_400 });
        } else {
          side.drawText(r, {
            x: tidX - 8 - vanlig.widthOfTextAtSize(r, 7), y: radBunn + radHoyde / 2 - 3,
            size: 7, font: vanlig, color: GRAA_400,
          });
        }
      }

      const p = plassering(akse, a.start_date, a.end_date);
      if (p) {
        const x = tidX + (p.venstre / 100) * tidBredde;
        const midt = radBunn + radHoyde / 2;
        if (a.is_milestone) {
          // Ruter tegnet som fire hjørner. pdf-lib har ingen rotasjon på
          // rektangler, så formen settes sammen av linjer i stedet.
          const s = Math.min(5.4, radHoyde / 2 - 3);
          const f = hex(farge.fyll);
          side.drawLine({ start: { x, y: midt + s }, end: { x: x + s, y: midt }, thickness: 3.4, color: f });
          side.drawLine({ start: { x: x + s, y: midt }, end: { x, y: midt - s }, thickness: 3.4, color: f });
          side.drawLine({ start: { x, y: midt - s }, end: { x: x - s, y: midt }, thickness: 3.4, color: f });
          side.drawLine({ start: { x: x - s, y: midt }, end: { x, y: midt + s }, thickness: 3.4, color: f });

          // Datoen ved siden av romben. En milepæl er ett punkt i tid, og det
          // punktet er hele poenget — uten datoen må leseren peile symbolet mot
          // ukelinjen og gjette seg til dagen.
          // Året tas med når planen selv krysser nyttår. «26.03» alene kan da
          // være to helt ulike dager.
          const dato = trygg(naarTekst(a.start_date, a.start_date, true, !kryssarAar));
          const db = vanlig.widthOfTextAtSize(dato, 6.5);
          const hoyre = x + s + 3;
          const plassTilHoyre = BREDDE - MARG - hoyre >= db;
          side.drawText(dato, {
            x: plassTilHoyre ? hoyre : x - s - 3 - db, y: midt - 2.2,
            size: 6.5, font: fet, color: GRAA_700,
          });
        } else {
          const b = Math.max((p.bredde / 100) * tidBredde, 2.5);
          const bh = Math.min(radHoyde - 7, 13);
          side.drawRectangle({
            x, y: midt - bh / 2, width: b, height: bh,
            color: hex(farge.fyll), borderColor: hex(farge.kant), borderWidth: 0.7,
          });

          // Når den varer skrives på selve streken. Uten det må leseren følge
          // streken opp til aksen for hver rad, og det er nettopp tiden en
          // fremdriftsplan leses etter. Følger aktiviteten hele uker, står
          // ukenumrene der; er datoene satt midt i en uke, står datoene, slik
          // at filen sier det samme som skjermen.
          //
          // Er streken for smal, skrives teksten utenfor i stedet for å
          // forsvinne — en kort aktivitet er ikke en aktivitet uten tid.
          // «uke» sløyfes på selve streken når aksen viser uker: kolonnene sier
          // allerede at tallene er ukenumre, og plassen inne i en strek på to
          // uker er knapp. På en månedsakse må ordet stå — der ville «14-21»
          // like gjerne vært datoer.
          const raa = naarTekst(a.start_date, a.end_date || a.start_date, false, true);
          const merkelapp = trygg(akse.type === "uke" ? raa.replace(/^uke\s*/i, "") : raa);
          if (merkelapp) {
            const tb = fet.widthOfTextAtSize(merkelapp, 7);
            if (tb + 8 <= b) {
              // Hvit tekst, fordi fyllet er mørkt nok i alle åtte fargene.
              side.drawText(merkelapp, {
                x: x + b / 2 - tb / 2, y: midt - 2.4, size: 7, font: fet, color: rgb(1, 1, 1),
              });
            } else if (BREDDE - MARG - (x + b + 3) >= tb) {
              side.drawText(merkelapp, {
                x: x + b + 3, y: midt - 2.4, size: 7, font: fet, color: GRAA_700,
              });
            } else if (x - 3 - tb >= tidX) {
              side.drawText(merkelapp, {
                x: x - 3 - tb, y: midt - 2.4, size: 7, font: fet, color: GRAA_700,
              });
            }
          }
        }
      }

      side.drawLine({
        start: { x: MARG, y: radBunn }, end: { x: BREDDE - MARG, y: radBunn },
        thickness: 0.4, color: GRAA_200,
      });
      y = radBunn;
    });

    // De tomme radene: samme rutenett og samme striper, uten innhold.
    for (let t = 0; t < tomme; t++) {
      const idx = rader.length + t;
      const radTopp = y;
      const radBunn = y - radHoyde;
      if (idx % 2 === 1) {
        side.drawRectangle({ x: MARG, y: radBunn, width: NAVNEBREDDE, height: radHoyde, color: GRAA_100 });
      }
      akse.kolonner.forEach((k, kIdx) => {
        if (kIdx === 0) return;
        const x = tidX + kIdx * kolBredde;
        side.drawLine({
          start: { x, y: radTopp }, end: { x, y: radBunn },
          thickness: k.overskrift ? 0.7 : 0.4,
          color: k.overskrift ? GRAA_300 : GRAA_200,
        });
      });
      side.drawLine({
        start: { x: MARG, y: radBunn }, end: { x: BREDDE - MARG, y: radBunn },
        thickness: 0.4, color: GRAA_200,
      });
      y = radBunn;
    }

    // Skillet mellom navn og tidsakse går hele veien ned
    side.drawLine({
      start: { x: tidX, y: topp }, end: { x: tidX, y },
      thickness: 0.7, color: GRAA_300,
    });
    // Ramme rundt kalenderen, så diagrammet er et felt og ikke løse streker
    side.drawRectangle({
      x: MARG, y, width: BREDDE - 2 * MARG, height: topp - y,
      borderColor: GRAA_300, borderWidth: 0.5,
    });
    return y;
  };

  const tegnBunn = (side: PDFPage, sisteSide: boolean) => {
    const y = bunn - 22;

    if (sisteSide) {
      let x = MARG + 12;
      // Forklaringen skal vise det planen faktisk inneholder. «Milepæl» sto her
      // også når planen ikke hadde noen, og romben ble tegnet rød uansett — mens
      // en milepæl brukeren selv legger inn får sin egen farge i diagrammet.
      // Æ, ø og å ligger i WinAnsi, så norsk skrives som norsk — det er bare
      // tegn utenfor Latin-1 som må vike.
      //
      // Har milepælene ulike farger, får hver farge sin egen rombe, og teksten
      // står etter den siste av dem: forklaringen skal ikke påstå at de alle er
      // like.
      const oppforinger: Array<[string, string, boolean]> = [
        ...[...fag.entries()].map(([n, f]) => [n, f, false] as [string, string, boolean]),
        ...milepaelFarger.map((f, i) =>
          [i === milepaelFarger.length - 1 ? "Milepæl" : "", f, true] as [string, string, boolean]),
      ];
      // «Aktivitet» forklarer streken. Er alt i planen milepæler, finnes det
      // ingen strek å forklare, og oppføringen sløyfes på samme vilkår.
      if (!fag.size && medDato.some((a) => !a.is_milestone)) {
        oppforinger.unshift(["Aktivitet", finnFarge(null).fyll, false]);
      }

      // Forklaringen står i sitt eget felt. Som løse ruter på hvitt så den ut
      // som noe som var blitt til overs nederst på arket. Er det ingenting å
      // forklare — en tom plan har ingen farger — tegnes heller ikke feltet:
      // en tom grå stripe forklarer ingenting.
      if (oppforinger.length || akse?.type === "maaned") {
        side.drawRectangle({
          x: MARG, y: y - 7, width: BREDDE - 2 * MARG, height: 22,
          color: PANEL, borderColor: GRAA_200, borderWidth: 0.5,
        });
      }

      for (const [navn, fyll, erMilepael] of oppforinger) {
        const tekst = trygg(navn);
        if (erMilepael) {
          const m = y + 3.2;
          const s = 4;
          const cx = x + 5;
          const f = hex(fyll);
          side.drawLine({ start: { x: cx, y: m + s }, end: { x: cx + s, y: m }, thickness: 2.6, color: f });
          side.drawLine({ start: { x: cx + s, y: m }, end: { x: cx, y: m - s }, thickness: 2.6, color: f });
          side.drawLine({ start: { x: cx, y: m - s }, end: { x: cx - s, y: m }, thickness: 2.6, color: f });
          side.drawLine({ start: { x: cx - s, y: m }, end: { x: cx, y: m + s }, thickness: 2.6, color: f });
        } else {
          side.drawRectangle({ x, y: y - 0.5, width: 15, height: 7.5, color: hex(fyll) });
        }
        side.drawText(tekst, { x: x + 20, y, size: 7.5, font: vanlig, color: GRAA_600 });
        x += 20 + vanlig.widthOfTextAtSize(tekst, 7.5) + 16;
      }

      if (akse?.type === "maaned") {
        side.drawText("Tidsaksen viser måneder - planen er for lang til ukeinndeling", {
          x, y, size: 7, font: vanlig, color: GRAA_400,
        });
      }
    }

    const linjeY = 46;
    side.drawLine({ start: { x: MARG, y: linjeY }, end: { x: BREDDE - MARG, y: linjeY }, thickness: 0.5, color: GRAA_200 });
    // Samme røde strek som på toppen, i kort utgave. Den binder de to endene av
    // arket sammen og er igjen i dokumentmalen fra de andre PDF-ene.
    side.drawRectangle({ x: MARG, y: linjeY - 0.5, width: 46, height: 1.5, color: AKSENT });

    // Hvem man ringer. Navnet uthevet, resten i grått — nummeret er det som
    // faktisk skal brukes, og da skal det ikke drukne i orgnummeret.
    let fx = MARG;
    const firma = trygg(settings.company_name);
    side.drawText(firma, { x: fx, y: linjeY - 13, size: 7.5, font: fet, color: GRAA_600 });
    fx += fet.widthOfTextAtSize(firma, 7.5);
    const resten = [
      settings.company_org_nr ? `Org.nr ${settings.company_org_nr}` : "",
      settings.ref_name, settings.ref_phone, settings.ref_email,
    ].filter(Boolean).join("  |  ");
    if (resten) {
      side.drawText(klipp(`  |  ${resten}`, vanlig, 7.5, BREDDE - 2 * MARG - fx + MARG - 60), {
        x: fx, y: linjeY - 13, size: 7.5, font: vanlig, color: GRAA_400,
      });
    }
  };

  /**
   * Merknaden og lista over udaterte aktiviteter, under en tynn strek.
   *
   * `plass` er antall linjer som er regnet ut å være ledige her, ikke et
   * anslag. Måtte noe kuttes, skrives det — en tekst som stopper midt i en
   * setning uten et tegn på at det er mer, leses som hele forbeholdet.
   */
  const tegnMerknader = (side: PDFPage, topp: number, plass: number) => {
    side.drawLine({
      start: { x: MARG, y: topp + 8 }, end: { x: BREDDE - MARG, y: topp + 8 },
      thickness: 0.5, color: GRAA_200,
    });
    let y = topp;
    // De udaterte aktivitetene får sin linje reservert først. De er en kort,
    // avsluttet opplysning, og merknaden skal ikke kunne spise den opp.
    const tilMerknad = Math.max(0, plass - (udatertLinje ? 1 : 0));
    const vises = merknadLinjer.slice(0, tilMerknad);
    const kuttet = vises.length < merknadLinjer.length;
    const merke = " (fortsetter)";
    vises.forEach((linje, idx) => {
      const tekst = kuttet && idx === vises.length - 1
        ? klipp(linje, vanlig, 8, merknadBredde - vanlig.widthOfTextAtSize(merke, 8)) + merke
        : linje;
      side.drawText(tekst, { x: MARG, y, size: 8, font: vanlig, color: GRAA_600 });
      y -= MERKNADSLINJE;
    });
    if (udatertLinje) {
      side.drawText(udatertLinje, { x: MARG, y, size: 8, font: vanlig, color: GRAA_400 });
    }
  };

  sider.forEach((rader, idx) => {
    const side = doc.addPage([BREDDE, HOYDE]);
    const sisteSide = idx === sider.length - 1;
    const etterTopp = tegnTopp(side, idx + 1, idx === 0);
    const etterAkse = tegnAksehode(side, etterTopp);
    const etterRader = tegnRader(side, rader, etterAkse, sisteSide ? sisteGulv : bunn);

    if (sisteSide && merknadBehov && !egenMerknadsside) {
      const topp = etterRader - 14;
      tegnMerknader(side, topp, merknadPlass(topp));
    }

    tegnBunn(side, sisteSide);
  });

  // Fikk ikke merknaden plass mellom siste rad og tegnforklaringen, får den en
  // egen side. Å skyve den nedover hadde lagt teksten oppå fargerutene, og å la
  // resten falle bort hadde skjult nettopp de forbeholdene planen skal formidle.
  // Tegnforklaringen ble tegnet ferdig på siste diagramside, der den hører
  // hjemme, så denne siden får bare bunnlinjen.
  if (egenMerknadsside) {
    const side = doc.addPage([BREDDE, HOYDE]);
    const etterTopp = tegnTopp(side, antallSider, false);
    side.drawText("MERKNADER", { x: MARG, y: etterTopp - 10, size: 6, font: vanlig, color: GRAA_400 });
    const topp = etterTopp - 30;
    tegnMerknader(side, topp, merknadPlass(topp));
    tegnBunn(side, false);
  }

  return await doc.save();
}

/** Filnavn uten tegn som volder trøbbel i nedlasting og lagring. */
export function fremdriftsplanFilnavn(plan: PlanDokument): string {
  const rent = trygg(plan.title || "fremdriftsplan")
    .replace(/[^\wæøåÆØÅ\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "fremdriftsplan";
  const rev = plan.revision ? `-rev${trygg(plan.revision).replace(/\s+/g, "")}` : "";
  return `Fremdriftsplan-${rent}${rev}.pdf`;
}
