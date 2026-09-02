// Fremdriftsplanen som PDF.
//
// Ligger i en egen fil fordi den er et annet dokument enn de tre andre: liggende
// A4 i stedet for stående, en tidsakse i stedet for en beløpskolonne, og ingen
// summer i bunnen. Å presse den inn i PDF_STYLES ville gjort den delte CSS-en
// vanskeligere å endre uten å ødelegge noe.
//
// Sideinndelingen regnes ut på forhånd i stedet for å overlates til
// reflow-skriptet. En Gantt må gjenta tidsaksen øverst på hver side — uten den
// er stripene på side to umulige å tidfeste — og det er enklere å gjøre riktig
// når vi selv bestemmer hvor bruddet går.

import { escapeHtml } from "./format.ts";
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

/** Så mange aktivitetsrader får plass under tidsaksen på et liggende A4. */
const RADER_PER_SIDE = 18;

const fmtDato = (s?: string | null) => {
  const d = parseDato(s);
  if (!d) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};

const STILER = `
  :root {
    --ink:       #0A0A0A;
    --slate-600: #444448;
    --slate-500: #5A5A60;
    --slate-400: #7A7A82;
    --slate-300: #C7C7CC;
    --slate-200: #E5E5E5;
    --slate-100: #F5F5F2;
    --paper:     #FFFFFF;
    --accent:    #E30613;
    --bar:       #2E2E33;
    --bar-mile:  #E30613;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Archivo', -apple-system, system-ui, sans-serif;
    background: #ECECE7;
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    line-height: 1.45;
  }
  .page {
    width: 297mm;
    height: 210mm;
    margin: 24px auto;
    background: var(--paper);
    box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 24px 60px rgba(20,20,20,.18);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 12mm 14mm 10mm 14mm;
  }
  .masthead { position: relative; padding-top: 5mm; margin-bottom: 6mm; }
  .masthead::before {
    content: ""; position: absolute; left: 0; right: 0; top: 0;
    height: 3px; background: var(--accent);
  }
  .top-meta {
    display: flex; justify-content: space-between;
    font-variant-numeric: tabular-nums; font-size: 6.5pt;
    letter-spacing: 0.2em; color: var(--slate-600);
    text-transform: uppercase; margin-bottom: 4mm;
  }
  .mast-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm; }
  .brand { display: flex; align-items: center; gap: 4mm; }
  .brand img { height: 11mm; width: auto; object-fit: contain; }
  .brand .company { font-weight: 800; font-size: 11pt; letter-spacing: -0.01em; margin: 0; }
  .brand .tag { font-size: 7pt; color: var(--slate-500); margin: 0; letter-spacing: .04em; }
  .doc-kind {
    font-size: 17pt; font-weight: 900; letter-spacing: -0.02em;
    line-height: 1; text-align: right; margin: 0;
  }
  .doc-kind .accent { color: var(--accent); }
  .doc-sub {
    font-size: 8pt; color: var(--slate-500); text-align: right;
    margin-top: 1.5mm; font-variant-numeric: tabular-nums;
  }
  .meta-strip {
    display: flex; gap: 8mm; flex-wrap: wrap;
    border-top: 1px solid var(--slate-200);
    border-bottom: 1px solid var(--slate-200);
    padding: 2.5mm 0; margin-bottom: 4mm;
  }
  .meta-strip .m-label {
    font-size: 6pt; letter-spacing: .18em; text-transform: uppercase;
    color: var(--slate-400); margin: 0;
  }
  .meta-strip .m-value {
    font-size: 8.5pt; font-weight: 600; margin: 0;
    font-variant-numeric: tabular-nums;
  }

  /* ─── Selve planen ─── */
  .gantt { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .g-head { display: flex; border-bottom: 1.5px solid var(--ink); }
  /* Radene og «i dag»-streken ligger oppå hverandre. Streken må dekke hele
     høyden av tabellen, og kan derfor ikke ligge inne i en enkelt rad. */
  .g-body { flex: 1; position: relative; min-height: 0; }
  .g-rows { }
  .g-overlay {
    position: absolute; left: 78mm; right: 0; top: 0; bottom: 0;
    pointer-events: none;
  }
  .g-row { display: flex; border-bottom: 1px solid var(--slate-200); height: 6.8mm; }
  .g-row.stripe { background: var(--slate-100); }

  /* Skillet mellom navn og tidsakse skal være tydelig — uten det flyter lange
     aktivitetsnavn visuelt inn i første ukekolonne. */
  .g-left {
    width: 78mm; flex-shrink: 0; display: flex; align-items: center;
    padding-right: 3mm; border-right: 1px solid var(--slate-300);
    margin-right: 0;
  }
  .g-left .merke {
    width: 1.6mm; height: 4mm; border-radius: 0.4mm;
    margin-right: 2mm; flex-shrink: 0;
  }
  .g-left .navn {
    font-size: 8pt; font-weight: 600; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .g-left .ansvar {
    font-size: 7pt; color: var(--slate-500); margin-left: auto;
    padding-left: 2mm; white-space: nowrap; flex-shrink: 0;
  }
  .g-head .g-left { align-items: flex-end; padding-bottom: 1.5mm; }
  .g-head .g-left span {
    font-size: 6pt; letter-spacing: .18em; text-transform: uppercase; color: var(--slate-400);
  }

  .g-time { flex: 1; position: relative; min-width: 0; }
  /* Rutenettet tegnes én gang per rad som en bakgrunn av loddrette streker */
  .g-grid { position: absolute; inset: 0; display: flex; }
  .g-grid .col { flex: 1; border-right: 1px solid var(--slate-200); }
  .g-grid .col:last-child { border-right: none; }
  /* Første kolonne i en ny måned får en kraftigere venstrekant, så øyet finner
     månedsskiftet uten å lese overskriften. */
  .g-grid .col.maaned-skift { border-left: 1px solid var(--slate-400); }

  .g-head .g-time { display: flex; flex-direction: column; }
  .g-head .over { display: flex; height: 4mm; }
  .g-head .over .col {
    flex: 1; font-size: 6.5pt; font-weight: 700; color: var(--slate-500);
    text-transform: uppercase; letter-spacing: .1em; padding-left: 0.6mm;
    white-space: nowrap; overflow: visible;
  }
  .g-head .uker { display: flex; height: 5mm; align-items: flex-end; }
  .g-head .uker .col {
    flex: 1; text-align: center; font-size: 6.5pt; font-weight: 600;
    font-variant-numeric: tabular-nums; color: var(--slate-600);
    border-right: 1px solid var(--slate-200); padding-bottom: 1mm;
  }
  .g-head .uker .col:last-child { border-right: none; }

  .bar {
    position: absolute; top: 1.3mm; height: 4mm;
    border-radius: 0.8mm; border: 0.4mm solid;
  }
  .mile {
    position: absolute; top: 1.4mm; width: 3.8mm; height: 3.8mm;
    transform: rotate(45deg); margin-left: -1.9mm;
    border: 0.3mm solid;
  }
  /* Dagens dato. Bare til intern lesing — på et tilbudsvedlegg er den mest
     nyttig når planen gjennomgås i møte. */
  .idag { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed var(--accent); }
  .idag::after {
    content: "i dag"; position: absolute; top: -4.6mm; left: 1mm;
    font-size: 5.5pt; color: var(--accent); font-weight: 700;
    letter-spacing: .1em; text-transform: uppercase;
  }

  .notat {
    margin-top: 4mm; border-top: 1px solid var(--slate-200); padding-top: 2.5mm;
    font-size: 8pt; color: var(--slate-600); white-space: pre-wrap;
  }
  .tegnforklaring {
    display: flex; gap: 6mm; align-items: center; margin-top: 3mm;
    font-size: 7pt; color: var(--slate-500);
  }
  .tegnforklaring .prove { display: inline-block; width: 6mm; height: 2.4mm; background: var(--bar); border-radius: 1.2mm; margin-right: 1.5mm; vertical-align: middle; }
  /* position: static er nødvendig — uten den arver denne 'position: absolute'
     fra .mile-regelen over, og tegnforklaringens symbol havnet da øverst på
     siden i stedet for ved siden av teksten sin. */
  .tegnforklaring .prove.mile {
    position: static; width: 2.6mm; height: 2.6mm; background: var(--bar-mile);
    border-radius: 0; transform: rotate(45deg); border: none;
  }
  .tegnforklaring .gruppe { display: flex; gap: 5mm; flex-wrap: wrap; align-items: center; }

  .footer {
    margin-top: auto; padding-top: 3mm; border-top: 1px solid var(--slate-200);
    display: flex; justify-content: space-between; align-items: flex-end;
    font-size: 7pt; color: var(--slate-500);
  }
  .footer .ft-v { color: var(--ink); font-weight: 500; }

  @page { size: A4 landscape; margin: 0mm; }
  @media print {
    body { background: none; }
    .page {
      margin: 0; box-shadow: none;
      page-break-after: always; break-after: page;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
  }
`;

/**
 * Bygger dokumentet som HTML.
 *
 * Skilt fra åpningen av vinduet med vilje: da kan sidedelingen og
 * strekplasseringen etterprøves uten en nettleser, og det er nettopp den delen
 * som er lett å få subtilt galt.
 */
export function byggProgressPlanHtml(
  plan: PlanDokument,
  aktiviteter: PlanAktivitet[],
  settings: PlanInnstillinger,
): string {
  // Bare aktiviteter med en startdato kan tegnes. De andre ville blitt en tom
  // rad uten strek, og da er det bedre å si fra enn å vise et hull.
  const medDato = aktiviteter.filter((a) => parseDato(a.start_date));
  const utenDato = aktiviteter.filter((a) => !parseDato(a.start_date));

  const periode = planPeriode(medDato);
  const akse = periode ? lagTidsakse(periode.start, periode.slutt) : null;

  const logoUrl = escapeHtml(settings.logo_url || "");
  const iDag = tilDato(new Date());
  const iDagPlass = akse ? plassering(akse, iDag, iDag) : null;

  const nowStr = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date()).replace(",", " ·");

  const rutenett = akse
    ? `<div class="g-grid">${akse.kolonner
        .map((k) => `<div class="col${k.overskrift ? " maaned-skift" : ""}"></div>`)
        .join("")}</div>`
    : "";

  const aksehode = akse
    ? `<div class="g-time">
         <div class="over">${akse.kolonner
           .map((k) => `<div class="col">${escapeHtml(k.overskrift)}</div>`)
           .join("")}</div>
         <div class="uker">${akse.kolonner
           .map((k) => `<div class="col">${escapeHtml(k.etikett)}</div>`)
           .join("")}</div>
       </div>`
    : `<div class="g-time"></div>`;

  const radHtml = (a: PlanAktivitet, i: number) => {
    const p = akse ? plassering(akse, a.start_date, a.end_date) : null;
    const farge = finnFarge(a.color);
    // Fyll og kant settes på elementet, ikke i CSS-en: fargen er data, og en
    // klasse per farge ville betydd at nye farger krever endring to steder.
    const stil = `background:${farge.fyll};border-color:${farge.kant}`;
    const merke = !p
      ? ""
      : a.is_milestone
        ? `<div class="mile" style="left:${p.venstre.toFixed(3)}%;${stil}"></div>`
        : `<div class="bar" style="left:${p.venstre.toFixed(3)}%;width:${Math.max(p.bredde, 0.6).toFixed(3)}%;${stil}"></div>`;
    return `<div class="g-row${i % 2 === 1 ? " stripe" : ""}">
      <div class="g-left">
        <span class="merke" style="background:${farge.fyll}"></span>
        <span class="navn">${escapeHtml(a.name) || "—"}</span>
        ${a.responsible ? `<span class="ansvar">${escapeHtml(a.responsible)}</span>` : ""}
      </div>
      <div class="g-time">${rutenett}${merke}</div>
    </div>`;
  };

  // Tegnforklaringen bygges av fagene som faktisk er i bruk. En fast liste over
  // alle åtte fargene ville stått med seks farger ingen har brukt, og da slutter
  // man å lese den. Rekkefølgen følger planen, ikke alfabetet — det er den
  // rekkefølgen leseren møter fargene i.
  // Milepæler holdes utenfor: rutersymbolet sier alt allerede, og tar man dem
  // med, står «Milepæl» to ganger i forklaringen.
  const fag = new Map<string, string>();
  for (const a of medDato) {
    if (a.is_milestone) continue;
    const navn = String(a.category ?? "").trim();
    if (navn && !fag.has(navn)) fag.set(navn, finnFarge(a.color).fyll);
  }
  const fagforklaring = fag.size
    ? [...fag.entries()]
        .map(([navn, fyll]) => `<span><span class="prove" style="background:${fyll}"></span>${escapeHtml(navn)}</span>`)
        .join("")
    : `<span><span class="prove"></span>Aktivitet</span>`;

  // Del i sider på forhånd — tidsaksen må stå øverst på hver av dem
  const sider: PlanAktivitet[][] = [];
  for (let i = 0; i < medDato.length; i += RADER_PER_SIDE) {
    sider.push(medDato.slice(i, i + RADER_PER_SIDE));
  }
  if (!sider.length) sider.push([]);

  const periodeTekst = akse
    ? `Uke ${isoUke(akse.fra).uke} – uke ${isoUke(new Date(akse.til.getTime() - 86400000)).uke}`
    : "Ingen datoer lagt inn";

  const metaFelt: Array<[string, string]> = [
    ["Prosjekt", plan.project_ref || plan.offer_title || "—"],
    ["Tilbud", plan.offer_number ? `#${plan.offer_number}` : "—"],
    ["Byggherre", plan.customer_name || "—"],
    ["Periode", periodeTekst],
    ["Aktiviteter", String(medDato.length)],
    ["Revisjon", plan.revision || "—"],
    ["Plandato", fmtDato(plan.plan_date)],
  ];

  const sideHtml = (rader: PlanAktivitet[], nr: number, av: number) => `
<div class="page">
  <div class="masthead">
    <div class="top-meta">
      <span>${escapeHtml(settings.company_name)}</span>
      <span>Side ${nr} av ${av}</span>
    </div>
    <div class="mast-row">
      <div class="brand">
        ${logoUrl ? `<img src="${logoUrl}" alt="" />` : ""}
        <div>
          <p class="company">${escapeHtml(settings.company_name)}</p>
          ${settings.company_tagline ? `<p class="tag">${escapeHtml(settings.company_tagline)}</p>` : ""}
        </div>
      </div>
      <div>
        <p class="doc-kind">FREMDRIFTS<span class="accent">PLAN</span></p>
        <p class="doc-sub">${escapeHtml(plan.title) || "Uten tittel"}</p>
      </div>
    </div>
  </div>

  ${nr === 1 ? `<div class="meta-strip">
    ${metaFelt.map(([l, v]) => `<div><p class="m-label">${escapeHtml(l)}</p><p class="m-value">${escapeHtml(v)}</p></div>`).join("")}
  </div>` : ""}

  <div class="gantt">
    <div class="g-head">
      <div class="g-left"><span>Aktivitet</span></div>
      ${aksehode}
    </div>
    <div class="g-body">
      <div class="g-rows">
        ${rader.length
          ? rader.map((a, i) => radHtml(a, i)).join("")
          : `<div class="g-row"><div class="g-left"><span class="navn" style="color:#7A7A82;font-weight:400">Ingen aktiviteter med dato</span></div><div class="g-time">${rutenett}</div></div>`}
      </div>
      ${iDagPlass && rader.length
        ? `<div class="g-overlay"><div class="idag" style="left:${iDagPlass.venstre.toFixed(3)}%"></div></div>`
        : ""}
    </div>

    <div class="tegnforklaring">
      <div class="gruppe">
        ${fagforklaring}
        <span><span class="prove mile"></span>Milepæl</span>
      </div>
      ${akse?.type === "maaned" ? `<span>Tidsaksen viser måneder — planen er for lang til ukeinndeling</span>` : ""}
    </div>

    ${nr === av && (plan.notes || utenDato.length)
      ? `<div class="notat">${
          plan.notes ? escapeHtml(plan.notes) : ""
        }${
          utenDato.length
            ? `${plan.notes ? "\n\n" : ""}Uten dato, ikke tegnet inn: ${escapeHtml(utenDato.map((a) => a.name).filter(Boolean).join(", "))}`
            : ""
        }</div>`
      : ""}
  </div>

  <div class="footer">
    <div>
      <span class="ft-v">${escapeHtml(settings.company_name)}</span>
      ${settings.company_org_nr ? ` · Org.nr ${escapeHtml(settings.company_org_nr)}` : ""}
      ${settings.ref_name ? ` · ${escapeHtml(settings.ref_name)}` : ""}
      ${settings.ref_phone ? ` · ${escapeHtml(settings.ref_phone)}` : ""}
      ${settings.ref_email ? ` · ${escapeHtml(settings.ref_email)}` : ""}
    </div>
    <div>Skrevet ut ${escapeHtml(nowStr)}</div>
  </div>
</div>`;

  const html = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8" />
<title>Fremdriftsplan – ${escapeHtml(plan.title || settings.company_name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>${STILER}</style>
</head>
<body>
${sider.map((rader, i) => sideHtml(rader, i + 1, sider.length)).join("\n")}
<script>
  // Vent på fonten før utskrift. Uten dette måles kolonnebreddene med
  // reservefonten, og ukenumrene kan da havne så vidt utenfor sin egen kolonne.
  (function () {
    var skrivUt = function () { setTimeout(function () { window.print(); }, 250); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(skrivUt);
    else window.addEventListener('load', skrivUt);
  })();
</script>
</body>
</html>`;

  return html;
}

export function openProgressPlanPdf(
  plan: PlanDokument,
  aktiviteter: PlanAktivitet[],
  settings: PlanInnstillinger,
  targetWin?: Window | null,
) {
  const win = targetWin ?? window.open("", "_blank", "width=1400,height=1000");
  if (!win) return false;
  win.document.write(byggProgressPlanHtml(plan, aktiviteter, settings));
  win.document.close();
  return true;
}
