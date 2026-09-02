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
import { lagTidsakse, plassering, planPeriode, isoUke, parseDato, tilDato, finnFarge } from "./fremdrift.ts";

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
const NAVNEBREDDE = 196;
const RADHOYDE = 17.5;

const BLEKK = rgb(0.04, 0.04, 0.04);
const GRAA_600 = rgb(0.27, 0.27, 0.28);
const GRAA_400 = rgb(0.48, 0.48, 0.51);
const GRAA_300 = rgb(0.78, 0.78, 0.8);
const GRAA_200 = rgb(0.9, 0.9, 0.9);
const GRAA_100 = rgb(0.96, 0.96, 0.95);
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
 * «36-42» eller «36» — skrives på streken, så plassen er knapp og «uke»
 * utelates. Krysser spennet et årsskifte, blir året med: «45-12 (2027)».
 * Uke 12 alene er umulig å tidfeste på en plan som går over nyttår.
 */
const ukeMerkelapp = (startISO?: string | null, sluttISO?: string | null): string => {
  const s = parseDato(startISO);
  if (!s) return "";
  const e = parseDato(sluttISO) ?? s;
  const a = isoUke(s);
  const b = isoUke(e);
  const spenn = a.uke === b.uke && a.aar === b.aar ? String(a.uke) : `${a.uke}-${b.uke}`;
  return a.aar === b.aar ? spenn : `${spenn} (${b.aar})`;
};

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
  const bunn = 74;
  const AKSEHODE = 25;
  const raderStart = (forste: boolean) =>
    HOYDE - MARG - 16 - 22 - 26 - (forste ? 34 : 0) - AKSEHODE;
  const raderForste = Math.floor((raderStart(true) - bunn) / RADHOYDE);
  const raderSenere = Math.floor((raderStart(false) - bunn) / RADHOYDE);

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
  const merknadTopp = (forste: boolean, antallRader: number) =>
    Math.min(raderStart(forste) - antallRader * RADHOYDE - 14, bunn + 34);
  const merknadPlass = (topp: number) => Math.floor((topp - bunn) / MERKNADSLINJE) + 1;

  const merknadLinjer = plan.notes ? brytLinjer(plan.notes, vanlig, 8, merknadBredde) : [];
  const udatertLinje = utenDato.length
    ? klipp(`Uten dato, ikke tegnet inn: ${utenDato.map((a) => a.name).join(", ")}`, vanlig, 8, merknadBredde)
    : "";
  const merknadBehov = merknadLinjer.length + (udatertLinje ? 1 : 0);

  // Får ikke hele merknaden plass nederst på siste side, flyttes den til en
  // egen side i stedet for å bli kuttet etter to linjer. Forbehold og
  // forutsetninger er nettopp det byggherren må lese, og en tekst som stopper
  // uten et tegn på at det er mer, leses som om det var hele forbeholdet.
  const sisteTopp = merknadTopp(sider.length === 1, sider[sider.length - 1].length);
  const egenMerknadsside = merknadBehov > 0 && merknadBehov > merknadPlass(sisteTopp);
  const antallSider = sider.length + (egenMerknadsside ? 1 : 0);

  const naa = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date()).replace(",", " ");

  const periodeTekst = akse
    ? `Uke ${isoUke(akse.fra).uke} - uke ${isoUke(new Date(akse.til.getTime() - 86400000)).uke}`
    : "Ingen datoer lagt inn";

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
      const b = (logo.width / logo.height) * h;
      side.drawImage(logo, { x: MARG, y: y - 8, width: b, height: h });
      tekstX = MARG + b + 10;
    }

    side.drawText(trygg(settings.company_name), { x: tekstX, y, size: 13, font: fet, color: BLEKK });
    if (settings.company_tagline) {
      side.drawText(trygg(settings.company_tagline), {
        x: tekstX, y: y - 11, size: 7.5, font: vanlig, color: GRAA_400,
      });
    }

    // «FREMDRIFTS» i svart, «PLAN» i rødt — samme grep som de andre dokumentene
    const del1 = "FREMDRIFTS";
    const del2 = "PLAN";
    const st = 18;
    const b2 = fet.widthOfTextAtSize(del2, st);
    const b1 = fet.widthOfTextAtSize(del1, st);
    side.drawText(del1, { x: BREDDE - MARG - b1 - b2, y, size: st, font: fet, color: BLEKK });
    side.drawText(del2, { x: BREDDE - MARG - b2, y, size: st, font: fet, color: AKSENT });
    const under = klipp(plan.title || "Uten tittel", vanlig, 8.5, 320);
    side.drawText(under, {
      x: BREDDE - MARG - vanlig.widthOfTextAtSize(under, 8.5), y: y - 12, size: 8.5, font: vanlig, color: GRAA_400,
    });
    y -= 26;

    if (forste) {
      side.drawLine({ start: { x: MARG, y }, end: { x: BREDDE - MARG, y }, thickness: 0.5, color: GRAA_200 });
      const felt: Array<[string, string]> = [
        ["PROSJEKT", plan.project_ref || plan.offer_title || "-"],
        ["TILBUD", plan.offer_number ? `#${plan.offer_number}` : "-"],
        ["BYGGHERRE", plan.customer_name || "-"],
        ["PERIODE", periodeTekst],
        ["AKTIVITETER", String(medDato.length)],
        ["REVISJON", plan.revision || "-"],
        ["PLANDATO", fmtDato(plan.plan_date)],
      ];
      let x = MARG;
      for (const [merkelapp, verdi] of felt) {
        const bredde = Math.max(
          vanlig.widthOfTextAtSize(merkelapp, 6) + 6,
          fet.widthOfTextAtSize(trygg(verdi), 8.5) + 6,
        );
        side.drawText(merkelapp, { x, y: y - 11, size: 6, font: vanlig, color: GRAA_400 });
        side.drawText(klipp(verdi, fet, 8.5, 150), { x, y: y - 23, size: 8.5, font: fet, color: BLEKK });
        x += Math.min(bredde, 156) + 14;
      }
      y -= 30;
      side.drawLine({ start: { x: MARG, y }, end: { x: BREDDE - MARG, y }, thickness: 0.5, color: GRAA_200 });
      y -= 4;
    }
    return y;
  };

  const tegnAksehode = (side: PDFPage, y: number) => {
    if (!akse) return y - 18;
    const kolBredde = tidBredde / akse.kolonner.length;

    side.drawText("AKTIVITET", { x: MARG, y: y - 16, size: 6, font: vanlig, color: GRAA_400 });

    akse.kolonner.forEach((k, idx) => {
      const x = tidX + idx * kolBredde;
      if (k.overskrift) {
        side.drawText(trygg(k.overskrift.toUpperCase()), {
          x: x + 1, y: y - 8, size: 6.5, font: fet, color: GRAA_400,
        });
      }
      const etikett = trygg(k.etikett);
      const b = vanlig.widthOfTextAtSize(etikett, 6.5);
      side.drawText(etikett, {
        x: x + kolBredde / 2 - b / 2, y: y - 20, size: 6.5, font: vanlig, color: GRAA_600,
      });
    });

    const linjeY = y - 25;
    side.drawLine({
      start: { x: MARG, y: linjeY }, end: { x: BREDDE - MARG, y: linjeY },
      thickness: 1.2, color: BLEKK,
    });
    return linjeY;
  };

  const tegnRader = (side: PDFPage, rader: PlanAktivitet[], topp: number) => {
    if (!akse) return topp;
    const kolBredde = tidBredde / akse.kolonner.length;
    let y = topp;

    rader.forEach((a, idx) => {
      const radTopp = y;
      const radBunn = y - RADHOYDE;

      if (idx % 2 === 1) {
        side.drawRectangle({
          x: MARG, y: radBunn, width: BREDDE - 2 * MARG, height: RADHOYDE, color: GRAA_100,
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
        x: MARG, y: radBunn + 4, width: 3, height: RADHOYDE - 8, color: hex(farge.fyll),
      });

      const navnPlass = NAVNEBREDDE - 12 - (a.responsible ? 78 : 0);
      side.drawText(klipp(a.name || "-", fet, 8, navnPlass), {
        x: MARG + 8, y: radBunn + 5.5, size: 8, font: fet, color: BLEKK,
      });
      if (a.responsible) {
        const r = klipp(a.responsible, vanlig, 7, 74);
        side.drawText(r, {
          x: tidX - 6 - vanlig.widthOfTextAtSize(r, 7), y: radBunn + 5.5,
          size: 7, font: vanlig, color: GRAA_400,
        });
      }

      const p = plassering(akse, a.start_date, a.end_date);
      if (p) {
        const x = tidX + (p.venstre / 100) * tidBredde;
        if (a.is_milestone) {
          // Ruter tegnet som fire hjørner. pdf-lib har ingen rotasjon på
          // rektangler, så formen settes sammen av linjer i stedet.
          const m = radBunn + RADHOYDE / 2;
          const s = 4.6;
          side.drawLine({ start: { x, y: m + s }, end: { x: x + s, y: m }, thickness: 3.2, color: hex(farge.fyll) });
          side.drawLine({ start: { x: x + s, y: m }, end: { x, y: m - s }, thickness: 3.2, color: hex(farge.fyll) });
          side.drawLine({ start: { x, y: m - s }, end: { x: x - s, y: m }, thickness: 3.2, color: hex(farge.fyll) });
          side.drawLine({ start: { x: x - s, y: m }, end: { x, y: m + s }, thickness: 3.2, color: hex(farge.fyll) });
        } else {
          const b = Math.max((p.bredde / 100) * tidBredde, 2.5);
          side.drawRectangle({
            x, y: radBunn + 3.5, width: b, height: RADHOYDE - 7,
            color: hex(farge.fyll), borderColor: hex(farge.kant), borderWidth: 0.7,
          });

          // Ukene skrives på selve streken når den er bred nok. Uten det må
          // leseren følge streken opp til aksen for hver rad, og det er nettopp
          // ukene en fremdriftsplan leses etter. Hvit tekst, fordi fyllet er
          // mørkt nok i alle åtte fargene.
          const merkelapp = trygg(ukeMerkelapp(a.start_date, a.end_date));
          const tb = fet.widthOfTextAtSize(merkelapp, 7);
          if (merkelapp && tb + 8 <= b) {
            side.drawText(merkelapp, {
              x: x + b / 2 - tb / 2,
              y: radBunn + RADHOYDE / 2 - 2.4,
              size: 7,
              font: fet,
              color: rgb(1, 1, 1),
            });
          }
        }
      }

      side.drawLine({
        start: { x: MARG, y: radBunn }, end: { x: BREDDE - MARG, y: radBunn },
        thickness: 0.4, color: GRAA_200,
      });
      y = radBunn;
    });

    // Skillet mellom navn og tidsakse går hele veien ned
    side.drawLine({
      start: { x: tidX, y: topp }, end: { x: tidX, y },
      thickness: 0.7, color: GRAA_300,
    });
    return y;
  };

  const tegnBunn = (side: PDFPage, sisteSide: boolean) => {
    let y = bunn - 12;

    if (sisteSide) {
      let x = MARG;
      const oppforinger: Array<[string, string | null]> = [
        ...[...fag.entries()].map(([n, f]) => [n, f] as [string, string]),
        // Æ, ø og å ligger i WinAnsi, så norsk skrives som norsk — det er bare
        // tegn utenfor Latin-1 som må vike.
        ["Milepæl", null],
      ];
      if (!fag.size) oppforinger.unshift(["Aktivitet", finnFarge(null).fyll]);

      for (const [navn, fyll] of oppforinger) {
        const tekst = trygg(navn);
        if (fyll) {
          side.drawRectangle({ x, y: y + 1, width: 13, height: 5.5, color: hex(fyll) });
        } else {
          const m = y + 3.7;
          const s = 3.4;
          const cx = x + 5;
          side.drawLine({ start: { x: cx, y: m + s }, end: { x: cx + s, y: m }, thickness: 2.4, color: AKSENT });
          side.drawLine({ start: { x: cx + s, y: m }, end: { x: cx, y: m - s }, thickness: 2.4, color: AKSENT });
          side.drawLine({ start: { x: cx, y: m - s }, end: { x: cx - s, y: m }, thickness: 2.4, color: AKSENT });
          side.drawLine({ start: { x: cx - s, y: m }, end: { x: cx, y: m + s }, thickness: 2.4, color: AKSENT });
        }
        side.drawText(tekst, { x: x + 17, y, size: 7, font: vanlig, color: GRAA_600 });
        x += 17 + vanlig.widthOfTextAtSize(tekst, 7) + 14;
      }

      if (akse?.type === "maaned") {
        side.drawText("Tidsaksen viser måneder — planen er for lang til ukeinndeling", {
          x, y, size: 7, font: vanlig, color: GRAA_400,
        });
      }
    }

    const linjeY = 46;
    side.drawLine({ start: { x: MARG, y: linjeY }, end: { x: BREDDE - MARG, y: linjeY }, thickness: 0.5, color: GRAA_200 });

    const deler = [
      settings.company_name,
      settings.company_org_nr ? `Org.nr ${settings.company_org_nr}` : "",
      settings.ref_name, settings.ref_phone, settings.ref_email,
    ].filter(Boolean).join("  |  ");
    side.drawText(klipp(deler, vanlig, 7, BREDDE - 2 * MARG - 150), {
      x: MARG, y: linjeY - 12, size: 7, font: vanlig, color: GRAA_400,
    });
    const utTekst = `Skrevet ut ${naa}`;
    side.drawText(trygg(utTekst), {
      x: BREDDE - MARG - vanlig.widthOfTextAtSize(trygg(utTekst), 7),
      y: linjeY - 12, size: 7, font: vanlig, color: GRAA_400,
    });
  };

  sider.forEach((rader, idx) => {
    const side = doc.addPage([BREDDE, HOYDE]);
    const etterTopp = tegnTopp(side, idx + 1, idx === 0);
    const etterAkse = tegnAksehode(side, etterTopp);
    const etterRader = tegnRader(side, rader, etterAkse);
    const sisteSide = idx === sider.length - 1;

    if (sisteSide && (plan.notes || utenDato.length)) {
      let y = Math.min(etterRader - 14, bunn + 34);
      side.drawLine({ start: { x: MARG, y: y + 8 }, end: { x: BREDDE - MARG, y: y + 8 }, thickness: 0.5, color: GRAA_200 });
      if (plan.notes) {
        // Merknader kan være lange; de brytes på ordgrense over inntil to linjer
        const ord = trygg(plan.notes).replace(/\s+/g, " ").split(" ");
        let linje = "";
        let brukt = 0;
        for (const o of ord) {
          const prov = linje ? `${linje} ${o}` : o;
          if (vanlig.widthOfTextAtSize(prov, 8) > BREDDE - 2 * MARG) {
            side.drawText(linje, { x: MARG, y, size: 8, font: vanlig, color: GRAA_600 });
            y -= 10;
            linje = o;
            if (++brukt >= 2) break;
          } else linje = prov;
        }
        if (linje && brukt < 2) {
          side.drawText(linje, { x: MARG, y, size: 8, font: vanlig, color: GRAA_600 });
          y -= 10;
        }
      }
      if (utenDato.length) {
        const tekst = `Uten dato, ikke tegnet inn: ${utenDato.map((a) => a.name).join(", ")}`;
        side.drawText(klipp(tekst, vanlig, 8, BREDDE - 2 * MARG), {
          x: MARG, y, size: 8, font: vanlig, color: GRAA_400,
        });
      }
    }

    tegnBunn(side, sisteSide);
  });

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
