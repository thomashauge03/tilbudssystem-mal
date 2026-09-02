import { offerHasDeadline, escapeHtml } from "@/lib/format";

export { escapeHtml };

export function openPrintPdf(title: string, bodyHtml: string) {
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="nb"><head><meta charset="utf-8"/>
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 18mm 16mm; }
      body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a2e; font-size: 11pt; line-height: 1.45; }
      h1 { margin: 0; font-size: 22pt; letter-spacing: -0.02em; color: #1e3a8a; }
      h2 { font-size: 13pt; margin: 18px 0 6px; color: #1e3a8a; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 18px; }
      .meta { font-size: 9.5pt; color: #444; text-align: right; }
      .meta div { margin-bottom: 2px; }
      .box { background: #f5f7fb; border: 1px solid #e4e8f2; border-radius: 6px; padding: 10px 12px; margin: 12px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10pt; }
      th { text-align: left; background: #1e3a8a; color: white; padding: 8px 6px; font-weight: 600; }
      td { padding: 6px; border-bottom: 1px solid #e4e8f2; vertical-align: top; }
      td.num, th.num { text-align: right; white-space: nowrap; }
      tfoot td { font-weight: 700; border-top: 2px solid #1e3a8a; border-bottom: none; padding-top: 10px; }
      .total-row td { font-size: 12pt; }
      .text { white-space: pre-wrap; }
      .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 9pt; color: #666; }
      .chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9pt; margin-right: 4px; background: #e4e8f2; }
      .chip.on { background: #1e3a8a; color: white; }
    </style></head><body>${bodyHtml}
    <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
    </body></html>`);
  win.document.close();
}


/**
 * Signaturbildene limes rett inn i et src-attributt, og kundesignaturen skrives av
 * en uinnlogget kunde via signeringslenken. PDF-vinduet åpnes med window.open("") og
 * arver dermed appens origin, så en verdi som lukker attributtet ville fått kode til
 * å kjøre med brukerens sesjon. Vi slipper derfor bare gjennom innebygde bilder —
 * alt annet blir tom streng, og signaturfeltet står blankt i stedet.
 * SVG er holdt utenfor med vilje: det er det eneste bildeformatet som kan bære skript.
 */
const safeImageSrc = (s: string | null | undefined) => {
  const v = String(s ?? "").trim();
  return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]*$/.test(v) ? v : "";
};

interface OfferLine {
  description: string;
  comment?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct?: number;
  included: boolean;
}

interface OfferPdfData {
  offer_number?: number;
  title: string;
  offer_date: string;
  valid_until: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_address?: string;
  their_ref: string;
  our_ref: string;
  project_number: string;
  offer_text: string;
  admin_cost_pct: number;
  status?: string;
}

interface OfferPdfSettings {
  company_name: string;
  company_tagline: string;
  logo_url?: string;
  payment_terms: string;
  vat_pct: number;
  ref_phone?: string;
  ref_email?: string;
  ref_position?: string;
  ref_signature?: string; // base64 dataURL
  forbehold?: Array<{ title: string; description: string }>;
  closing_page_offset_mm?: number;
  company_org_nr?: string;
}

interface OfferTotals {
  subtotal: number;
  admin: number;
  total: number;
}

function fmtNok(n: number) {
  return new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " kr";
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}

/**
 * Felles CSS for tilbuds-PDF-en og endringsmeldings-PDF-en. Trukket ut hit slik at de to
 * dokumentene ser like ut, og slik at et designbytte bare skjer ett sted.
 * Plassholderen {{CLOSING_OFFSET}} fylles inn av pdfStyles().
 */
const PDF_STYLES = `  :root {
    --ink:        #0A0A0A;
    --ink-2:      #1C1C1C;
    --slate-700:  #2E2E33;
    --slate-600:  #444448;
    --slate-500:  #5A5A60;
    --slate-400:  #7A7A82;
    --slate-300:  #C7C7CC;
    --slate-200:  #E5E5E5;
    --slate-150:  #EDEDEA;
    --slate-100:  #F5F5F2;
    --paper:      #FFFFFF;
    --accent:     #E30613;
    --accent-ink: #B00510;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Archivo', -apple-system, system-ui, sans-serif;
    background: #ECECE7;
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 24px auto;
    background: var(--paper);
    box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 24px 60px rgba(20,20,20,.18);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .masthead {
    padding: 16mm 18mm 8mm 18mm;
    position: relative;
  }
  .masthead::before {
    content: "";
    position: absolute;
    left: 18mm; right: 18mm; top: 10mm;
    height: 3px;
    background: var(--accent);
  }
  .top-meta {
    display: flex;
    justify-content: space-between;
    font-family: 'Archivo', sans-serif; font-variant-numeric: tabular-nums;
    font-size: 7pt;
    letter-spacing: 0.2em;
    color: var(--slate-700);
    text-transform: uppercase;
    margin-bottom: 8mm;
  }
  .mast-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14mm;
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6mm;
    max-width: 95mm;
  }
  .brand img {
    height: 18mm;
    width: auto;
    display: block;
    object-fit: contain;
    align-self: flex-start;
  }
  .brand .company { font-weight: 800; font-size: 13pt; letter-spacing: -0.01em; color: var(--ink); margin: 0; }
  .brand .tag {
    font-size: 8.5pt; color: var(--slate-600); letter-spacing: 0.22em;
    text-transform: uppercase; font-weight: 600; margin-top: 2px;
  }
  .brand .tag span { color: var(--accent); margin: 0 6px; font-weight: 700; }
  .doc-meta { text-align: right; min-width: 70mm; }
  .doc-meta .kind {
    font-family: 'Archivo', sans-serif;
    font-weight: 900; font-size: 36pt; line-height: 0.95;
    letter-spacing: 0.01em; margin: 0 0 4mm 0; color: var(--ink);
  }
  .doc-meta .kind .accent { color: var(--accent); }
  .doc-meta .num-pill {
    display: inline-flex; align-items: baseline; gap: 8px;
    border: 1.5px solid var(--ink); padding: 4px 12px;
    font-family: 'Archivo', sans-serif; font-variant-numeric: tabular-nums; font-size: 9pt; font-weight: 500; margin-bottom: 6mm;
  }
  .doc-meta .num-pill .lbl { font-size: 7pt; letter-spacing: 0.18em; text-transform: uppercase; color: var(--slate-600); }
  .doc-meta .num-pill .v { font-weight: 700; color: var(--ink); }
  .meta-grid { display: grid; grid-template-columns: auto auto; gap: 3px 16px; margin: 0; justify-content: end; }
  .meta-grid dt { color: var(--slate-700); text-transform: uppercase; letter-spacing: 0.14em; font-size: 7.5pt; font-weight: 700; text-align: right; }
  .meta-grid dd { margin: 0; font-family: 'Archivo', sans-serif; font-variant-numeric: tabular-nums; font-size: 9pt; font-weight: 600; color: var(--ink); text-align: right; }

  .body { padding: 4mm 18mm 0 18mm; flex: 1; display: flex; flex-direction: column; }

  .info-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0;
    border-top: 1.5px solid var(--ink); border-bottom: 1px solid var(--slate-200);
    margin-bottom: 9mm;
  }
  .info-cell { padding: 7mm 6mm 7mm 0; }
  .info-cell + .info-cell { padding-left: 6mm; border-left: 1px solid var(--slate-200); }
  .label {
    font-size: 7.5pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--slate-700); margin: 0 0 6px 0; display: flex; align-items: center; gap: 8px;
  }
  .label::before { content: ""; width: 6px; height: 6px; background: var(--accent); display: inline-block; }
  .info-cell .name { font-weight: 700; font-size: 13pt; color: var(--ink); margin: 0 0 4px 0; letter-spacing: -0.01em; }
  .info-cell .line { font-size: 9.5pt; color: var(--slate-700); margin: 0; }
  .info-cell .kv { display: grid; grid-template-columns: 28mm 1fr; row-gap: 3px; column-gap: 8px; font-size: 9pt; margin-top: 5px; }
  .info-cell .kv dt { color: var(--slate-700); font-weight: 600; }
  .info-cell .kv dd { margin: 0; color: var(--ink); font-weight: 700; }

  .project { margin-bottom: 8mm; }
  .project h2 { font-size: 18pt; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px 0; color: var(--ink); }
  .project .desc { font-size: 10.5pt; line-height: 1.6; color: var(--slate-700); margin: 0 0 4px 0; white-space: pre-wrap; }
  .forbehold-block { margin-bottom: 5mm; }
  .forbehold-label { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--slate-600); display: block; margin-bottom: 3px; }
  .forbehold-item { font-size: 8pt; color: var(--slate-600); font-style: italic; line-height: 1.5; margin-bottom: 2px; }

  table.items { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 8mm; }
  .items col.c-desc  { width: 50%; }
  .items col.c-qty   { width: 7%; }
  .items col.c-unit  { width: 7%; }
  .items col.c-price { width: 14%; }
  .items col.c-disc  { width: 8%; }
  .items col.c-sum   { width: 14%; }
  .items thead th {
    text-align: left; font-weight: 700; font-size: 7.5pt; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--slate-600); padding: 6px 8px 6px 0;
    border-bottom: 1.5px solid var(--ink);
  }
  .items thead th.num { text-align: right; }
  .items thead th:first-child { padding-left: 0; }
  .items tbody td { padding: 10px 8px 10px 0; border-bottom: 1px solid var(--slate-200); vertical-align: top; }
  .items tbody td:first-child { padding-left: 0; }
  .items tbody td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .items tbody td.desc-cell { font-weight: 500; color: var(--ink); max-width: 0; overflow: hidden; }
  .items tbody td.discount-cell { color: var(--slate-600); font-size: 9pt; }
  /* Beskrivelse og kommentar vises i sin helhet. En klipping her fjernet tekst fra
     dokumentet kunden signerer, mens prisen sto uavkortet. Kjøreskriptet pakker
     radene etter faktisk høyde, så en høy rad flytter seg bare til neste side. */
  .desc-text { display: block; }
  .comment { font-size: 8.5pt; color: var(--slate-600); font-weight: 400; font-style: italic; display: block; margin-top: 2px; }
  .strikethrough { font-size: 8pt; color: var(--slate-400); text-decoration: line-through; display: block; }

  /* Skyver avslutning til bunnen på siste side */
  .flex-fill { flex: 1; }
  .bottom-push { padding-top: 4mm; }
  /* Avslutningsside uten linjer: avstanden fra toppen styres av innstillingen.
     Siden har ingen flex-fill foran seg, så denne paddingen er det som faktisk
     bestemmer hvor summer, vilkår og signatur havner. */
  .closing-push { padding-top: {{CLOSING_OFFSET}}mm; }

  .totals-wrap { display: grid; grid-template-columns: 1fr 92mm; gap: 8mm; margin-bottom: 6mm; }
  .notes { font-size: 9pt; color: var(--slate-700); line-height: 1.6; padding-top: 4mm; }
  .notes .label { margin-bottom: 6px; }
  .totals { border-top: 1.5px solid var(--ink); padding-top: 4mm; }
  .totals .row { display: flex; justify-content: space-between; align-items: baseline; font-size: 10pt; padding: 5px 0; color: var(--slate-700); }
  .totals .row .k { white-space: nowrap; }
  .totals .row .v { font-variant-numeric: tabular-nums; font-weight: 500; color: var(--ink-2); white-space: nowrap; }
  .totals .row.sub { border-bottom: 1px solid var(--slate-200); }
  .totals .row.divider {
    border-top: 1.5px solid var(--ink); border-bottom: 1px solid var(--slate-200);
    padding: 5px 0; font-weight: 600; color: var(--ink-2);
  }
  .totals .row.grand {
    margin-top: 4mm; padding: 4mm 0 4mm 6mm;
    border-top: 2.5px solid var(--ink); border-bottom: 2.5px solid var(--ink);
    align-items: baseline; position: relative;
  }
  .totals .row.grand::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--accent); }
  .totals .row.grand .k { font-weight: 700; font-size: 9pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink); }
  .totals .row.grand .v { font-weight: 800; font-size: 15pt; color: var(--ink); letter-spacing: -0.01em; white-space: nowrap; }
  .totals .row.grand .v .cur { font-weight: 500; font-size: 8.5pt; color: var(--slate-500); letter-spacing: 0.08em; margin-left: 4px; }

  .conditions {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm;
    padding: 5mm 0; border-top: 1px solid var(--slate-200); margin-bottom: 6mm;
  }
  .condition .label { margin-bottom: 4px; }
  .condition .v { font-size: 10pt; font-weight: 600; color: var(--ink); }
  .ref-contact { font-size: 8.5pt; color: var(--slate-700); margin-top: 3px; display: flex; flex-direction: column; gap: 1px; }

  .sign {
    margin-bottom: 6mm; display: grid; grid-template-columns: 1fr 60mm; gap: 10mm; align-items: end;
  }
  .sign .from { font-size: 9.5pt; color: var(--slate-700); line-height: 1.6; }
  .sign .from .by { font-weight: 700; color: var(--ink); margin-top: 2px; font-size: 10pt; }
  .sign .from .by-role { font-size: 9pt; color: var(--slate-600); font-style: italic; }
  .sign .from .by-company { font-size: 9.5pt; font-weight: 600; color: var(--ink); }
  .sign .stamp { text-align: center; }
  .sign .stamp .sig-img {
    display: block; max-height: 18mm; max-width: 55mm;
    width: auto; margin: 0 auto 3mm auto; object-fit: contain;
  }
  .sign .stamp .line {
    border-top: 1px solid var(--ink); padding-top: 6px;
    font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase; color: var(--slate-600);
  }

  .footer {
    margin-top: auto; padding: 4mm 18mm 8mm 18mm;
    font-size: 7.5pt; letter-spacing: 0.04em;
    position: relative; border-top: 1.5px solid var(--ink);
  }
  .footer::before {
    content: ""; position: absolute; left: 18mm; top: -1.5px;
    width: 36mm; height: 3px; background: var(--accent);
  }
  .footer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; padding-top: 3mm; }
  .footer .ft-label {
    color: var(--slate-600); text-transform: uppercase; letter-spacing: 0.16em;
    font-weight: 700; font-size: 6.5pt; margin-bottom: 2px;
  }
  .footer .ft-v { color: var(--ink); font-weight: 500; font-size: 8pt; line-height: 1.4; }

  .cont-header {
    padding: 8mm 18mm 4mm 18mm;
    position: relative;
    border-bottom: 1px solid var(--slate-200);
  }
  .cont-header::before {
    content: "";
    position: absolute;
    left: 18mm; right: 18mm; top: 4mm;
    height: 2px;
    background: var(--accent);
  }
  .cont-meta {
    display: flex;
    justify-content: space-between;
    font-family: 'Archivo', sans-serif; font-variant-numeric: tabular-nums;
    font-size: 7.5pt;
    letter-spacing: 0.1em;
    color: var(--slate-600);
    margin-top: 6mm;
  }

  .carry {
    display: flex;
    justify-content: space-between;
    font-family: 'Archivo', sans-serif; font-variant-numeric: tabular-nums;
    font-size: 8.5pt;
    font-weight: 600;
    color: var(--slate-600);
    padding: 6px 0;
    letter-spacing: 0.04em;
  }
  .carry-in { border-bottom: 1.5px solid var(--slate-200); margin-bottom: 4px; }
  .carry-out { border-top: 1.5px solid var(--ink); margin-top: 4px; color: var(--ink); }

  /* --- Endringsmelding: regler som bare treffer nye klassenavn --- */
  .doc-meta .kind.kind-sm {
    font-size: 19pt; line-height: 1.15; letter-spacing: 0.01em; margin-bottom: 3mm;
  }
  /* Kjøreskriptet måler .body-barna med getBoundingClientRect(), som ikke tar med
     marger. Innledningen samles derfor i én flow-root-boks, slik at margene til
     info-grid/project/type-tags/doc-block havner innenfor det som blir målt. */
  .doc-intro { display: flow-root; }
  .type-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 7mm; }
  .type-tag {
    display: inline-flex; align-items: center; gap: 7px;
    border: 1.5px solid var(--ink); padding: 3px 11px;
    font-size: 7.5pt; font-weight: 700; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--ink);
  }
  .type-tag::before { content: ""; width: 6px; height: 6px; background: var(--accent); display: inline-block; }
  .doc-block { margin-bottom: 6mm; }
  .doc-block .label { margin-bottom: 5px; }
  .doc-block .body-text {
    font-size: 10.5pt; line-height: 1.6; color: var(--slate-700); margin: 0; white-space: pre-wrap;
  }
  .items col.a-desc  { width: 54%; }
  .items col.a-qty   { width: 9%; }
  .items col.a-unit  { width: 9%; }
  .items col.a-price { width: 14%; }
  .items col.a-sum   { width: 14%; }
  .conditions.two { grid-template-columns: repeat(2, 1fr); }
  .sign.two-col { grid-template-columns: 1fr 1fr; gap: 14mm; }
  .sign .stamp .stamp-label {
    font-size: 7.5pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--slate-600); margin: 0 0 3mm 0;
  }
  .sign .stamp .signed {
    border-top: 1px solid var(--ink); padding-top: 6px;
    font-size: 8.5pt; font-weight: 600; color: var(--ink); letter-spacing: 0.04em;
  }

  @page { size: A4; margin: 0mm; }
  @media print {
    body { background: #fff; }
    .page {
      margin: 0;
      box-shadow: none;
      width: 210mm;
      min-height: 297mm;
      height: auto;
      overflow: visible;
      page-break-after: always;
      break-after: page;
      padding-bottom: 10mm;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
    tbody tr { page-break-inside: avoid; break-inside: avoid; }
    .info-grid    { page-break-inside: avoid; break-inside: avoid; }
    .project      { page-break-inside: avoid; break-inside: avoid; }
    .doc-block    { page-break-inside: avoid; break-inside: avoid; }
    .type-tags    { page-break-inside: avoid; break-inside: avoid; }
    .bottom-push  { page-break-inside: avoid; break-inside: avoid; }
    .totals-wrap { page-break-inside: avoid; break-inside: avoid; }
    .conditions   { page-break-inside: avoid; break-inside: avoid; }
    .sign         { page-break-inside: avoid; break-inside: avoid; }
    .footer       { page-break-inside: avoid; break-inside: avoid; }
    .carry        { page-break-inside: avoid; break-inside: avoid; }
  }`;

/** CSS-en med toppmargen for avslutningssiden satt inn (bare tilbudet bruker den siden). */
function pdfStyles(closingPageOffsetMm?: number) {
  // Avslutningsblokken er rundt 130 mm høy, og arket har snaut 235 mm igjen etter
  // topptekst og bunntekst. Over taket her blir summer, vilkår og signatur skjøvet
  // ut på et eget, nesten tomt ark — målt til 340 mm sidehøyde ved 150 mm.
  // Merk at null og undefined må skilles fra 0 her. Number(null) er 0, og 0 er et
  // gyldig tall — så en usatt kolonne ville gitt avslutningsblokken helt øverst
  // på siste ark med 180 mm blankt under. Det slår bare ut på kundens vei, der
  // innstillingene spres rått inn fra RPC-en.
  const raw = closingPageOffsetMm == null ? NaN : Number(closingPageOffsetMm);
  const offset = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 100) : 90;
  return PDF_STYLES.replace("{{CLOSING_OFFSET}}", String(offset));
}

/**
 * Kjøreskriptet som pakker tabellrader etter faktisk høyde, slår sammen sider som får
 * plass sammen, regner om overføringssummene og oppdaterer sidetall før utskrift.
 *
 * Dokumentet må inneholde: .page-elementer med .masthead eller .cont-header,
 * en section.body, table.items med tr[data-sum], .carry-in/.carry-out,
 * .flex-fill/.bottom-push på siste side og <template id="cont-page-tpl">.
 */
const PDF_REFLOW_SCRIPT = `(function() {
  var PX_MM = 96 / 25.4;
  var PAGE_MM = 297;
  var BUFFER_MM = 44; // sikkerhetsmarginen (skjerm-px vs utskrift-mm er ikke eksakt)
  var SPLIT_BUFFER_MM = 16; // luft i bunnen før vi flytter rader til ny side

  function mm(el) { return el ? el.getBoundingClientRect().height / PX_MM : 0; }

  function fmtNok(n) {
    return new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' kr';
  }

  function bodyContentMm(page) {
    return Array.from(page.querySelector('.body').children)
      .filter(function(el) {
        return !el.classList.contains('flex-fill') &&
               !el.classList.contains('bottom-push');
      })
      .reduce(function(acc, el) { return acc + mm(el); }, 0);
  }

  function tryMerge() {
    var pages = Array.from(document.querySelectorAll('.page'));
    for (var i = 0; i < pages.length - 1; i++) {
      var cur = pages[i];
      var nxt = pages[i + 1];
      var nxtIsClosing = nxt.classList.contains('page-closing');

      // Avslutningssiden skal alltid være egen side
      if (nxtIsClosing) continue;

      var curHeader = mm(cur.querySelector('.masthead, .cont-header'));
      var curContent = bodyContentMm(cur);
      var nxtContent = bodyContentMm(nxt);

      if (curHeader + curContent + nxtContent <= PAGE_MM - BUFFER_MM) {
        var curBody = cur.querySelector('.body');
        var anchor = curBody.querySelector('.flex-fill, .bottom-push') || null;
        var nxtBody = nxt.querySelector('.body');

        Array.from(nxtBody.children)
          .filter(function(el) {
            return !el.classList.contains('flex-fill') &&
                   !el.classList.contains('bottom-push');
          })
          .forEach(function(el) {
            if (el.classList.contains('carry') && el.classList.contains('carry-in')) return;
            curBody.insertBefore(el, anchor);
          });

        nxt.remove();
        return true;
      }
    }
    return false;
  }

  // Pakk alle tilbudslinjer på nytt ut fra faktisk høyde. Serversiden deler på
  // fast radantall (22), så høye rader (lang beskrivelse + kommentar) rant over.
  // Her fyller vi hver side til den er full, og lager nye sider etter behov.
  // Sider uten tabell (tekstsider) ble aldri brutt om: en lang beskrivelse
  // vokste forbi 297 mm, og siden ble enten klippet av overflow:hidden på skjerm
  // eller brukket vilkårlig av skriveren. Her flyttes hele blokker — avsnitt,
  // overskrifter, merkerader — videre til en ny side til innholdet får plass.
  function reflowTextPages() {
    var tpl = document.getElementById('cont-page-tpl');
    if (!tpl) return;
    for (var runde = 0; runde < 40; runde++) {
      var pages = Array.from(document.querySelectorAll('.page'));
      var delte = false;
      for (var i = 0; i < pages.length; i++) {
        var page = pages[i];
        // Linjesider eies av reflowLines; avslutningssiden skal stå som den er
        if (page.querySelector('table.items')) continue;
        if (page.classList.contains('page-closing')) continue;
        var body = page.querySelector('.body');
        if (!body) continue;

        var container = body;
        var kids = Array.from(body.children).filter(function(el) {
          return !el.classList.contains('flex-fill') && !el.classList.contains('bottom-push');
        });
        // Tekstsiden har som regel én beholder (.doc-intro) med avsnittene inni.
        // Uten dette steget fant vi bare ett element å flytte, og ingenting skjedde.
        if (kids.length === 1 && kids[0].children.length > 1) {
          container = kids[0];
          kids = Array.from(container.children);
        }
        if (kids.length < 2) continue;

        var avail = PAGE_MM
          - mm(page.querySelector('.masthead, .cont-header'))
          - mm(page.querySelector('footer'))
          - mm(page.querySelector('.bottom-push'))
          - SPLIT_BUFFER_MM;
        if (bodyContentMm(page) <= avail) continue;

        var moved = [];
        while (kids.length > 1 && bodyContentMm(page) > avail) {
          var last = kids.pop();
          last.remove();
          moved.unshift(last);
        }
        if (!moved.length) continue;

        var np = tpl.content.firstElementChild.cloneNode(true);
        // Malen er laget for linjesider — tabell og overføringsrader hører ikke
        // hjemme på en ren tekstside
        var tbl = np.querySelector('table.items');
        if (tbl) tbl.remove();
        Array.from(np.querySelectorAll('.carry')).forEach(function(c) { c.remove(); });
        // Endringsmeldingens mal er merket page-closing for å hindre at to
        // linjesider slås sammen. Uten tabell er dette en ren tekstside, og
        // flagget ville fått løkka over til å hoppe over den — halen kunne da
        // aldri brytes en gang til, og rant forbi arkkanten.
        np.classList.remove('page-closing');
        var sec = np.querySelector('.body');
        if (container !== body) {
          // Behold beholderen så avsnittene arver samme stil på den nye siden
          var wrapper = container.cloneNode(false);
          moved.forEach(function(el) { wrapper.appendChild(el); });
          sec.appendChild(wrapper);
        } else {
          moved.forEach(function(el) { sec.appendChild(el); });
        }
        page.parentNode.insertBefore(np, page.nextSibling);
        delte = true;
        break;
      }
      if (!delte) return;
    }
  }

  function reflowLines() {
    var linePages = Array.from(document.querySelectorAll('.page'))
      .filter(function(p) { return p.querySelector('table.items tbody'); });
    if (!linePages.length) return;

    var allRows = [];
    var push = null, fill = null;
    linePages.forEach(function(p) {
      Array.from(p.querySelectorAll('tbody tr[data-sum]')).forEach(function(r) { allRows.push(r); });
      push = p.querySelector('.bottom-push') || push;
      fill = p.querySelector('.flex-fill') || fill;
    });
    if (!allRows.length) return;

    linePages.forEach(function(p) { p.querySelector('tbody').innerHTML = ''; });

    // bodyContentMm teller ikke med summer-blokken, så den må trekkes fra plassen
    function availFor(page) {
      return PAGE_MM
        - mm(page.querySelector('.masthead, .cont-header'))
        - mm(page.querySelector('footer'))
        - mm(page.querySelector('.bottom-push'))
        - SPLIT_BUFFER_MM;
    }

    var tpl = document.getElementById('cont-page-tpl');
    var current = linePages[0];
    var used = [current];

    allRows.forEach(function(row) {
      var tb = current.querySelector('tbody');
      tb.appendChild(row);
      // Passer den ikke, åpne ny side — men aldri legg igjen en tom side
      if (bodyContentMm(current) > availFor(current) && tb.querySelectorAll('tr[data-sum]').length > 1) {
        tb.removeChild(row);
        var np = tpl.content.firstElementChild.cloneNode(true);
        np.querySelector('tbody').innerHTML = '';
        current.parentNode.insertBefore(np, current.nextSibling);
        current = np;
        used.push(np);
        current.querySelector('tbody').appendChild(row);
      }
    });

    // Summer/vilkår hører hjemme på den siste linjesiden
    function placeBottom(page) {
      var sec = page.querySelector('.body');
      if (fill) sec.appendChild(fill);
      sec.appendChild(push);
    }
    if (push) {
      var lastPage = used[used.length - 1];
      placeBottom(lastPage);
      // Summene tar plass — skyv rader videre om siden nå renner over
      var tb = lastPage.querySelector('tbody');
      while (tb.querySelectorAll('tr[data-sum]').length > 1 && bodyContentMm(lastPage) > availFor(lastPage)) {
        var rows = tb.querySelectorAll('tr[data-sum]');
        var np = tpl.content.firstElementChild.cloneNode(true);
        np.querySelector('tbody').innerHTML = '';
        np.querySelector('tbody').appendChild(rows[rows.length - 1]);
        lastPage.parentNode.insertBefore(np, lastPage.nextSibling);
        placeBottom(np);
        used.push(np);
        lastPage = np;
        tb = np.querySelector('tbody');
      }
    }

    linePages.forEach(function(p) { if (used.indexOf(p) === -1) p.remove(); });
  }

  // Beløpene i "overført/overføres" må regnes på nytt når rader har flyttet seg
  function recalcCarries() {
    var linePages = Array.from(document.querySelectorAll('.page'))
      .filter(function(p) { return p.querySelector('table.items tbody tr[data-sum]'); });
    var cum = 0;
    linePages.forEach(function(page, idx) {
      var sum = Array.from(page.querySelectorAll('tbody tr[data-sum]'))
        .reduce(function(s, r) { return s + (parseFloat(r.getAttribute('data-sum')) || 0); }, 0);
      var cin = page.querySelector('.carry-in');
      var cout = page.querySelector('.carry-out');
      if (cin) {
        cin.style.display = (idx === 0 || cum <= 0) ? 'none' : '';
        cin.lastElementChild.textContent = fmtNok(cum);
      }
      cum += sum;
      if (cout) {
        cout.style.display = (idx === linePages.length - 1) ? 'none' : '';
        cout.lastElementChild.textContent = fmtNok(cum);
      }
    });
  }

  function updatePageNumbers() {
    var pages = Array.from(document.querySelectorAll('.page'));
    var total = pages.length;
    pages.forEach(function(page, i) {
      page.querySelectorAll('.page-num').forEach(function(span) {
        span.textContent = (i + 1) + ' / ' + total;
      });
    });
  }

  window.onload = function() {
    // Vent på at fonter er lastet – gjør målingen nøyaktig
    var ready = (typeof document.fonts !== 'undefined' && document.fonts.ready)
      ? document.fonts.ready
      : Promise.resolve();
    ready.then(function() {
      // Tekstsidene brytes om først: flytter en lang beskrivelse videre, kan den
      // nye siden i neste steg slås sammen med noe som faktisk får plass der.
      reflowTextPages();
      // Pakk linjene etter faktisk høyde, slå deretter sammen sider som får plass sammen
      reflowLines();
      var changed = true;
      while (changed) { changed = tryMerge(); }
      recalcCarries();
      updatePageNumbers();
      setTimeout(function() { window.print(); }, 300);
    });
  };
})();`;

export function openOfferPdf(
  offer: OfferPdfData,
  lines: OfferLine[],
  totals: OfferTotals,
  settings: OfferPdfSettings,
  targetWin?: Window | null,
) {
  // Ingen fallback til /logo.png — den er Techauge sin, og ville havnet i andre
  // firmaers tilbud når innstillingene ikke var lastet enda.
  const logoUrl = escapeHtml(settings.logo_url || "");
  const refSignatureSrc = safeImageSrc(settings.ref_signature);
  // Godkjent tilbud er aktivt — da har "gyldig t.o.m." ingen betydning
  const hasDeadline = offerHasDeadline(offer.status);
  const included = lines.filter((l) => l.included);
  const vat = totals.total * (settings.vat_pct / 100);
  const totalInclVat = totals.total + vat;
  const now = new Date();
  const nowStr = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(now).replace(",", " ·");

  // Grenser for antall linjer per side
  // Kompakt tilbud: få linjer og kort tilbudstekst → kundeblokk + tabell på side 1
  // Flersides tilbud: egen tekstside først
  // Begge: egen dedikert avslutningsside (ingen tabell) → alltid plass
  const textLen = (offer.offer_text ?? "").length;
  const forbeholdCount = (settings.forbehold ?? []).length;

  // Tell faktiske linjeskift + tegn-wrap for bedre estimat
  const offerTextLines = (offer.offer_text ?? "").split("\n");
  const totalTextLines = offerTextLines.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 68)), 0);
  const estTextMm = totalTextLines * 6.2;

  // Forbehold: hver post = tittel + beskrivelse (~14mm per post)
  const estForbeholdMm = forbeholdCount * 14;

  // Fast innhold på side 1: topptekst + kundeblokk + overskrift + tabell-header + carry-out + padding
  const FIXED_MM = 145;
  const LINE_MM = 13; // høyde per tilbudslinje (inkl. kommentar-rom)
  const PAGE_MM = 297;

  // Hvor mange linjer får faktisk plass på side 1?
  const availForLines = PAGE_MM - FIXED_MM - estTextMm - estForbeholdMm;
  const LINES_PAGE_1 = Math.min(8, Math.max(1, Math.floor(availForLines / LINE_MM)));

  // Maks høyde tilbudsteksten kan ta — blir klippet av overflow:hidden
  const maxDescMm = Math.max(18, PAGE_MM - FIXED_MM - estForbeholdMm - (LINES_PAGE_1 * LINE_MM) - 8);
  const LINES_PER_PAGE = 22;

  // Kompakt tilbud: ingen forbehold, kort tekst, få linjer. Da slipper vi den
  // dedikerte tekstsiden, og kundeblokk + tabell deler side 1.
  const SHORT_LINE_LIMIT = 3;
  const SHORT_TEXT_LIMIT = 240;
  const isCompact =
    included.length <= SHORT_LINE_LIMIT &&
    textLen < SHORT_TEXT_LIMIT &&
    forbeholdCount === 0;

  // Multi-side tilbud bruker alltid dedikert tekstside (side 1) og pristabell (side 2+)
  const useTextPage = !isCompact;

  function calcLineSum(l: OfferLine) {
    const gross = l.quantity * l.unit_price;
    return gross * (1 - (l.discount_pct ?? 0) / 100);
  }

  function lineSum(ls: OfferLine[]) {
    return ls.reduce((s, l) => s + calcLineSum(l), 0);
  }

  function lineRow(l: OfferLine) {
    const gross = l.quantity * l.unit_price;
    const net = calcLineSum(l);
    const hasDiscount = (l.discount_pct ?? 0) > 0;
    const sumCell = hasDiscount
      ? `<td class="num">${fmtNok(net)}<br/><span class="strikethrough">${fmtNok(gross)}</span></td>`
      : `<td class="num">${fmtNok(net)}</td>`;
    const descCell = l.comment
      ? `<td class="desc-cell"><span class="desc-text">${escapeHtml(l.description)}</span><span class="comment">${escapeHtml(l.comment)}</span></td>`
      : `<td class="desc-cell"><span class="desc-text">${escapeHtml(l.description)}</span></td>`;
    const discountCell = hasDiscount
      ? `<td class="num discount-cell">${fmtNum(l.discount_pct ?? 0)}&nbsp;%</td>`
      : `<td class="num discount-cell"></td>`;
    return `<tr data-sum="${net}">
      ${descCell}
      <td class="num">${fmtNum(l.quantity)}</td>
      <td class="num">${escapeHtml(l.unit)}</td>
      <td class="num">${fmtNok(l.unit_price)}</td>
      ${discountCell}
      ${sumCell}
    </tr>`;
  }

  function tableHtml(ls: OfferLine[]) {
    const rows = ls.length
      ? ls.map(lineRow).join("")
      : `<tr><td colspan="6" style="text-align:center;color:#555;padding:14px 0">Ingen linjer</td></tr>`;
    return `<table class="items">
      <colgroup>
        <col class="c-desc"/><col class="c-qty"/><col class="c-unit"/>
        <col class="c-price"/><col class="c-disc"/><col class="c-sum"/>
      </colgroup>
      <thead><tr>
        <th>Beskrivelse</th>
        <th class="num">Antall</th>
        <th class="num">Enhet</th>
        <th class="num">Pris/enhet</th>
        <th class="num">Rabatt</th>
        <th class="num">Sum eks. mva</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Sidetype: "text" | "forbehold" | "lines" | "closing"
  type PageType = { kind: "text" } | { kind: "forbehold" } | { kind: "lines"; rows: OfferLine[] } | { kind: "closing" };
  const typedPages: PageType[] = [];
  let remaining = [...included];

  if (isCompact) {
    // Avslutningsblokken (summer + vilkår + signatur) er drøyt 120 mm høy og fikk
    // aldri plass sammen med topptekst, kundeblokk og tabell — arket rant over
    // uansett hvor få linjer tilbudet hadde. Den får derfor egen side her også.
    //
    // Den egne siden er samtidig det som redder sumblokken: lå avslutningen på en
    // linjeside, flyttet kjøreskriptet den til den siste siden det delte ut, og
    // tryMerge slo så den siden sammen med den forrige — .bottom-push blir ikke
    // med i flyttingen, så summene forsvant helt. page-closing slås aldri sammen.
    typedPages.push({ kind: "lines", rows: remaining.splice(0, SHORT_LINE_LIMIT) });
    typedPages.push({ kind: "closing" });
  } else {
    typedPages.push({ kind: "text" });
    if (forbeholdCount > 0) typedPages.push({ kind: "forbehold" });
    while (remaining.length > 0) typedPages.push({ kind: "lines", rows: remaining.splice(0, LINES_PER_PAGE) });
    typedPages.push({ kind: "closing" });
  }

  // Bakoverkompatibelt: behold pages-array for kumulative summer
  const pages: OfferLine[][] = typedPages.map((p) => p.kind === "lines" ? p.rows : []);

  const totalPages = pages.length;

  const adminRow = totals.admin > 0
    ? `<div class="row sub">
        <span class="k">Adm. påslag (${fmtNum(offer.admin_cost_pct)}&nbsp;%)</span>
        <span class="v">${fmtNok(totals.admin)}</span>
       </div>`
    : "";

  const hasVat = settings.vat_pct > 0;

  const vatSection = hasVat
    ? `<div class="row divider">
        <span class="k">Totalt eks. mva</span>
        <span class="v">${fmtNok(totals.total)}</span>
       </div>
       <div class="row sub">
        <span class="k">MVA (${settings.vat_pct}&nbsp;%)</span>
        <span class="v">${fmtNok(vat)}</span>
       </div>
       <div class="row grand">
         <span class="k">Totalt inkl. mva</span>
         <span class="v">${fmtNok(totalInclVat)}<span class="cur">NOK</span></span>
       </div>`
    : `<div class="row grand">
         <span class="k">Totalt eks. mva</span>
         <span class="v">${fmtNok(totals.total)}<span class="cur">NOK</span></span>
       </div>`;

  function buildPage(pageLines: OfferLine[], pageIdx: number, cumulativeBefore: number): string {
    const pt = typedPages[pageIdx];
    const isFirst = pageIdx === 0;
    const isLast = pageIdx === totalPages - 1;
    const isClosingPage = pt.kind === "closing";
    const isTextPage = pt.kind === "text";
    const isForbeholdPage = pt.kind === "forbehold";
    const pageSum = lineSum(pageLines);
    const cumulativeAfter = cumulativeBefore + pageSum;

    const masthead = isFirst
      ? `<header class="masthead">
          <div class="top-meta">
            <span>${nowStr}</span>
            <span>Tilbud-${offer.offer_number ?? "—"} · Side <span class="page-num">${pageIdx + 1} / ${totalPages}</span></span>
          </div>
          <div class="mast-row">
            <div class="brand">
              ${logoUrl ? `<img src="${logoUrl}" alt="${escapeHtml(settings.company_name)}" onerror="this.style.display='none'" />` : ""}
              <div>
                <p class="company">${escapeHtml(settings.company_name)}</p>
                ${settings.company_tagline
                  ? `<p class="tag">${escapeHtml(settings.company_tagline).replace(/ [·\/] /g, (m) => ` <span>${m.trim()}</span> `)}</p>`
                  : ""}
              </div>
            </div>
            <div class="doc-meta">
              <h1 class="kind">TIL<span class="accent">BUD</span></h1>
              <div class="num-pill">
                <span class="lbl">Nr.</span>
                <span class="v">${offer.offer_number ?? "—"}</span>
              </div>
              <dl class="meta-grid">
                <dt>Dato</dt><dd>${fmtDate(offer.offer_date)}</dd>
                ${hasDeadline ? `<dt>Gyldig t.o.m.</dt><dd>${fmtDate(offer.valid_until)}</dd>` : ""}
                ${offer.project_number ? `<dt>Prosjektnr.</dt><dd>${escapeHtml(offer.project_number)}</dd>` : ""}
              </dl>
            </div>
          </div>
        </header>`
      : `<header class="cont-header">
          <div class="cont-meta">
            <span>${escapeHtml(settings.company_name)} — Tilbud ${offer.offer_number ?? "—"}</span>
            <span>Side <span class="page-num">${pageIdx + 1} / ${totalPages}</span></span>
          </div>
        </header>`;

    const customerBlock = isFirst ? `
      <div class="info-grid">
        <div class="info-cell">
          <p class="label">Tilbud til</p>
          <p class="name">${escapeHtml(offer.customer_name) || "—"}</p>
          ${offer.customer_email ? `<p class="line">${escapeHtml(offer.customer_email)}</p>` : ""}
          ${offer.customer_phone ? `<p class="line">Tlf: ${escapeHtml(offer.customer_phone)}</p>` : ""}
          ${offer.customer_address ? `<p class="line">${escapeHtml(offer.customer_address)}</p>` : ""}
        </div>
        <div class="info-cell">
          <p class="label">Referanse</p>
          <dl class="kv">
            ${offer.their_ref ? `<dt>Deres ref.</dt><dd>${escapeHtml(offer.their_ref)}</dd>` : ""}
            ${offer.our_ref ? `<dt>Vår ref.</dt><dd>${escapeHtml(offer.our_ref)}</dd>` : ""}
            ${offer.project_number ? `<dt>Prosjektnr.</dt><dd>${escapeHtml(offer.project_number)}</dd>` : ""}
          </dl>
        </div>
      </div>
      <div class="project">
        <h2>${escapeHtml(offer.title) || "—"}</h2>
        ${offer.offer_text ? `<p class="desc">${escapeHtml(offer.offer_text)}</p>` : ""}
      </div>` : "";

    // Carry-radene ligger alltid i DOM-en, men kan være skjult. Kjøreskriptet slår
    // dem av og på og regner ut beløpene på nytt etter at sider er delt/slått sammen.
    const carryHidden = (hide: boolean) => hide ? ` style="display:none"` : "";
    const carryIn = `<div class="carry carry-in"${carryHidden(isFirst || cumulativeBefore <= 0)}>
          <span>Overført fra forrige side</span>
          <span>${fmtNok(cumulativeBefore)}</span>
         </div>`;

    // Uten linjer kjører ikke recalcCarries i det hele tatt, så en tom tabellside
    // ville stått igjen med "Overføres til neste side 0,00 kr".
    const carryOut = `<div class="carry carry-out"${carryHidden(isLast || pageLines.length === 0)}>
          <span>Overføres til neste side</span>
          <span>${fmtNok(cumulativeAfter)}</span>
         </div>`;

    const hasAdmin = totals.admin > 0;
    // Avslutningssiden plasseres av innstillingen "avstand fra topp" (.closing-push).
    // Med en flex-fill foran seg havnet blokken uansett på bunnen, og innstillingen
    // gjorde ingenting før verdien ble så høy at siden rant over.
    const totalsBlock = isLast ? `
      ${isClosingPage ? "" : `<div class="flex-fill"></div>`}
      <div class="bottom-push${isClosingPage ? " closing-push" : ""}">
        <div class="totals-wrap">
          <!-- Betalingsbetingelsene står i .condition rett under. Den tomme cellen
               holder venstre kolonne i grid-en åpen så sumblokken beholder bredden. -->
          <div class="notes"></div>
          <div class="totals">
            ${hasAdmin ? `<div class="row sub">
              <span class="k">Sum eks. mva</span>
              <span class="v">${fmtNok(totals.subtotal)}</span>
            </div>` : ""}
            ${adminRow}
            ${vatSection}
          </div>
        </div>
        <div class="conditions">
          <div class="condition">
            <p class="label">Betalingsvilkår</p>
            <div class="v">${escapeHtml(settings.payment_terms) || "—"}</div>
          </div>
          ${hasDeadline ? `<div class="condition">
            <p class="label">Tilbudet gyldig</p>
            <div class="v">T.o.m. ${fmtDate(offer.valid_until)}</div>
          </div>` : ""}
          <div class="condition">
            <p class="label">Vår referanse</p>
            <div class="v">${escapeHtml(offer.our_ref) || "—"}</div>
            ${(settings.ref_phone || settings.ref_email) ? `<div class="ref-contact">
              ${settings.ref_phone ? `<span>Tlf: ${escapeHtml(settings.ref_phone)}</span>` : ""}
              ${settings.ref_email ? `<span>${escapeHtml(settings.ref_email)}</span>` : ""}
            </div>` : ""}
          </div>
        </div>
        <div class="sign">
          <div class="from">
            Tilbudet er utarbeidet av
            <div class="by">${escapeHtml(offer.our_ref) || "—"}</div>
            ${settings.ref_position ? `<div class="by-role">${escapeHtml(settings.ref_position)}</div>` : ""}
            <div class="by-company">${escapeHtml(settings.company_name)}</div>
          </div>
          <div class="stamp">
            ${refSignatureSrc
              ? `<img src="${refSignatureSrc}" alt="Signatur" class="sig-img" />`
              : ""}
            <div class="line">Signatur / dato</div>
          </div>
        </div>
      </div>` : "";

    const footerBlock = isLast ? `
      <footer class="footer">
        <div class="footer-grid">
          <div>
            <div class="ft-label">Selskap</div>
            <div class="ft-v">${escapeHtml(settings.company_name)}</div>
            ${offer.our_ref ? `<div class="ft-v" style="color:var(--slate-500);font-size:7.5pt;">${escapeHtml(offer.our_ref)}${settings.ref_position ? ` — ${escapeHtml(settings.ref_position)}` : ""}</div>` : ""}
          </div>
          ${settings.company_org_nr ? `<div>
            <div class="ft-label">Organisasjon</div>
            <div class="ft-v">Org.nr. ${escapeHtml(settings.company_org_nr)}</div>
          </div>` : "<div></div>"}
          <div>
            <div class="ft-label">Kontakt</div>
            ${offer.our_ref ? `<div class="ft-v">${escapeHtml(offer.our_ref)}</div>` : ""}
            ${settings.ref_position ? `<div class="ft-v">${escapeHtml(settings.ref_position)}</div>` : ""}
            ${settings.ref_phone ? `<div class="ft-v">${escapeHtml(settings.ref_phone)}</div>` : ""}
            ${settings.ref_email ? `<div class="ft-v">${escapeHtml(settings.ref_email)}</div>` : ""}
          </div>
        </div>
      </footer>` : "";

    const forbeholdPageBlock = isForbeholdPage ? `
      <div class="forbehold-block">
        <span class="forbehold-label">Forbehold:</span>
        ${(settings.forbehold!).map((f) => {
          const obj = typeof f === "string" ? { title: f, description: "" } : f;
          return `<div class="forbehold-item">• <strong>${escapeHtml(obj.title)}</strong>${obj.description ? ` ${escapeHtml(obj.description)}` : ""}</div>`;
        }).join("")}
      </div>` : "";

    // Bare pristabell-sider viser tabellen
    const tableSection = pt.kind === "lines"
      ? `${carryIn}${tableHtml(pageLines)}${carryOut}`
      : "";

    return `<main class="page page-${pt.kind}">
      ${masthead}
      <section class="body">
        ${customerBlock}
        ${forbeholdPageBlock}
        ${tableSection}
        ${totalsBlock}
      </section>
      ${footerBlock}
    </main>`;
  }

  let cumulative = 0;
  const pagesHtml = pages.map((pageLines, i) => {
    const html = buildPage(pageLines, i, cumulative);
    cumulative += lineSum(pageLines);
    return html;
  }).join("\n");

  const html = `<!doctype html>
<html lang="no">
<head>
<meta charset="utf-8"/>
<title>Tilbud – ${escapeHtml(settings.company_name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>
${pdfStyles(settings.closing_page_offset_mm)}
</style>
</head>
<body>
${pagesHtml}
<template id="cont-page-tpl"><main class="page page-lines">
  <header class="cont-header">
    <div class="cont-meta">
      <span>${escapeHtml(settings.company_name)} — Tilbud ${offer.offer_number ?? "—"}</span>
      <span>Side <span class="page-num"></span></span>
    </div>
  </header>
  <section class="body">
    <div class="carry carry-in"><span>Overført fra forrige side</span><span></span></div>
    ${tableHtml([])}
    <div class="carry carry-out"><span>Overføres til neste side</span><span></span></div>
  </section>
</main></template>
<script>
${PDF_REFLOW_SCRIPT}
</script>
</body>
</html>`;

  const win = targetWin ?? window.open("", "_blank", "width=1000,height=1200");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

export interface ContractData {
  offer_number: number;
  title: string;
  offer_date: string;
  customer_name: string;
  customer_address?: string;
  customer_phone?: string;
  project_number?: string;
  offer_text?: string;
  total_incl_vat: number;
  company_name: string;
  logo_url?: string;
  company_org_nr?: string;
  company_address?: string;
  company_phone?: string;
  company_ceo?: string;
  ref_name?: string;
  ref_position?: string;
  ref_phone?: string;
  ref_signature?: string;
  customer_signed_name?: string;
  customer_signed_at?: string;
  customer_signature?: string;
  forbehold?: Array<{ title: string; description: string }>;
  /**
   * Betalingsbetingelsene fra innstillingene. Kontrakten går foran tilbudet ved
   * motstrid (§2), så §5 må si det samme som tilbudet — ikke en egen frist.
   */
  payment_terms?: string;
  /** Avtalt verneting. Malen brukes av flere firma, så domstolen kan ikke hardkodes. */
  venue?: string;
}

/**
 * Kontraktspesifikk CSS, lagt etter pdfStyles(). Kontrakten gjenbruker klassene
 * fra tilbuds-PDF-en der de passer (.page, .body, .cont-header, .footer,
 * .info-grid, .totals) — dette er bare det som er unikt for avtaledokumentet.
 */
const CONTRACT_STYLES = `
  /* Forsiden må aldri slås sammen med første avtaleside. tryMerge slår bare sammen
     sider som til sammen er under ~253 mm, og denne fyller arket alene. */
  .cover-inner {
    flex: 1; min-height: 250mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center;
  }
  .cover-inner .logo { height: 30mm; width: auto; object-fit: contain; margin-bottom: 12mm; }
  .cover-inner .company {
    font-weight: 800; font-size: 12pt; letter-spacing: 0.2em; text-transform: uppercase;
    color: var(--ink); margin: 0 0 4mm 0;
  }
  .cover-inner .kind {
    font-family: 'Archivo', sans-serif; font-weight: 900; font-size: 30pt;
    line-height: 1.05; letter-spacing: -0.01em; color: var(--ink); margin: 0 0 5mm 0;
  }
  .cover-inner .kind .accent { color: var(--accent); }
  .cover-inner .rule { width: 40mm; height: 3px; background: var(--accent); margin-bottom: 12mm; }
  .cover-inner .cover-title { font-size: 14pt; font-weight: 700; color: var(--ink); margin: 0 0 2mm 0; max-width: 140mm; }
  .cover-inner .cover-sub { font-size: 9.5pt; color: var(--slate-600); margin: 0 0 14mm 0; font-variant-numeric: tabular-nums; }
  .cover-inner .cover-label {
    font-size: 7.5pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--slate-600); margin: 0 0 3mm 0;
  }
  .cover-inner .cover-name { font-size: 12pt; font-weight: 700; color: var(--ink); margin: 0 0 2mm 0; }
  .cover-inner .cover-info { font-size: 10pt; color: var(--slate-700); line-height: 1.6; }

  /* Kjøreskriptet måler .body-barna med getBoundingClientRect(), som ikke tar med
     marger. Hver paragraf får derfor flow-root og padding i stedet for margin. */
  .sec { display: flow-root; padding-bottom: 6mm; }
  .sec h3 {
    font-size: 11pt; font-weight: 800; color: var(--ink); letter-spacing: -0.01em;
    margin: 0 0 3mm 0; padding-bottom: 2mm; border-bottom: 1.5px solid var(--ink);
  }
  /* Bare avtaleteksten — ikke p-ene inne i .info-cell, som har sine egne regler */
  .sec > p { font-size: 10pt; line-height: 1.6; color: var(--slate-700); margin: 0 0 3mm 0; }
  .sec > p:last-child { margin-bottom: 0; }
  .sec ul { margin: 0; padding-left: 6mm; }
  .sec li { font-size: 10pt; line-height: 1.6; color: var(--slate-700); margin-bottom: 1mm; }
  .sec strong { color: var(--ink); font-weight: 700; }
  /* Tilbudsteksten limes inn ordrett — avsnitt og punktlister må overleve */
  .scope { white-space: pre-wrap; }
  .party-meta { font-size: 9.5pt; color: var(--slate-700); margin: 0; }

  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14mm; margin-top: 4mm; }
  .sig-box .lbl {
    font-size: 7.5pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--slate-600); margin-bottom: 3mm;
  }
  .sig-box .name { font-size: 10.5pt; font-weight: 700; color: var(--ink); margin-bottom: 5mm; }
  .sig-box .role { font-size: 9pt; color: var(--slate-600); margin-bottom: 1mm; }
  .sig-img { max-height: 18mm; max-width: 55mm; width: auto; display: block; margin-bottom: 2mm; object-fit: contain; }
  .sig-blank { height: 18mm; border-bottom: 1px dashed var(--slate-300); margin-bottom: 2mm; }
  .sig-line { border-top: 1px solid var(--ink); padding-top: 3mm; font-size: 8.5pt; color: var(--slate-600); }
  .sig-line + .sig-line { margin-top: 6mm; }

  .foot-row {
    display: flex; justify-content: space-between; gap: 8mm; padding-top: 3mm;
    font-size: 7.5pt; color: var(--slate-600);
  }
  .foot-row .ft-strong { color: var(--ink); font-weight: 600; }

  @media print {
    .sec      { break-inside: avoid; page-break-inside: avoid; }
    .sig-grid { break-inside: avoid; page-break-inside: avoid; }
  }`;

/**
 * Entreprisekontrakt som PDF. Deler grunnmur med tilbuds-PDF-en: pdfStyles() for
 * drakten og PDF_REFLOW_SCRIPT for sideombrekkingen.
 *
 * Hver paragraf legges ut som sin egen .page. Skriptets tryMerge slår deretter
 * sammen sidene som får plass sammen, så korte kontrakter blir få sider og lange
 * får så mange de trenger — uten at en paragraf blir delt på tvers av arkene.
 *
 * En paragraf som er høyere enn arket flyttes videre blokk for blokk (overskrift,
 * avsnitt). Er ett enkelt avsnitt alene høyere enn arket — §3 limer inn hele
 * tilbudsteksten som én <p> — finnes det ingen mindre bit å flytte, og den siden
 * renner fortsatt over.
 */
export function openContractPdf(d: ContractData, targetWin?: Window | null) {
  // Se kommentaren i openOfferPdf — ingen fallback til Techauge-logoen
  const logoUrl = escapeHtml(d.logo_url || "");
  // Kundesignaturen er skrevet av en uinnlogget kunde — se safeImageSrc
  const customerSignatureSrc = safeImageSrc(d.customer_signature);
  const refSignatureSrc = safeImageSrc(d.ref_signature);
  const nokFmt = (n: number) =>
    new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " kr";
  const dateFmt = (s: string) =>
    s ? new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(s)) : "—";

  const offerNo = escapeHtml(String(d.offer_number));

  // Tomt forbehold er en helt normal tilstand, og kontrakten går foran tilbudet ved
  // motstrid (§2). Hardkodede forbehold her ville derfor pålagt kunden vilkår som
  // verken står i tilbudet eller er avtalt.
  const forbeholdHtml = (d.forbehold ?? []).length > 0
    ? (d.forbehold!).map((f) =>
        `<li><strong>${escapeHtml(f.title)}</strong>${f.description ? ` – ${escapeHtml(f.description)}` : ""}</li>`
      ).join("")
    : "<li>Ingen særskilte forbehold.</li>";

  // Omfanget står som eget avsnitt med pre-wrap. Limt inn midt i en setning
  // kollapset avsnittene og punktlistene i tilbudsteksten til én lang linje.
  const scopeText = (d.offer_text ?? "").trim() || d.title;

  const contHeader = `<header class="cont-header">
      <div class="cont-meta">
        <span>${escapeHtml(d.company_name)} — Entreprisekontrakt · Tilbud ${offerNo}</span>
        <span>Side <span class="page-num"></span></span>
      </div>
    </header>`;

  const footer = `<footer class="footer">
      <div class="foot-row">
        <span class="ft-strong">${escapeHtml(d.company_name)}${d.company_org_nr ? ` · Org.nr. ${escapeHtml(d.company_org_nr)}` : ""}</span>
        <span>Entreprisekontrakt · Tilbud nr. ${offerNo}${d.project_number ? ` · Prosjektnr. ${escapeHtml(d.project_number)}` : ""} · Side <span class="page-num"></span></span>
      </div>
    </footer>`;

  // Avtaleteksten, én paragraf per blokk. Innholdet er ordrett som før — bare
  // drakten er ny, med unntak av §3, §5 og §12 som er rettet hver for seg.
  const sections: string[] = [
    `<div class="sec">
      <h3>1. Partene</h3>
      <div class="info-grid">
        <div class="info-cell">
          <p class="label">Entreprenør</p>
          <p class="name">${escapeHtml(d.company_name)}</p>
          ${d.company_org_nr ? `<p class="line">Org.nr. ${escapeHtml(d.company_org_nr)}</p>` : ""}
          ${d.company_address ? `<p class="line">${escapeHtml(d.company_address)}</p>` : ""}
          ${d.company_phone ? `<p class="line">Tlf. ${escapeHtml(d.company_phone)}</p>` : ""}
        </div>
        <div class="info-cell">
          <p class="label">Kunde</p>
          <p class="name">${escapeHtml(d.customer_name)}</p>
          ${d.customer_address ? `<p class="line">${escapeHtml(d.customer_address)}</p>` : ""}
          ${d.customer_phone ? `<p class="line">Tlf. ${escapeHtml(d.customer_phone)}</p>` : ""}
        </div>
      </div>
      ${d.project_number ? `<p class="party-meta"><strong>Prosjektnr.</strong> ${escapeHtml(d.project_number)}</p>` : ""}
    </div>`,

    `<div class="sec">
      <h3>2. Kontraktsgrunnlag</h3>
      <p>Kontrakten bygger på tilbud nr. ${offerNo} datert ${dateFmt(d.offer_date)}. Tilbudet med beskrivelser, mengder, illustrasjoner og forbehold utgjør vedlegg 1 til denne kontrakten. Ved motstrid går denne kontrakten foran tilbudet.</p>
    </div>`,

    `<div class="sec">
      <h3>3. Arbeidets omfang</h3>
      <p>Entreprenøren skal utføre arbeidene som er beskrevet nedenfor. Arbeidene utføres etter god fagmessig standard.</p>
      <p class="scope">${escapeHtml(scopeText)}</p>
    </div>`,

    `<div class="sec">
      <h3>4. Kontraktssum</h3>
      <div class="totals">
        <div class="row grand">
          <span class="k">Kontraktssum inkl. mva</span>
          <span class="v">${nokFmt(d.total_incl_vat)}<span class="cur">NOK</span></span>
        </div>
      </div>
    </div>`,

    `<div class="sec">
      <h3>5. Betalingsplan</h3>
      <p>Betalingsplan avtales mellom partene. ${d.payment_terms
        ? `Betalingsbetingelser: ${escapeHtml(d.payment_terms)}.`
        : "Betalingsfrist er 14 dager fra fakturadato."}</p>
    </div>`,

    `<div class="sec">
      <h3>6. Manglende betaling</h3>
      <p>Ved manglende betaling har entreprenøren rett til å stanse arbeidene umiddelbart. Entreprenøren kan kreve forsinkelsesrenter, dekning av merkostnader og nødvendig fristforlengelse som følge av betalingsmislighold.</p>
    </div>`,

    `<div class="sec">
      <h3>7. Tilleggsarbeider</h3>
      <p>Arbeider utenfor kontraktens omfang anses som tilleggsarbeider. Tilleggsarbeider skal varsles så langt det er praktisk mulig før utførelse og faktureres etter avtale eller etter medgått tid, maskinbruk, materialer og underentreprenørkostnader.</p>
    </div>`,

    `<div class="sec">
      <h3>8. Fremdrift og fristforlengelse</h3>
      <p>Entreprenøren har rett til fristforlengelse ved værforhold, naturhendelser, leveranseproblemer, offentlige pålegg, forhold hos kunden eller andre forhold utenfor entreprenørens kontroll.</p>
    </div>`,

    `<div class="sec">
      <h3>9. Forbehold</h3>
      <ul>${forbeholdHtml}</ul>
    </div>`,

    `<div class="sec">
      <h3>10. Reklamasjon</h3>
      <p>Eventuelle mangler skal meldes skriftlig innen rimelig tid. Entreprenøren skal gis mulighet til å undersøke og eventuelt utbedre forholdet før andre engasjeres.</p>
    </div>`,

    `<div class="sec">
      <h3>11. Eiendomsforbehold</h3>
      <p>Leverte materialer og utført arbeid forblir entreprenørens eiendom inntil fullt oppgjør er mottatt i den grad loven tillater dette.</p>
    </div>`,

    `<div class="sec">
      <h3>12. Tvister</h3>
      <p>Tvister skal først søkes løst ved forhandlinger. Dersom dette ikke fører frem, skal tvisten avgjøres av de ordinære domstoler ${d.venue
        ? `med ${escapeHtml(d.venue)} som avtalt verneting`
        : "ved saksøktes alminnelige verneting"}. Norsk rett gjelder.</p>
    </div>`,

    `<div class="sec">
      <h3>13. Signaturer</h3>
      <div class="sig-grid">
        <div class="sig-box">
          <div class="lbl">For kunden</div>
          <div class="name">${escapeHtml(d.customer_signed_name ?? d.customer_name)}</div>
          ${customerSignatureSrc
            ? `<img src="${customerSignatureSrc}" alt="Kundesignatur" class="sig-img" />`
            : `<div class="sig-blank"></div>`}
          <div class="sig-line">Dato: ${d.customer_signed_at ? dateFmt(d.customer_signed_at) : "_______________________"}</div>
          <div class="sig-line">Navn: ${escapeHtml(d.customer_signed_name ?? "_______________________")}</div>
        </div>
        <div class="sig-box">
          <div class="lbl">For ${escapeHtml(d.company_name)}</div>
          <div class="name">${escapeHtml(d.ref_name ?? d.company_ceo ?? "")}</div>
          ${refSignatureSrc
            ? `<img src="${refSignatureSrc}" alt="Signatur" class="sig-img" />`
            : `<div class="sig-blank"></div>`}
          ${d.ref_position ? `<div class="role">${escapeHtml(d.ref_position)}</div>` : ""}
          ${d.ref_phone ? `<div class="role">Tlf. ${escapeHtml(d.ref_phone)}</div>` : ""}
          <div class="sig-line">Dato: ${dateFmt(d.offer_date)}</div>
          <div class="sig-line">Navn: ${escapeHtml(d.ref_name ?? d.company_ceo ?? "_______________________")}</div>
        </div>
      </div>
    </div>`,
  ];

  const contentPages = sections.map((sec) => `<main class="page">
  ${contHeader}
  <section class="body">
    ${sec}
  </section>
  ${footer}
</main>`).join("\n");

  const html = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8"/>
<title>Entreprisekontrakt – ${escapeHtml(d.company_name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>
${pdfStyles()}
${CONTRACT_STYLES}
</style>
</head>
<body>
<!--
  Forsiden fyller arket alene, slik at kjøreskriptet aldri drar avtaletekst opp på
  den. Paragrafene under starter som én side hver og blir slått sammen av tryMerge.
  page-closing er flagget kjøreskriptet respekterer: uten det ville reflowTextPages
  ha prøvd å dele forsiden, som alltid måler fulle 297 mm fordi .cover-inner er
  flex-fylt — og hele forsiden hadde blitt flyttet til et nytt ark.
-->
<main class="page page-cover page-closing">
  <section class="body">
    <div class="cover-inner">
      ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="${escapeHtml(d.company_name)}" onerror="this.style.display='none'" />` : ""}
      <p class="company">${escapeHtml(d.company_name)}</p>
      <h1 class="kind">ENTREPRISE<span class="accent">KONTRAKT</span></h1>
      <div class="rule"></div>
      ${d.title ? `<p class="cover-title">${escapeHtml(d.title)}</p>` : ""}
      <p class="cover-sub">Tilbud nr. ${offerNo} · ${dateFmt(d.offer_date)}${d.project_number ? ` · Prosjektnr. ${escapeHtml(d.project_number)}` : ""}</p>
      <p class="cover-label">Kunde</p>
      <p class="cover-name">${escapeHtml(d.customer_name)}</p>
      <div class="cover-info">
        ${d.customer_address ? escapeHtml(d.customer_address) + "<br/>" : ""}
        ${d.customer_phone ? "Tlf. " + escapeHtml(d.customer_phone) : ""}
      </div>
    </div>
  </section>
</main>
${contentPages}
<!--
  Malen reflowTextPages bygger overflytssider av. Uten den gjorde skriptet ingenting
  på kontrakten: en lang §3 (hele tilbudsteksten limes inn der) vokste forbi arket,
  og sidetallene talte .page-elementer som ikke stemte med arkene som kom ut.
-->
<template id="cont-page-tpl"><main class="page">
  ${contHeader}
  <section class="body"></section>
  ${footer}
</main></template>
<script>
${PDF_REFLOW_SCRIPT}
</script>
</body>
</html>`;

  const win = targetWin ?? window.open("", "_blank", "width=1000,height=1200");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

interface AmendmentPdfData {
  amendment_number: string;
  project_ref: string;
  internal_description: string;
  change_description: string;
  reason: string;
  other_notes: string;
  notified_date: string;
  revised_date?: string | null;
  project_manager: string;
  project_manager_email?: string;
  customer_name?: string;
  customer_email: string;
  is_mass_settlement: boolean;
  is_additional_work: boolean;
  is_price_increase: boolean;
  status?: string;
  customer_signed_at?: string | null;
  /** Kundens signaturbilde som base64 dataURL — se safeImageSrc */
  customer_signature?: string | null;
}

interface AmendmentLine {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

interface AmendmentTotals {
  subtotal: number;
  total: number;
}

interface AmendmentPdfSettings {
  company_name: string;
  company_tagline: string;
  logo_url?: string;
  company_org_nr?: string;
  vat_pct: number;
  payment_terms: string;
  ref_phone?: string;
  ref_email?: string;
  ref_position?: string;
  ref_signature?: string; // base64 dataURL
}

/**
 * Endringsmelding / krav om endring som PDF — søsterversjonen av openOfferPdf.
 * Deler CSS (PDF_STYLES) og sideombrekking (PDF_REFLOW_SCRIPT) med tilbudet.
 *
 * Vi bygger tre sider: tekstside, linjeside og avslutningsside. Kjøreskriptet
 * pakker tabellradene etter faktisk høyde, lager flere linjesider fra
 * <template id="cont-page-tpl"> ved behov, og slår tekst- og linjesiden sammen
 * igjen når de får plass på samme ark.
 */
export function openAmendmentPdf(
  amendment: AmendmentPdfData,
  lines: AmendmentLine[],
  totals: AmendmentTotals,
  settings: AmendmentPdfSettings,
  targetWin?: Window | null,
) {
  // Ingen fallback til /logo.png — se kommentaren i openOfferPdf
  const logoUrl = escapeHtml(settings.logo_url || "");
  const refSignatureSrc = safeImageSrc(settings.ref_signature);
  // Kunden er uinnlogget når han signerer, så bildet er tegnet utenfor vår
  // kontroll og må gjennom samme kontroll som i kontrakten.
  const customerSignatureSrc = safeImageSrc(amendment.customer_signature);

  // Statusen 'endringsmelding' betyr at kravet er sendt som formell melding.
  // Alt annet (bl.a. 'krav') er fortsatt et krav om endring.
  const isNotice = amendment.status === "endringsmelding";
  const kindHtml = isNotice
    ? `ENDRINGS<span class="accent">MELDING</span>`
    : `KRAV OM <span class="accent">ENDRING</span>`;
  const kindText = isNotice ? "Endringsmelding" : "Krav om endring";
  const number = amendment.amendment_number || "—";

  const vat = totals.total * (settings.vat_pct / 100);
  const totalInclVat = totals.total + vat;
  const hasVat = settings.vat_pct > 0;
  // Delsummen vises bare når den faktisk avviker fra totalen
  const showSubtotal = Math.abs(totals.subtotal - totals.total) > 0.005;

  const now = new Date();
  const nowStr = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(now).replace(",", " ·");

  // Endringslinjer har ingen rabatt — summen er rett og slett antall × pris
  const lineSum = (l: AmendmentLine) => l.quantity * l.unit_price;
  const linesTotal = lines.reduce((s, l) => s + lineSum(l), 0);

  function lineRow(l: AmendmentLine) {
    const net = lineSum(l);
    return `<tr data-sum="${net}">
      <td class="desc-cell"><span class="desc-text">${escapeHtml(l.description)}</span></td>
      <td class="num">${fmtNum(l.quantity)}</td>
      <td class="num">${escapeHtml(l.unit)}</td>
      <td class="num">${fmtNok(l.unit_price)}</td>
      <td class="num">${fmtNok(net)}</td>
    </tr>`;
  }

  function tableHtml(ls: AmendmentLine[]) {
    const rows = ls.length
      ? ls.map(lineRow).join("")
      : `<tr><td colspan="5" style="text-align:center;color:#555;padding:14px 0">Ingen linjer</td></tr>`;
    return `<table class="items">
      <colgroup>
        <col class="a-desc"/><col class="a-qty"/><col class="a-unit"/>
        <col class="a-price"/><col class="a-sum"/>
      </colgroup>
      <thead><tr>
        <th>Beskrivelse</th>
        <th class="num">Antall</th>
        <th class="num">Enhet</th>
        <th class="num">Pris/enhet</th>
        <th class="num">Sum eks. mva</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  const typeTags = [
    amendment.is_mass_settlement ? "Masseavregning" : "",
    amendment.is_additional_work ? "Tilleggsarbeid" : "",
    amendment.is_price_increase ? "Prisstigning" : "",
  ].filter(Boolean);

  const typeTagsHtml = typeTags.length
    ? `<div class="type-tags">${typeTags
        .map((t) => `<span class="type-tag">${escapeHtml(t)}</span>`)
        .join("")}</div>`
    : "";

  // Tomme avsnitt hoppes over helt
  const textBlock = (label: string, text: string) =>
    (text ?? "").trim()
      ? `<div class="doc-block">
          <p class="label">${escapeHtml(label)}</p>
          <p class="body-text">${escapeHtml(text)}</p>
         </div>`
      : "";

  const textBlocksHtml =
    textBlock("Beskrivelse av endring", amendment.change_description) +
    textBlock("Årsak", amendment.reason) +
    textBlock("Andre konsekvenser / merknader", amendment.other_notes);

  const subtotalRow = showSubtotal
    ? `<div class="row sub">
        <span class="k">Delsum</span>
        <span class="v">${fmtNok(totals.subtotal)}</span>
       </div>`
    : "";

  const totalsRows = hasVat
    ? `${subtotalRow}
       <div class="row divider">
        <span class="k">Sum eks. mva</span>
        <span class="v">${fmtNok(totals.total)}</span>
       </div>
       <div class="row sub">
        <span class="k">MVA (${fmtNum(settings.vat_pct)}&nbsp;%)</span>
        <span class="v">${fmtNok(vat)}</span>
       </div>
       <div class="row grand">
         <span class="k">Totalt inkl. mva</span>
         <span class="v">${fmtNok(totalInclVat)}<span class="cur">NOK</span></span>
       </div>`
    : `${subtotalRow}
       <div class="row grand">
         <span class="k">Sum eks. mva</span>
         <span class="v">${fmtNok(totals.total)}<span class="cur">NOK</span></span>
       </div>`;

  const signBlock = `<div class="sign two-col">
      <div class="stamp">
        <p class="stamp-label">For ${escapeHtml(settings.company_name)}</p>
        ${refSignatureSrc
          ? `<img src="${refSignatureSrc}" alt="Signatur" class="sig-img" />`
          : ""}
        <div class="line">${escapeHtml(amendment.project_manager) || "Signatur / dato"}</div>
      </div>
      <div class="stamp">
        <p class="stamp-label">For kunden</p>
        ${amendment.customer_signed_at
          ? `${customerSignatureSrc
              ? `<img src="${customerSignatureSrc}" alt="Kundens signatur" class="sig-img" />`
              : ""}
             <div class="signed">Signert digitalt av kunden ${fmtDate(amendment.customer_signed_at)}</div>`
          : `<div class="line">Signatur / dato</div>`}
      </div>
    </div>`;

  const conditionsHtml = `<div class="conditions two">
      <div class="condition">
        <p class="label">Betalingsbetingelser</p>
        <div class="v">${escapeHtml(settings.payment_terms) || "—"}</div>
      </div>
      <div class="condition">
        <p class="label">Prosjektleder</p>
        <div class="v">${escapeHtml(amendment.project_manager) || "—"}</div>
        ${(settings.ref_phone || settings.ref_email) ? `<div class="ref-contact">
          ${settings.ref_phone ? `<span>Tlf: ${escapeHtml(settings.ref_phone)}</span>` : ""}
          ${settings.ref_email ? `<span>${escapeHtml(settings.ref_email)}</span>` : ""}
        </div>` : ""}
      </div>
    </div>`;

  // Avslutningsblokken står på egen side og skal begynne rett under toppteksten.
  // Med en flex-fill foran seg ble den skjøvet til bunnen, og siden så tom ut —
  // 146 mm hvitt før det kom noe innhold.
  const bottomPush = `<div class="bottom-push">
      <div class="totals-wrap">
        <div class="notes">
          <p class="label">Referanse</p>
          ${amendment.project_ref ? `<div>Prosjektnr. ${escapeHtml(amendment.project_ref)}</div>` : ""}
          <div>${escapeHtml(kindText)} ${escapeHtml(number)}</div>
          <div>Varslet ${fmtDate(amendment.notified_date)}${amendment.revised_date ? ` · revidert ${fmtDate(amendment.revised_date)}` : ""}</div>
        </div>
        <div class="totals">
          ${totalsRows}
        </div>
      </div>
      ${conditionsHtml}
      ${signBlock}
    </div>`;

  const footerHtml = `<footer class="footer">
      <div class="footer-grid">
        <div>
          <div class="ft-label">Selskap</div>
          <div class="ft-v">${escapeHtml(settings.company_name)}</div>
          ${amendment.project_ref ? `<div class="ft-v" style="color:var(--slate-500);font-size:7.5pt;">Prosjekt ${escapeHtml(amendment.project_ref)}</div>` : ""}
        </div>
        ${settings.company_org_nr ? `<div>
          <div class="ft-label">Organisasjon</div>
          <div class="ft-v">Org.nr. ${escapeHtml(settings.company_org_nr)}</div>
        </div>` : "<div></div>"}
        <div>
          <div class="ft-label">Kontakt</div>
          ${amendment.project_manager ? `<div class="ft-v">${escapeHtml(amendment.project_manager)}</div>` : ""}
          ${settings.ref_position ? `<div class="ft-v">${escapeHtml(settings.ref_position)}</div>` : ""}
          ${settings.ref_phone ? `<div class="ft-v">${escapeHtml(settings.ref_phone)}</div>` : ""}
          ${settings.ref_email ? `<div class="ft-v">${escapeHtml(settings.ref_email)}</div>` : ""}
        </div>
      </div>
    </footer>`;

  const masthead = `<header class="masthead">
      <div class="top-meta">
        <span>${nowStr}</span>
        <span>${escapeHtml(kindText)} ${escapeHtml(number)} · Side <span class="page-num">1 / 1</span></span>
      </div>
      <div class="mast-row">
        <div class="brand">
          ${logoUrl ? `<img src="${logoUrl}" alt="${escapeHtml(settings.company_name)}" onerror="this.style.display='none'" />` : ""}
          <div>
            <p class="company">${escapeHtml(settings.company_name)}</p>
            ${settings.company_tagline
              ? `<p class="tag">${escapeHtml(settings.company_tagline).replace(/ [·\/] /g, (m) => ` <span>${m.trim()}</span> `)}</p>`
              : ""}
          </div>
        </div>
        <div class="doc-meta">
          <h1 class="kind kind-sm">${kindHtml}</h1>
          <div class="num-pill">
            <span class="lbl">Nr.</span>
            <span class="v">${escapeHtml(number)}</span>
          </div>
          <dl class="meta-grid">
            ${amendment.project_ref ? `<dt>Prosjektnr.</dt><dd>${escapeHtml(amendment.project_ref)}</dd>` : ""}
            <dt>Dato varslet</dt><dd>${fmtDate(amendment.notified_date)}</dd>
            ${amendment.revised_date ? `<dt>Dato revidert</dt><dd>${fmtDate(amendment.revised_date)}</dd>` : ""}
          </dl>
        </div>
      </div>
    </header>`;

  const infoGrid = `<div class="info-grid">
      <div class="info-cell">
        <p class="label">Prosjektleder</p>
        <p class="name">${escapeHtml(amendment.project_manager) || "—"}</p>
        ${settings.ref_position ? `<p class="line">${escapeHtml(settings.ref_position)}</p>` : ""}
        ${settings.ref_phone ? `<p class="line">Tlf: ${escapeHtml(settings.ref_phone)}</p>` : ""}
        ${amendment.project_manager_email ? `<p class="line">${escapeHtml(amendment.project_manager_email)}</p>` : ""}
      </div>
      <div class="info-cell">
        <p class="label">Kunde</p>
        <p class="name">${escapeHtml(amendment.customer_name) || "—"}</p>
        <dl class="kv">
          <dt>E-post</dt><dd>${escapeHtml(amendment.customer_email) || "—"}</dd>
        </dl>
      </div>
    </div>`;

  // Begge carry-radene står synlige mens kjøreskriptet måler, akkurat som på
  // malsidene — ellers får den første linjesiden 8 mm mer å gå på enn de andre og
  // klemmer inn en rad for mye. recalcCarries skjuler dem igjen der de ikke hører
  // hjemme (øverst på første linjeside, nederst på den siste).
  // Uten linjer finnes ingen tr[data-sum], og da hopper recalcCarries over siden og
  // rekker aldri å skjule radene. En endringsmelding uten prisoverslag ble derfor
  // sendt til kunden med "Overført/Overføres 0,00 kr". Tilbudet skjuler dem i
  // markupen på samme måte.
  const carryHidden = lines.length === 0 ? ` style="display:none"` : "";
  const carryIn = `<div class="carry carry-in"${carryHidden}>
      <span>Overført fra forrige side</span>
      <span>${fmtNok(0)}</span>
     </div>`;
  const carryOut = `<div class="carry carry-out"${carryHidden}>
      <span>Overføres til neste side</span>
      <span>${fmtNok(linesTotal)}</span>
     </div>`;

  const contHeader = `<header class="cont-header">
    <div class="cont-meta">
      <span>${escapeHtml(settings.company_name)} — ${escapeHtml(kindText)} ${escapeHtml(number)}</span>
      <span>Side <span class="page-num"></span></span>
    </div>
  </header>`;

  const html = `<!doctype html>
<html lang="no">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(kindText)} ${escapeHtml(number)} – ${escapeHtml(settings.company_name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>
${pdfStyles()}
</style>
</head>
<body>
<!--
  Samme sideoppsett som et flersides tilbud, og av samme grunn:
  1) tekstside  — innledning, ingen tabell
  2) linjeside  — hele prisoverslaget; kjøreskriptet deler den i flere sider ved behov
  3) page-closing — summer, vilkår og signatur

  Avslutningsblokken må ligge på en side UTEN tabell. Ligger den på en linjeside,
  flytter kjøreskriptet den til den siste siden det lager, og tryMerge kan siden
  slå den siden sammen med den forrige — da forsvinner summene og signaturfeltet.
  page-closing er nettopp det flagget tryMerge respekterer og aldri slår sammen.

  Bunnteksten står bare på den siste siden, slik tilbudet også gjør det. tryMerge
  regner ikke med bunntekst når den vurderer om to sider får plass sammen, så en
  bunntekst på hver side ville gjort de sammenslåtte sidene for høye.
-->
<main class="page page-text">
  ${masthead}
  <section class="body">
    <div class="doc-intro">
      ${infoGrid}
      <div class="project">
        <h2>${escapeHtml(amendment.internal_description) || "—"}</h2>
      </div>
      ${typeTagsHtml}
      ${textBlocksHtml}
    </div>
  </section>
</main>
<main class="page page-lines">
  ${contHeader}
  <section class="body">
    ${carryIn}
    ${tableHtml(lines)}
    ${carryOut}
  </section>
</main>
<main class="page page-closing">
  ${contHeader}
  <section class="body">
    ${bottomPush}
  </section>
  ${footerHtml}
</main>
<!-- Malsidene er også merket page-closing, så tryMerge aldri slår sammen to
     linjesider til én side med to tabeller. -->
<template id="cont-page-tpl"><main class="page page-lines page-closing">
  ${contHeader}
  <section class="body">
    <div class="carry carry-in"><span>Overført fra forrige side</span><span></span></div>
    ${tableHtml([])}
    <div class="carry carry-out"><span>Overføres til neste side</span><span></span></div>
  </section>
</main></template>
<script>
${PDF_REFLOW_SCRIPT}
</script>
</body>
</html>`;

  const win = targetWin ?? window.open("", "_blank", "width=1000,height=1200");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
