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

export const escapeHtml = (s: string | null | undefined) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

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

export function openOfferPdf(
  offer: OfferPdfData,
  lines: OfferLine[],
  totals: OfferTotals,
  settings: OfferPdfSettings,
) {
  const logoUrl = settings.logo_url || (window.location.origin + "/logo.png");
  const included = lines.filter((l) => l.included);
  const vat = totals.total * (settings.vat_pct / 100);
  const totalInclVat = totals.total + vat;
  const now = new Date();
  const nowStr = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(now).replace(",", " ·");

  // Grenser for antal linjer per side
  // Éi-sides tilbud: ≤4 linjer og kort tilbudstekst → alt på side 1 inkl. avslutning
  // Fleirsides tilbud: eigen dedikert avslutningsside (ingen tabell) → alltid plass
  const textLen = (offer.offer_text ?? "").length;
  const forbeholdCount = (settings.forbehold ?? []).length;

  // Tel faktiske linjeskift + teikn-wrap for betre estimat
  const offerTextLines = (offer.offer_text ?? "").split("\n");
  const totalTextLines = offerTextLines.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 68)), 0);
  const estTextMm = totalTextLines * 6.2;

  // Forbehold: kvar post = tittel + beskriving (~14mm per post)
  const estForbeholdMm = forbeholdCount * 14;

  // Fast innhald på side 1: topptekst + kundeblokk + overskrift + tabell-header + carry-out + padding
  const FIXED_MM = 145;
  const LINE_MM = 13; // høgde per tilbudslinje (inkl. kommentar-rom)
  const PAGE_MM = 297;

  // Kor mange linjar får faktisk plass på side 1?
  const availForLines = PAGE_MM - FIXED_MM - estTextMm - estForbeholdMm;
  const LINES_PAGE_1 = Math.min(8, Math.max(1, Math.floor(availForLines / LINE_MM)));

  // Max høgde tilbudstekst kan ta — vert klippa av overflow:hidden
  const maxDescMm = Math.max(18, PAGE_MM - FIXED_MM - estForbeholdMm - (LINES_PAGE_1 * LINE_MM) - 8);
  const LINES_PER_PAGE = 22;

  // Éi-siders tilbud: ingen forbehold, kort tekst, få linjer.
  // Avslutningsblokka (summar + vilkår + signatur) er tung, så grensene er
  // stramme for å unngå at botnen renn over på side 2.
  const SHORT_LINE_LIMIT = 3;
  const SHORT_TEXT_LIMIT = 240;
  const isSinglePage =
    included.length <= SHORT_LINE_LIMIT &&
    textLen < SHORT_TEXT_LIMIT &&
    forbeholdCount === 0;

  // Multi-side tilbud bruker alltid dedikert tekstside (side 1) og pristabell (side 2+)
  const useTextPage = !isSinglePage;

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
    return `<tr>
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

  if (isSinglePage) {
    typedPages.push({ kind: "lines", rows: remaining.splice(0, SHORT_LINE_LIMIT) });
  } else {
    typedPages.push({ kind: "text" });
    if (forbeholdCount > 0) typedPages.push({ kind: "forbehold" });
    while (remaining.length > 0) typedPages.push({ kind: "lines", rows: remaining.splice(0, LINES_PER_PAGE) });
    typedPages.push({ kind: "closing" });
  }

  // Bakoverkompatibelt: behold pages-array for kumulative summar
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
              <img src="${logoUrl}" alt="${escapeHtml(settings.company_name)}" onerror="this.style.display='none'" />
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
                <dt>Gyldig t.o.m.</dt><dd>${fmtDate(offer.valid_until)}</dd>
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

    const carryIn = !isFirst && cumulativeBefore > 0
      ? `<div class="carry carry-in">
          <span>Overført frå forrige side</span>
          <span>${fmtNok(cumulativeBefore)}</span>
         </div>`
      : "";

    const carryOut = !isLast
      ? `<div class="carry carry-out">
          <span>Overføres til neste side</span>
          <span>${fmtNok(cumulativeAfter)}</span>
         </div>`
      : "";

    const hasAdmin = totals.admin > 0;
    const totalsBlock = isLast ? `
      <div class="flex-fill"></div>
      <div class="bottom-push${isClosingPage ? " closing-push" : ""}">
        <div class="totals-wrap">
          <div class="notes">
            ${settings.payment_terms
              ? `<p class="label">Betalingsbetingelser</p>${escapeHtml(settings.payment_terms)}`
              : ""}
          </div>
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
          <div class="condition">
            <p class="label">Tilbudet gyldig</p>
            <div class="v">T.o.m. ${fmtDate(offer.valid_until)}</div>
          </div>
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
            ${settings.ref_signature
              ? `<img src="${settings.ref_signature}" alt="Signatur" class="sig-img" />`
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
            <div class="ft-v" style="color:var(--slate-500);font-size:7.5pt;">Tommy Hauge — Daglig leder</div>
          </div>
          <div>
            <div class="ft-label">Organisasjon</div>
            <div class="ft-v">Org.nr. 931 356 933</div>
          </div>
          <div>
            <div class="ft-label">Kontakt</div>
            <div class="ft-v">Tommy Hauge</div>
            <div class="ft-v">Daglig leder</div>
            <div class="ft-v">+47 907 45 200</div>
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

    // Berre pristabell-sider viser tabellen
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
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  :root {
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
    font-family: 'JetBrains Mono', monospace;
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
    font-family: 'JetBrains Mono', monospace; font-size: 9pt; font-weight: 500; margin-bottom: 6mm;
  }
  .doc-meta .num-pill .lbl { font-size: 7pt; letter-spacing: 0.18em; text-transform: uppercase; color: var(--slate-600); }
  .doc-meta .num-pill .v { font-weight: 700; color: var(--ink); }
  .meta-grid { display: grid; grid-template-columns: auto auto; gap: 3px 16px; margin: 0; justify-content: end; }
  .meta-grid dt { color: var(--slate-700); text-transform: uppercase; letter-spacing: 0.14em; font-size: 7.5pt; font-weight: 700; text-align: right; }
  .meta-grid dd { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 9pt; font-weight: 600; color: var(--ink); text-align: right; }

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
  /* Beskriving: maks 3 linjer, kommentar: maks 2 linjer */
  .desc-text { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .comment { font-size: 8.5pt; color: var(--slate-600); font-weight: 400; font-style: italic; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; }
  .strikethrough { font-size: 8pt; color: var(--slate-400); text-decoration: line-through; display: block; }

  /* Skyver avslutning til bunnen på siste side */
  .flex-fill { flex: 1; }
  .bottom-push { padding-top: 4mm; }
  /* Avslutningsside utan linjer: stor toppadding for å simulere botn-plassering */
  .closing-push { padding-top: ${settings.closing_page_offset_mm ?? 90}mm; }

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
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    letter-spacing: 0.1em;
    color: var(--slate-600);
    margin-top: 6mm;
  }

  .carry {
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5pt;
    font-weight: 600;
    color: var(--slate-600);
    padding: 6px 0;
    letter-spacing: 0.04em;
  }
  .carry-in { border-bottom: 1.5px solid var(--slate-200); margin-bottom: 4px; }
  .carry-out { border-top: 1.5px solid var(--ink); margin-top: 4px; color: var(--ink); }

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
    .bottom-push  { page-break-inside: avoid; break-inside: avoid; }
    .totals-wrap { page-break-inside: avoid; break-inside: avoid; }
    .conditions   { page-break-inside: avoid; break-inside: avoid; }
    .sign         { page-break-inside: avoid; break-inside: avoid; }
    .footer       { page-break-inside: avoid; break-inside: avoid; }
    .carry        { page-break-inside: avoid; break-inside: avoid; }
  }
</style>
</head>
<body>
${pagesHtml}
<script>
(function() {
  var PX_MM = 96 / 25.4;
  var PAGE_MM = 297;
  var BUFFER_MM = 44; // tryggheitsmarginen (skjerm-px vs utskrift-mm er ikkje eksakt)

  function mm(el) { return el ? el.getBoundingClientRect().height / PX_MM : 0; }

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

      // Avslutningssida skal alltid vere eigen side
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
    // Vent på at fontar er lasta – gjer målinga nøyaktig
    var ready = (typeof document.fonts !== 'undefined' && document.fonts.ready)
      ? document.fonts.ready
      : Promise.resolve();
    ready.then(function() {
      var changed = true;
      while (changed) { changed = tryMerge(); }
      updatePageNumbers();
      setTimeout(function() { window.print(); }, 300);
    });
  };
})();
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1000,height=1200");
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
}

export function openContractPdf(d: ContractData) {
  const logoUrl = d.logo_url || (window.location.origin + "/logo.png");
  const nokFmt = (n: number) =>
    new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " kr";
  const dateFmt = (s: string) =>
    s ? new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(s)) : "—";

  const forbeholdHtml = (d.forbehold ?? []).length > 0
    ? (d.forbehold!).map((f) =>
        `<li><strong>${escapeHtml(f.title)}</strong>${f.description ? ` – ${escapeHtml(f.description)}` : ""}</li>`
      ).join("")
    : "<li>Værforhold og naturhendelser.</li><li>Uforutsette grunnforhold, kabler, rør eller fundamenter.</li>";

  const html = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8"/>
<title>Entreprisekontrakt – ${escapeHtml(d.company_name)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11pt; line-height: 1.5; margin: 0; background: #ECECE7; }

  /* A4-ark: skjerm viser dei som separate sider med skugge */
  .sheet {
    width: 210mm; min-height: 297mm;
    background: #fff; margin: 8mm auto;
    box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 18px 50px rgba(20,20,20,.16);
    position: relative; overflow: hidden;
  }
  .sheet-body { padding: 20mm 18mm; }
  .cover-sheet { padding: 20mm 18mm; display: flex; }
  /* Kjelda som skriptet måler ut frå – usynleg, men med rett innhaldsbreidde */
  #flow { position: absolute; left: -9999px; top: 0; width: 174mm; visibility: hidden; }

  .cover { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 257mm; text-align: center; gap: 0; }
  .cover img { height: 36mm; width: auto; margin-bottom: 16mm; }
  .cover h1 { font-size: 18pt; font-weight: 900; letter-spacing: 0.04em; margin: 0 0 2mm 0; }
  .cover h2 { font-size: 15pt; font-weight: 700; letter-spacing: 0.06em; margin: 0 0 16mm 0; }
  .cover .proj-label { font-size: 10pt; font-weight: 700; margin-bottom: 1mm; }
  .cover .proj-line { font-size: 10pt; border-bottom: 1px solid #111; width: 60mm; display: inline-block; margin-bottom: 10mm; }
  .cover .desc { font-size: 11pt; font-weight: 700; margin: 4mm 0 2mm 0; }
  .cover .addr { font-size: 10pt; margin: 0 0 10mm 0; }
  .cover .kunde-label { font-size: 11pt; font-weight: 900; letter-spacing: 0.1em; margin: 6mm 0 4mm 0; }
  .cover .kunde-name { font-size: 11pt; font-weight: 700; margin-bottom: 1mm; }
  .cover .kunde-info { font-size: 10pt; line-height: 1.6; }

  .content { }
  h3 { font-size: 13pt; font-weight: 900; margin: 8mm 0 3mm 0; border-bottom: 1px solid #111; padding-bottom: 1mm; }
  p { margin: 0 0 4mm 0; }
  table.bp { width: 100%; border-collapse: collapse; margin: 4mm 0 6mm 0; }
  table.bp th { background: #111; color: #fff; padding: 5px 8px; font-size: 10pt; text-align: left; }
  table.bp td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 10pt; }
  table.bp td:last-child { text-align: right; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-bottom: 6mm; }
  .party-box { background: #f5f5f5; border-left: 3px solid #111; padding: 5mm; }
  .party-box .lbl { font-size: 9pt; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 2mm; color: #555; }
  .party-box p { margin: 0; font-size: 10pt; line-height: 1.6; }
  .sig-section { margin-top: 10mm; page-break-inside: avoid; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16mm; margin-top: 4mm; }
  .sig-box .lbl { font-weight: 700; font-size: 10pt; margin-bottom: 3mm; }
  .sig-box .name { font-size: 10pt; margin-bottom: 8mm; }
  .sig-line { border-top: 1px solid #111; padding-top: 3mm; font-size: 9pt; color: #555; }
  .sig-line + .sig-line { margin-top: 8mm; }
  .sig-img { max-height: 18mm; max-width: 60mm; width: auto; display: block; margin-bottom: 2mm; }
  .sec { break-inside: avoid; page-break-inside: avoid; }
  @media print {
    body { font-size: 10pt; background: #fff; }
    .sheet {
      width: 210mm; height: 297mm; min-height: 297mm;
      margin: 0; box-shadow: none;
      page-break-after: always; break-after: page;
    }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .cover { min-height: auto; height: 257mm; }
    /* Hald overskrift saman med teksten under, og unngå at avsnitt/seksjonar delast */
    h3 { break-after: avoid; page-break-after: avoid; }
    .sec, p, ul, li, table.bp, .parties, .sig-section { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- Sider vert bygd her av pagineringsskriptet -->
<div id="pages">
  <!-- FORSIDE -->
  <div class="sheet cover-sheet">
    <div class="cover">
      <img src="${logoUrl}" alt="${escapeHtml(d.company_name)}" onerror="this.style.display='none'" />
      <h1>${escapeHtml(d.company_name).toUpperCase()}</h1>
      <h2>ENTREPRISEKONTRAKT</h2>

      <div class="proj-label">Prosjekt nr.:</div>
      <div class="proj-line">${escapeHtml(d.project_number ?? "")}&nbsp;</div>

      ${d.title ? `<div class="desc">${escapeHtml(d.title)}</div>` : ""}
      ${d.customer_address ? `<div class="addr">${escapeHtml(d.customer_address)}</div>` : ""}

      <div class="kunde-label">KUNDE</div>
      <div class="kunde-name">${escapeHtml(d.customer_name)}</div>
      <div class="kunde-info">
        ${d.customer_address ? escapeHtml(d.customer_address) + "<br/>" : ""}
        ${d.customer_phone ? "Tlf. " + escapeHtml(d.customer_phone) : ""}
      </div>
    </div>
  </div>
</div>

<!-- AVTALETEKST (kjelde – vert flytta inn i sider av skriptet) -->
<div id="flow">

<div class="sec">
<h3>1. Partene</h3>
<div class="parties">
  <div class="party-box">
    <div class="lbl">Entreprenør</div>
    <p><strong>${escapeHtml(d.company_name)}</strong><br/>
    ${d.company_org_nr ? "Org.nr. " + escapeHtml(d.company_org_nr) + "<br/>" : ""}
    ${d.company_address ? escapeHtml(d.company_address) + "<br/>" : ""}
    ${d.company_phone ? "Tlf. " + escapeHtml(d.company_phone) : ""}</p>
  </div>
  <div class="party-box">
    <div class="lbl">Kunde</div>
    <p><strong>${escapeHtml(d.customer_name)}</strong><br/>
    ${d.customer_address ? escapeHtml(d.customer_address) + "<br/>" : ""}
    ${d.customer_phone ? "Tlf. " + escapeHtml(d.customer_phone) : ""}</p>
  </div>
</div>
</div>

<div class="sec">
<h3>2. Kontraktsgrunnlag</h3>
<p>Kontrakten bygger på tilbud nr. ${escapeHtml(String(d.offer_number))} datert ${dateFmt(d.offer_date)}. Tilbudet med beskrivelser, mengder, illustrasjoner og forbehold utgjør vedlegg 1 til denne kontrakten. Ved motstrid går denne kontrakten foran tilbudet.</p>
</div>

<div class="sec">
<h3>3. Arbeidets omfang</h3>
<p>Entreprenøren skal utføre ${d.offer_text ? escapeHtml(d.offer_text) : escapeHtml(d.title)}. Arbeidene utføres etter god fagmessig standard.</p>
</div>

<div class="sec">
<h3>4. Kontraktssum</h3>
<p><strong>${nokFmt(d.total_incl_vat)}&nbsp;inkl. mva</strong></p>
</div>

<div class="sec">
<h3>5. Betalingsplan</h3>
<p>Betalingsplan avtalast mellom partane. Betalingsfrist er 14 dager fra fakturadato.</p>
</div>

<div class="sec">
<h3>6. Manglende betaling</h3>
<p>Ved manglende betaling har entreprenøren rett til å stanse arbeidene umiddelbart. Entreprenøren kan kreve forsinkelsesrenter, dekning av merkostnader og nødvendig fristforlengelse som følge av betalingsmislighold.</p>
</div>

<div class="sec">
<h3>7. Tilleggsarbeider</h3>
<p>Arbeider utenfor kontraktens omfang anses som tilleggsarbeider. Tilleggsarbeider skal varsles så langt det er praktisk mulig før utførelse og faktureres etter avtale eller etter medgått tid, maskinbruk, materialer og underentreprenørkostnader.</p>
</div>

<div class="sec">
<h3>8. Fremdrift og fristforlengelse</h3>
<p>Entreprenøren har rett til fristforlengelse ved værforhold, naturhendelser, leveranseproblemer, offentlige pålegg, forhold hos kunden eller andre forhold utenfor entreprenørens kontroll.</p>
</div>

<div class="sec">
<h3>9. Forbehold</h3>
<ul>
${forbeholdHtml}
</ul>
</div>

<div class="sec">
<h3>10. Reklamasjon</h3>
<p>Eventuelle mangler skal meldes skriftlig innen rimelig tid. Entreprenøren skal gis mulighet til å undersøke og eventuelt utbedre forholdet før andre engasjeres.</p>
</div>

<div class="sec">
<h3>11. Eiendomsforbehold</h3>
<p>Leverte materialer og utført arbeid forblir entreprenørens eiendom inntil fullt oppgjør er mottatt i den grad loven tillater dette.</p>
</div>

<div class="sec">
<h3>12. Tvister</h3>
<p>Tvister skal først søkes løst ved forhandlinger. Dersom dette ikke fører frem, skal tvisten avgjøres av de ordinære domstoler med Agder tingrett som avtalt verneting. Norsk rett gjelder.</p>
</div>

<div class="sec">
<h3>13. Signaturer</h3>
<div class="sig-section">
  <div class="sig-grid">
    <div class="sig-box">
      <div class="lbl">For kunden</div>
      <div class="name">${escapeHtml(d.customer_signed_name ?? d.customer_name)}</div>
      ${d.customer_signature
        ? `<img src="${d.customer_signature}" alt="Kundesignatur" class="sig-img" />`
        : `<div style="height:18mm;border-bottom:1px dashed #aaa;margin-bottom:2mm;"></div>`}
      <div class="sig-line">Dato: ${d.customer_signed_at ? dateFmt(d.customer_signed_at) : "_______________________"}</div>
      <div class="sig-line">Navn: ${escapeHtml(d.customer_signed_name ?? "_______________________")}</div>
    </div>
    <div class="sig-box">
      <div class="lbl">For ${escapeHtml(d.company_name)}</div>
      <div class="name">${escapeHtml(d.ref_name ?? d.company_ceo ?? "")}</div>
      ${d.ref_signature
        ? `<img src="${d.ref_signature}" alt="Signatur" class="sig-img" />`
        : `<div style="height:18mm;border-bottom:1px dashed #aaa;margin-bottom:2mm;"></div>`}
      ${d.ref_position ? `<div style="font-size:9pt;color:#555;margin-bottom:1mm;">${escapeHtml(d.ref_position)}</div>` : ""}
      ${d.ref_phone ? `<div style="font-size:9pt;color:#555;margin-bottom:2mm;">Tlf. ${escapeHtml(d.ref_phone)}</div>` : ""}
      <div class="sig-line">Dato: ${dateFmt(d.offer_date)}</div>
      <div class="sig-line">Navn: ${escapeHtml(d.ref_name ?? d.company_ceo ?? "_______________________")}</div>
    </div>
  </div>
</div>
</div>

</div>

<script>
(function () {
  var PX_MM = 96 / 25.4;
  // A4 innhaldshøgde = 297mm - topp/botn marg (20mm + 20mm) = 257mm.
  // Litt slingringsmonn for måleavvik skjerm-px vs utskrift.
  var CONTENT_MM = 252;

  function mm(el) {
    var cs = window.getComputedStyle(el);
    var marg = (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
    return (el.getBoundingClientRect().height + marg) / PX_MM;
  }

  function paginate() {
    var flow = document.getElementById('flow');
    if (!flow) return;
    var blocks = Array.from(flow.children);
    var pagesHost = document.getElementById('pages');

    var sheet = null;
    var sheetBody = null;
    var used = 0;

    function newSheet() {
      sheet = document.createElement('div');
      sheet.className = 'sheet content-sheet';
      sheetBody = document.createElement('div');
      sheetBody.className = 'sheet-body';
      sheet.appendChild(sheetBody);
      pagesHost.appendChild(sheet);
      used = 0;
    }

    newSheet();
    blocks.forEach(function (block) {
      sheetBody.appendChild(block);
      var h = mm(block);
      // Får ikkje plass på denne sida → flytt til ny side (med mindre sida er tom)
      if (used + h > CONTENT_MM && used > 0) {
        newSheet();
        sheetBody.appendChild(block);
        h = mm(block);
      }
      used += h;
    });

    flow.remove();
  }

  window.onload = function () {
    var ready = (typeof document.fonts !== 'undefined' && document.fonts.ready)
      ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      paginate();
      setTimeout(function () { window.print(); }, 300);
    });
  };
})();
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
