// Gjør en av PDF-sidene i pdf.ts om til en ekte PDF-fil.
//
// PDF-ene i appen er HTML-sider som nettleseren skriver ut: kunden og vi får
// en fil først når noen velger «Lagre som PDF» i utskriftsvinduet. Skal
// tilbudet legges ved en ordre i Tripletex, trengs fila uten den runden.
//
// Siden bygges derfor i en usynlig iframe med nøyaktig den samme koden som
// lager utskriften, og hvert ark (.page) tas som bilde og legges på en A4-side.
// Teksten blir ikke markerbar, men dokumentet ser ut akkurat som det kunden fikk
// — også sidebrytingen, som kjøreskriptet i pdf.ts regner ut etter at fontene
// er lastet.

import html2canvas from "html2canvas-pro";
import { PDFDocument } from "pdf-lib";

const A4_BREDDE_PT = 595.28;
const A4_HOYDE_PT = 841.89;

/**
 * @param skriv Skriver dokumentet inn i vinduet den får, slik `openOfferPdf`
 *   gjør med vinduet den får som `targetWin`.
 * @param maksVentMs Hvor lenge vi venter på at siden har gjort seg ferdig.
 */
export async function lagPdfFil(
  skriv: (vindu: Window) => void,
  maksVentMs = 20_000,
): Promise<Blob> {
  const ramme = document.createElement("iframe");
  // Utenfor skjermen, men med ekte bredde: arkene er 210 mm, og målingen av
  // hva som får plass på et ark trenger at de blir lagt ut i full størrelse.
  ramme.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1000px;height:1400px;border:0;visibility:hidden";
  ramme.setAttribute("aria-hidden", "true");
  document.body.appendChild(ramme);

  try {
    const vindu = ramme.contentWindow;
    if (!vindu) throw new Error("Fikk ikke laget PDF-en");

    // Kjøreskriptet avslutter med window.print() når sidebrytingen er ferdig.
    // Det kallet fanges, og er signalet om at arkene ligger der de skal.
    const ferdig = new Promise<void>((resolve, reject) => {
      const tidsfrist = setTimeout(
        () => reject(new Error("PDF-en ble ikke ferdig i tide")),
        maksVentMs,
      );
      const fang = () => {
        clearTimeout(tidsfrist);
        resolve();
      };
      vindu.print = fang;
      skriv(vindu);
      // document.write kan gi vinduet nye egenskaper i eldre nettlesere. Satt
      // på nytt etterpå er vi sikre på at det er vår print som blir kalt.
      vindu.print = fang;
    });
    await ferdig;

    const doc = vindu.document;
    // Arkene har skygge og luft rundt seg på skjermen. Det skal ikke med.
    const stil = doc.createElement("style");
    stil.textContent =
      "body{background:#fff!important}.page{margin:0!important;box-shadow:none!important}";
    doc.head.appendChild(stil);

    const ark = Array.from(doc.querySelectorAll<HTMLElement>(".page"));
    if (!ark.length) throw new Error("PDF-en har ingen sider");

    const pdf = await PDFDocument.create();
    for (const side of ark) {
      const lerret = await html2canvas(side, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const jpeg = await pdf.embedJpg(lerret.toDataURL("image/jpeg", 0.92));
      const s = pdf.addPage([A4_BREDDE_PT, A4_HOYDE_PT]);
      // Arket fyller bredden. Er det høyere enn A4 (min-height, ikke height),
      // krympes det heller enn å bli kuttet nederst.
      const skala = Math.min(A4_BREDDE_PT / jpeg.width, A4_HOYDE_PT / jpeg.height);
      const b = jpeg.width * skala;
      const h = jpeg.height * skala;
      s.drawImage(jpeg, { x: (A4_BREDDE_PT - b) / 2, y: A4_HOYDE_PT - h, width: b, height: h });
    }
    const bytes = await pdf.save();
    return new Blob([bytes as BlobPart], { type: "application/pdf" });
  } finally {
    ramme.remove();
  }
}
