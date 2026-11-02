// Tester for e-posten med signeringslenken bak en knapp. Kjøres av `npm test`.
//
// To ting skal holde: adressen vises ikke i HTML-utgaven, bare som href, og
// ingenting kunden eller tilbudet har skrevet kan bli til HTML.

import { byggEpost } from "./epost-lenke.ts";

let feil = 0;
let ok = 0;
function sjekk(navn: string, faktisk: unknown, forventet: unknown) {
  const a = JSON.stringify(faktisk);
  const b = JSON.stringify(forventet);
  if (a === b) ok++;
  else {
    feil++;
    console.log(`  FEIL  ${navn}\n        fikk:      ${a}\n        forventet: ${b}`);
  }
}

const url = "https://tilbudssystem-mal.vercel.app/signer/3f2a9c1e-8b7d-4e6f-a5b4-c3d2e1f0a9b8";
const { html, tekst } = byggEpost([
  "Hei,",
  "Vi sender herved tilbud nr. 1017 fra Hauge Maskin AS.",
  { lenke: url, tekst: "Se og signer tilbudet" },
  "Med vennlig hilsen\nHauge Maskin AS",
]);

console.log("\n--- html ---");
sjekk("adressen står bare én gang, som href", html.split(url).length - 1, 1);
sjekk("href peker på adressen", html.includes(`href="${url}"`), true);
sjekk("knappeteksten vises", html.includes(">Se og signer tilbudet</a>"), true);
sjekk("linjeskift blir <br>", html.includes("Med vennlig hilsen<br>Hauge Maskin AS"), true);

console.log("\n--- ren tekst ---");
sjekk(
  "adressen står i klartekst",
  tekst,
  `Hei,\n\nVi sender herved tilbud nr. 1017 fra Hauge Maskin AS.\n\nSe og signer tilbudet:\n${url}\n\nMed vennlig hilsen\nHauge Maskin AS`,
);

console.log("\n--- escaping ---");
const ond = byggEpost(["<img src=x onerror=alert(1)> & co", { lenke: url, tekst: `"><script>` }]).html;
sjekk("tekst blir ikke html", ond.includes("<img"), false);
sjekk("& escapes", ond.includes("&amp; co"), true);
sjekk("knappetekst blir ikke html", ond.includes("<script>"), false);
sjekk("javascript-lenke droppes", byggEpost([{ lenke: "javascript:alert(1)", tekst: "x" }]), { html: "", tekst: "" });
sjekk("anførselstegn i lenken escapes", byggEpost([{ lenke: `https://a.no/"x`, tekst: "x" }]).html.includes(`href="https://a.no/&quot;x"`), true);

console.log(`\n${ok} ok, ${feil} feil`);
if (feil) process.exit(1);
