// Tester for teksten i varselmailen. Kjøres av `bun test`.
//
// Dette er den delen brukeren faktisk ser. Et beløp med feil antall desimaler
// eller et klokkeslett i UTC er ikke en teknisk detalj — det er en mail som
// sier at kunden svarte klokka 12:54 når hun svarte 14:54.

import { byggVarsel, splittMottakere, summerLinjer, type VarselData } from "./tekst.ts";

// Samme skrivemåte som i tekst.ts: skrevet som regex-literal ville
// formateringen gjort escapene om til usynlige tegn i kildekoden.
const HARDE_MELLOMROM = new RegExp("[\u00a0\u202f]");

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

const grunnlag: VarselData = {
  type: "offer",
  hendelse: "avslaatt",
  nummer: "1010",
  tittel: "VA Skardheie",
  kunde: "Åseral Kommune",
  svartAv: "Hilde Stuestøl Berg",
  tidspunkt: "2026-09-22T12:54:00Z", // 14:54 norsk sommertid
  belop: 6521080,
  begrunnelse: "Vi går for et annet tilbud på delkontrakt 2.",
  prosjektRef: null,
  lenke: "https://tilbudssystem-mal.vercel.app/tilbud/4c28d2c8",
};

console.log("\n--- Emnefeltet ---");

sjekk("tilbud avslått", byggVarsel(grunnlag).emne, "Tilbud #1010 avslått av Åseral Kommune");
sjekk(
  "tilbud signert",
  byggVarsel({ ...grunnlag, hendelse: "signert" }).emne,
  "Tilbud #1010 signert av Åseral Kommune",
);
sjekk(
  "krav avslått",
  byggVarsel({ ...grunnlag, type: "amendment", nummer: "3" }).emne,
  "Krav om endring #3 avslått av Åseral Kommune",
);
sjekk(
  "krav signert",
  byggVarsel({ ...grunnlag, type: "amendment", nummer: "3", hendelse: "signert" }).emne,
  "Krav om endring #3 signert av Åseral Kommune",
);

console.log("\n--- Norsk tid, ikke UTC ---");

// Serveren kjører UTC. 12:54Z er 14:54 i Norge om sommeren og 13:54 om vinteren.
sjekk("sommertid", byggVarsel(grunnlag).tekst.includes("22.09.2026 kl. 14:54"), true);
sjekk(
  "vintertid",
  byggVarsel({ ...grunnlag, tidspunkt: "2026-01-15T12:54:00Z" }).tekst.includes(
    "15.01.2026 kl. 13:54",
  ),
  true,
);

console.log("\n--- Beløp i norsk format ---");

sjekk("tusenskille og desimaler", byggVarsel(grunnlag).tekst.includes("6 521 080,00 kr"), true);
sjekk(
  "uten desimaler i tallet",
  byggVarsel({ ...grunnlag, belop: 1000 }).tekst.includes("1 000,00 kr"),
  true,
);
sjekk("ingen harde mellomrom", HARDE_MELLOMROM.test(byggVarsel(grunnlag).tekst), false);

console.log("\n--- Begrunnelse ---");

sjekk("med begrunnelse", byggVarsel(grunnlag).tekst.includes("Vi går for et annet tilbud"), true);
sjekk(
  "uten begrunnelse gir ingen tom linje",
  byggVarsel({ ...grunnlag, begrunnelse: null }).tekst.includes("Begrunnelse"),
  false,
);
sjekk(
  "signert har aldri begrunnelse",
  byggVarsel({ ...grunnlag, hendelse: "signert" }).tekst.includes("Begrunnelse"),
  false,
);

console.log("\n--- Felter som kan mangle ---");

sjekk(
  "uten beløp utgår beløpslinja",
  byggVarsel({ ...grunnlag, belop: null }).tekst.includes("Beløp"),
  false,
);
sjekk(
  "uten navn står det ikke tomt",
  byggVarsel({ ...grunnlag, svartAv: "" }).tekst.includes("Avslått av:"),
  false,
);
sjekk(
  "krav viser prosjektreferansen",
  byggVarsel({
    ...grunnlag,
    type: "amendment",
    nummer: "3",
    prosjektRef: "2026118",
  }).tekst.includes("på prosjekt 2026118"),
  true,
);

// Endringsnumre skrives i praksis som «2026165-1». Da står prosjektnummeret
// alt i nummeret, og skal ikke gjentas rett etterpå.
sjekk(
  "nummeret bærer alt prosjektet",
  byggVarsel({
    ...grunnlag,
    type: "amendment",
    nummer: "2026165-1",
    prosjektRef: "2026165",
  }).tekst.includes("på prosjekt"),
  false,
);
sjekk(
  "men nummeret står der fortsatt",
  byggVarsel({
    ...grunnlag,
    type: "amendment",
    nummer: "2026165-1",
    prosjektRef: "2026165",
  }).tekst.includes("krav om endring #2026165-1"),
  true,
);

console.log("\n--- Kolonnene skal stå under hverandre ---");

// Verdiene skal begynne på samme kolonne uansett hvor langt ordet foran er.
{
  const linjer = byggVarsel(grunnlag)
    .tekst.split("\n")
    .filter((l) => /^(Signert av|Avslått av|Beløp|Begrunnelse):/.test(l));
  sjekk("tre merkede linjer", linjer.length, 3);
  const startkolonner = new Set(
    linjer.map((l) => {
      const etterKolon = l.indexOf(":") + 1;
      return etterKolon + l.slice(etterKolon).search(/\S/);
    }),
  );
  sjekk("alle starter likt", [...startkolonner], [14]);
}

console.log("\n--- Flere mottakere i samme firma ---");

sjekk("én adresse", splittMottakere("post@firma.no"), ["post@firma.no"]);
sjekk("komma", splittMottakere("a@x.no,b@x.no"), ["a@x.no", "b@x.no"]);
sjekk("komma og mellomrom", splittMottakere("a@x.no, b@x.no"), ["a@x.no", "b@x.no"]);
// Outlook skiller med semikolon. Den som limer inn derfra skal ikke måtte vite det.
sjekk("semikolon", splittMottakere("a@x.no; b@x.no"), ["a@x.no", "b@x.no"]);
sjekk("blandet", splittMottakere("a@x.no; b@x.no, c@x.no"), ["a@x.no", "b@x.no", "c@x.no"]);
// Et etterfølgende komma er lett å bli sittende med. Blir det en tom mottaker,
// avviser Resend hele utsendingen — også til dem som har gyldig adresse.
sjekk("etterfølgende komma", splittMottakere("a@x.no,"), ["a@x.no"]);
sjekk("dobbelt komma", splittMottakere("a@x.no,,b@x.no"), ["a@x.no", "b@x.no"]);
sjekk("bare mellomrom rundt", splittMottakere("  a@x.no  "), ["a@x.no"]);
sjekk("tomt felt", splittMottakere(""), []);
sjekk("bare skilletegn", splittMottakere(" , ; "), []);
sjekk("null", splittMottakere(null), []);

console.log("\n--- Summen skal regnes som i resten av systemet ---");

// Samme regler som offerTotal/amendmentTotal i src/lib/format.ts. Blir disse
// røde, viser mailen et annet beløp enn skjermen — og det var nettopp det
// format.ts ble skrevet for å få slutt på.
sjekk("antall x pris", summerLinjer([{ quantity: 3, unit_price: 100 }]), 300);
sjekk("rabatt trekkes fra", summerLinjer([{ quantity: 1, unit_price: 100, discount_pct: 25 }]), 75);
sjekk(
  "overskrift teller ikke",
  summerLinjer([
    { is_heading: true, quantity: 5, unit_price: 100 },
    { quantity: 1, unit_price: 50 },
  ]),
  50,
);
sjekk(
  "ikke-inkludert teller ikke",
  summerLinjer([
    { included: false, quantity: 5, unit_price: 100 },
    { quantity: 1, unit_price: 50 },
  ]),
  50,
);
sjekk("adm.påslag legges til", summerLinjer([{ quantity: 1, unit_price: 1000 }], 10), 1100);
sjekk("krav har ingen adm.påslag", summerLinjer([{ quantity: 1, unit_price: 1000 }]), 1000);
sjekk("tomme linjer gir null", summerLinjer([]), 0);
sjekk("manglende felter gir null", summerLinjer([{}]), 0);
// amendment_lines har ingen included-kolonne. Da er feltet undefined, og
// linja skal telle — ikke falle ut fordi den ikke sa uttrykkelig ja.
sjekk("uten included-felt teller linja", summerLinjer([{ quantity: 2, unit_price: 10 }]), 20);

console.log("\n--- Lenka skal alltid med ---");

for (const h of ["signert", "avslaatt"] as const) {
  sjekk(
    `lenke ved ${h}`,
    byggVarsel({ ...grunnlag, hendelse: h }).tekst.includes(grunnlag.lenke),
    true,
  );
}

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
