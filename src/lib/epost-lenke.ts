// E-post med signeringslenken bak en knapp i stedet for som rå adresse.
//
// En mailto kan bare bære ren tekst, og da så kunden hele
// https://tilbudssystem-mal.vercel.app/signer/3f2a9c1e-… — en adresse som ser
// ut som svindel for den som er redd for å bli lurt. Outlook beholder derimot
// lenker med egen tekst når de limes inn. Derfor legges e-posten på
// utklippstavlen som HTML, og mailto-en får bare mottaker og emne.
//
// Lenken går fortsatt til samme sted; det er bare teksten som er byttet ut.

export type Avsnitt = string | { lenke: string; tekst: string };

const KNAPPEFARGE = "#b91c1c";

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Bare http(s) blir lenke. Alt annet ville vært en vei inn for javascript: o.l. */
function tryggLenke(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

// Outlook på PC tegner med Word og ignorerer padding og avrundede hjørner på en
// lenke. Knappen er derfor en tabellcelle med farge, som alle e-postprogrammer
// viser likt, og lenken ligger inni den.
function knapp(lenke: string, tekst: string): string {
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>` +
    `<td bgcolor="${KNAPPEFARGE}" style="background:${KNAPPEFARGE};border-radius:6px;padding:12px 22px">` +
    `<a href="${escape(lenke)}" style="color:#ffffff;text-decoration:none;font-weight:bold;font-family:Arial,sans-serif;font-size:15px">${escape(tekst)}</a>` +
    `</td></tr></table>`
  );
}

/** Lager HTML-utgaven og en ren tekst-utgave av samme e-post. */
export function byggEpost(avsnitt: Avsnitt[]): { html: string; tekst: string } {
  const html: string[] = [];
  const tekst: string[] = [];
  for (const a of avsnitt) {
    if (typeof a === "string") {
      html.push(`<p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:14px">${escape(a).replace(/\n/g, "<br>")}</p>`);
      tekst.push(a);
      continue;
    }
    const url = tryggLenke(a.lenke);
    if (!url) continue;
    html.push(`<div style="margin:0 0 14px">${knapp(url, a.tekst)}</div>`);
    // Der HTML ikke slipper gjennom, må adressen stå i klartekst
    tekst.push(`${a.tekst}:\n${url}`);
  }
  return { html: html.join(""), tekst: tekst.join("\n\n") };
}

/**
 * Legger e-posten på utklippstavlen som både HTML og ren tekst. Gir false der
 * nettleseren ikke kan skrive HTML dit; da må den som kaller falle tilbake på
 * ren tekst i selve mailto-en.
 */
export async function kopierEpost(avsnitt: Avsnitt[]): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  const { html, tekst } = byggEpost(avsnitt);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([tekst], { type: "text/plain" }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Det kunden møter bak knappen er navn og signatur, ikke mer. Står det i
 * e-posten, har den som er redd for svindel noe å holde siden opp mot.
 */
export const TRYGG_LENKE =
  "Du blir bare bedt om navn og signatur – aldri passord, BankID eller kortopplysninger.";

export const LIM_INN = "E-posten er kopiert. Lim den inn i meldingen med Ctrl+V.";

/**
 * Åpner e-postprogrammet. Med lenke kopieres e-posten som HTML og mailto-en
 * får bare mottaker og emne; uten lenke, eller der kopieringen ikke går, står
 * teksten i mailto-en som før. Gir true når e-posten ligger på
 * utklippstavlen og må limes inn.
 */
export async function apneEpost(
  til: string,
  emne: string,
  avsnitt: Avsnitt[],
  medLenke: boolean,
  cc = "",
): Promise<boolean> {
  // Kopieringen må skje før mailto-en: nettleseren mister fokus i det
  // e-postprogrammet åpnes, og da avvises skriving til utklippstavlen.
  const kopiert = medLenke && (await kopierEpost(avsnitt));
  const body = kopiert ? "" : `&body=${encodeURIComponent(byggEpost(avsnitt).tekst)}`;
  const ccDel = cc ? `&cc=${encodeURIComponent(cc)}` : "";
  window.location.href = `mailto:${encodeURIComponent(til)}?subject=${encodeURIComponent(emne)}${body}${ccDel}`;
  return kopiert;
}

/**
 * Kopierer én lenke med egen tekst. Limes den inn i Outlook eller Word, står
 * teksten der; limes den inn i en SMS, kommer selve adressen.
 */
export async function kopierLenke(lenke: string, tekst: string): Promise<void> {
  const url = tryggLenke(lenke);
  if (url && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([`<a href="${escape(url)}">${escape(tekst)}</a>`], { type: "text/html" }),
          "text/plain": new Blob([lenke], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Faller tilbake på ren tekst under
    }
  }
  await navigator.clipboard.writeText(lenke);
}
