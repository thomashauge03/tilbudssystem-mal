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
import { lagTidsakse, plassering, planPeriode, isoUke, parseDato, finnFarge } from "./fremdrift.ts";
import type { PlanAktivitet, PlanDokument, PlanInnstillinger } from "./pdf-fremdrift.ts";

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

const fmtDato = (s?: string | null) => {
  const d = parseDato(s);
  if (!d) return "-";
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};

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

  const medDato = aktiviteter.filter((a) => parseDato(a.start_date));
  const utenDato = aktiviteter.filter((a) => !parseDato(a.start_date) && String(a.name ?? "").trim());
  const periode = planPeriode(medDato);
  const akse = periode ? lagTidsakse(periode.start, periode.slutt) : null;

  const tidX = MARG + NAVNEBREDDE;
  const tidBredde = BREDDE - MARG - tidX;

  // Fagene som faktisk er i bruk. Milepæler holdes utenfor — rutersymbolet
  // sier alt allerede.
  const fag = new Map<string, string>();
  for (const a of medDato) {
    if (a.is_milestone) continue;
    const navn = String(a.category ?? "").trim();
    if (navn && !fag.has(navn)) fag.set(navn, finnFarge(a.color).fyll);
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
    const sideTekst = `SIDE ${sideNr} AV ${sider.length}`;
    side.drawText(sideTekst, {
      x: BREDDE - MARG - vanlig.widthOfTextAtSize(sideTekst, 6.5), y, size: 6.5, font: vanlig, color: GRAA_600,
    });
    y -= 22;

    side.drawText(trygg(settings.company_name), { x: MARG, y, size: 13, font: fet, color: BLEKK });
    if (settings.company_tagline) {
      side.drawText(trygg(settings.company_tagline), {
        x: MARG, y: y - 11, size: 7.5, font: vanlig, color: GRAA_400,
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
