// Tester for de krypterte sikkerhetskopiene. Kjøres med
// `node scripts/sikkerhetskopi.test.mjs`, og er med i `npm test`.
//
// Kopiene inneholder kundedata, signaturer og signeringstokener. Etter
// sikkerhetsgjennomgangen 07.10.2026 skal de aldri ligge ukryptert på disk, men
// en kopi som ikke lar seg lese igjen, er verre enn ingen. Testene ser derfor
// etter begge deler: at ingenting lekker, og at alt kommer tilbake.
//
// Alle data her er oppdiktet. Skriptene kjøres i et falskt repo i en
// midlertidig mappe, med en .env som peker på en etterligning av Supabase på
// 127.0.0.1. Den ekte basen og de ekte kopiene blir aldri rørt.

import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import {
  dekrypter,
  krypter,
  lagStempel,
  pakk,
  pakkUt,
  sjekkNyPassfrase,
  tastetrykk,
} from "./sikkerhetskopi-felles.mjs";

let feil = 0;
let ok = 0;
function sjekk(navn, faktisk, forventet) {
  const a = JSON.stringify(faktisk);
  const b = JSON.stringify(forventet);
  if (a === b) ok++;
  else {
    feil++;
    console.log(
      `  FEIL  ${navn}\n        fikk:      ${a?.slice(0, 300)}\n        forventet: ${b?.slice(0, 300)}`,
    );
  }
}

// Gir feilmeldingen i stedet for å krasje, så én feil ikke skjuler resten.
async function prøv(gjør) {
  try {
    return await gjør();
  } catch (e) {
    return `kastet: ${e.message}`;
  }
}

// Sjekker at noe blir avvist, og at meldingen sier hvorfor.
async function avvises(navn, gjør, mønster) {
  try {
    await gjør();
    sjekk(navn, "ble ikke avvist", `avvist med ${mønster}`);
  } catch (e) {
    sjekk(navn, mønster.test(e.message) ? "avvist" : `avvist med «${e.message}»`, "avvist");
  }
}

const PASSFRASE = "testfrase for oppdiktede data";

// Formatet slik det er beskrevet øverst i sikkerhetskopi-felles.mjs, skrevet på
// nytt her uten modulen. Stemmer ikke beskrivelsen med koden, feiler testene, og
// da kan heller ingen lese kopiene ut fra beskrivelsen alene.
function dekrypterEtterBeskrivelsen(fil, passfrase) {
  const [log2N, r, p] = [fil[7], fil[8], fil[9]];
  const N = 2 ** log2N;
  const nokkel = scryptSync(passfrase, fil.subarray(10, 26), 32, { N, r, p, maxmem: 256 * N * r });
  const d = createDecipheriv("aes-256-gcm", nokkel, fil.subarray(26, 38));
  d.setAAD(fil.subarray(0, 38));
  d.setAuthTag(fil.subarray(fil.length - 16));
  return Buffer.concat([d.update(fil.subarray(38, fil.length - 16)), d.final()]);
}

function krypterEtterBeskrivelsen(data, passfrase, log2N, r, p) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const hode = Buffer.concat([
    Buffer.from("TSKOPI", "ascii"),
    Buffer.from([1, log2N, r, p]),
    salt,
    iv,
  ]);
  const N = 2 ** log2N;
  const nokkel = scryptSync(passfrase, salt, 32, { N, r, p, maxmem: 256 * N * r });
  const c = createCipheriv("aes-256-gcm", nokkel, iv);
  c.setAAD(hode);
  const innhold = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([hode, innhold, c.getAuthTag()]);
}

console.log("\n--- Kryptering og filformat ---");

const tekst = "Oppdiktet innhold med æøå og 😀";
const fil = await krypter(Buffer.from(tekst), PASSFRASE);

sjekk(
  "riktig passordfrase gir tilbake det samme",
  String(await prøv(() => dekrypter(fil, PASSFRASE))),
  tekst,
);
sjekk(
  "fila kan leses ut fra formatbeskrivelsen alene",
  String(await prøv(() => dekrypterEtterBeskrivelsen(fil, PASSFRASE))),
  tekst,
);
sjekk(
  "hodet starter med TSKOPI og versjon 1",
  [fil.subarray(0, 6).toString("ascii"), fil[6]],
  ["TSKOPI", 1],
);

// Lavere kostnad gjør det billigere å prøve passordfraser mot en stjålet kopi.
// OWASP anbefaler minst N = 2^17 og r = 8 for scrypt.
sjekk("nøkkelen avledes med minst N = 2^17 og r = 8", fil[7] >= 17 && fil[8] >= 8, true);

const annen = krypterEtterBeskrivelsen(Buffer.from("andre scrypt-verdier"), PASSFRASE, 15, 8, 2);
sjekk(
  "scrypt-verdiene leses fra hodet, ikke fra koden",
  String(await prøv(() => dekrypter(annen, PASSFRASE))),
  "andre scrypt-verdier",
);

const fil2 = await krypter(Buffer.from(tekst), PASSFRASE);
sjekk("saltet er nytt for hver fil", fil.subarray(10, 26).equals(fil2.subarray(10, 26)), false);
sjekk("IV-en er ny for hver fil", fil.subarray(26, 38).equals(fil2.subarray(26, 38)), false);

// To skrivemåter av å (én bokstav, eller a pluss ring) skal gi samme nøkkel.
// Ellers kan en kopi tatt på én maskin bli umulig å åpne på en annen.
const nfc = "blåbærsyltetøy på ål".normalize("NFC");
const nfd = nfc.normalize("NFD");
sjekk("forutsetning: NFC og NFD er ulike strenger", nfc === nfd, false);
const filNfc = await krypter(Buffer.from("x"), nfc);
sjekk(
  "æøå skrevet på to måter gir samme nøkkel",
  String(await prøv(() => dekrypter(filNfc, nfd))),
  "x",
);

console.log("\n--- Det som skal avvises ---");

await avvises(
  "feil passordfrase",
  () => dekrypter(fil, "feil frase for oppdiktede data"),
  /passordfrase/i,
);

const endret = Buffer.from(fil);
endret[40] ^= 1;
await avvises(
  "én endret bit i innholdet",
  () => dekrypter(endret, PASSFRASE),
  /skadet eller endret/i,
);
await avvises(
  "fil som mangler siste byte",
  () => dekrypter(fil.subarray(0, fil.length - 1), PASSFRASE),
  /skadet eller endret/i,
);
await avvises(
  "fil kortere enn hode og merke",
  () => dekrypter(fil.subarray(0, 30), PASSFRASE),
  /for kort/i,
);
await avvises(
  "JSON i klartekst er ingen kryptert kopi",
  () => dekrypter(Buffer.from('[{"id":1}]'), PASSFRASE),
  /ikke en kryptert sikkerhetskopi/i,
);

const v2 = Buffer.from(fil);
v2[6] = 2;
await avvises("ukjent formatversjon", () => dekrypter(v2, PASSFRASE), /versjon 2/i);

// N = 2^21 med r = 8 krever 2 GiB minne. En skadet eller fiendtlig fil skal ikke
// kunne få skriptet til å prøve.
const dyr = Buffer.from(fil);
dyr[7] = 21;
await avvises(
  "for dyr scrypt i hodet avvises før utregning",
  () => dekrypter(dyr, PASSFRASE),
  /urimelige/i,
);
const nullR = Buffer.from(fil);
nullR[8] = 0;
await avvises("scrypt med r = 0 avvises", () => dekrypter(nullR, PASSFRASE), /urimelige/i);

console.log("\n--- Innpakning ---");

const innhold = {
  tatt: "2026-10-07T12:00:00.000Z",
  kilde: "oppdiktet.supabase.co",
  tabeller: {
    customers: [{ navn: "Åse Ødegård 😀", tall: 1.5, tom: null, nøstet: { a: [1, 2] } }],
  },
  oversikt: { customers: 1 },
};
const utpakket = pakkUt(pakk(innhold));
sjekk(
  "innpakning tar med alt",
  [utpakket.tatt, utpakket.kilde, utpakket.tabeller, utpakket.oversikt],
  [innhold.tatt, innhold.kilde, innhold.tabeller, innhold.oversikt],
);
await avvises(
  "gzip-et JSON uten formatmerke avvises",
  () => pakkUt(gzipSync(Buffer.from('{"tabeller":{}}'))),
  /ukjent form/i,
);

console.log("\n--- Krav til ny passordfrase ---");

await avvises("11 tegn er for kort", () => sjekkNyPassfrase("elleve tegn"), /12 tegn/);
let godtatt = true;
try {
  sjekkNyPassfrase("tolv tegn ok");
} catch {
  godtatt = false;
}
sjekk("12 tegn er nok", godtatt, true);
await avvises("emoji teller som ett tegn", () => sjekkNyPassfrase("😀".repeat(11)), /12 tegn/);

// Et mellomrom til slutt i miljøvariabelen er lett å få med ved et uhell og
// umulig å huske når kopien skal åpnes.
await avvises(
  "mellomrom til slutt avvises",
  () => sjekkNyPassfrase("lang nok frase her "),
  /mellomrom/,
);
await avvises(
  "mellomrom først avvises",
  () => sjekkNyPassfrase(" lang nok frase her"),
  /mellomrom/,
);

console.log("\n--- Tastetrykk ved skjult inntasting ---");

function tast(tekst, biter) {
  const s = tastetrykk(tekst, biter);
  return [s.tekst, s.ferdig ? "ferdig" : s.avbrutt ? "avbrutt" : "venter"];
}
sjekk("bokstaver legges til", tast("", "abc"), ["abc", "venter"]);
sjekk("Enter avslutter", tast("abc", "\r"), ["abc", "ferdig"]);
sjekk("linjeskift avslutter", tast("abc", "\n"), ["abc", "ferdig"]);
sjekk("innlimt frase med linjeskift", tast("", "lang frase\r\n"), ["lang frase", "ferdig"]);
sjekk("rettetast 0x7f", tast("abc", "\x7f"), ["ab", "venter"]);
sjekk("rettetast 0x08 (Windows)", tast("abc", "\b"), ["ab", "venter"]);
sjekk("rettetast fjerner hele emojien", tast("a😀", "\x7f"), ["a", "venter"]);
sjekk("rettetast i tom frase", tast("", "\x7f"), ["", "venter"]);
sjekk("Ctrl+C avbryter og glemmer frasen", tast("abc", "\x03"), ["", "avbrutt"]);
sjekk("æøå tas imot", tast("", "æøå"), ["æøå", "venter"]);
sjekk("piltast blir ikke med i frasen", tast("ab", "\x1b[D"), ["ab", "venter"]);
sjekk("piltast midt i innliming", tast("", "ab\x1b[Ac"), ["abc", "venter"]);
sjekk("F1 fra Windows-konsollen", tast("ab", "\x1b[[Ac"), ["abc", "venter"]);
sjekk("F1 fra andre terminaler", tast("ab", "\x1bOPc"), ["abc", "venter"]);
sjekk("andre kontrolltegn hoppes over", tast("", "a\x01b"), ["ab", "venter"]);

console.log("\n--- Tidsstempel i filnavnet ---");

// Dato og klokkeslett skal begge være lokal tid. Før ble datoen tatt i UTC, så
// en kopi tatt kl. 01.30 norsk tid fikk gårsdagens dato.
sjekk(
  "lokal dato også rett etter midnatt",
  lagStempel(new Date(2026, 9, 8, 1, 30, 5)),
  "2026-10-08_013005",
);
sjekk(
  "ensifrede tall får null foran",
  lagStempel(new Date(2026, 0, 2, 3, 4, 5)),
  "2026-01-02_030405",
);

console.log("\n--- Hele veien, i et falskt repo ---");

const TENANT = "00000000-0000-4000-8000-0000000000aa";
const TILBUD = "00000000-0000-4000-8000-000000000001";

// Samme rekkefølge som i sikkerhetskopi.mjs.
const DATA = {
  offers: [
    {
      id: TILBUD,
      tenant_id: TENANT,
      title: "Testtilbud grøft på Ål",
      total: 1590.5,
      customer_signature: "data:image/png;base64,VEVTVFNJR05BVFVS",
      signer_ip: "192.0.2.10",
      customer_signed_at: null,
    },
  ],
  // Nøyaktig 1000 rader: siden etter er tom, og det skal ikke regnes som feil.
  offer_lines: Array.from({ length: 1000 }, (_, i) => ({
    id: `linje-${i}`,
    offer_id: TILBUD,
    description: `Graving, meter ${i}`,
    quantity: i,
  })),
  amendments: [{ id: "endring-1", offer_id: TILBUD, title: "Ekstra kum", signer_ip: null }],
  amendment_lines: [],
  amendment_signing_tokens: [{ id: "a-tok-1", token: "signeringstoken-test-2222" }],
  offer_signing_tokens: [{ id: "o-tok-1", token: "signeringstoken-test-1111" }],
  // Over 1000 rader må hentes i flere omganger.
  line_history: Array.from({ length: 2500 }, (_, i) => ({
    id: i + 1,
    operation: "UPDATE",
    row_data: { nummer: i },
  })),
  customers: [
    {
      id: "kunde-1",
      tenant_id: TENANT,
      name: "Testkunde Åsheim",
      email: "testkunde@example.invalid",
      phone: "+47 000 00 000",
      address: "Oppdiktet vei 1, 0000 Ingensteds",
    },
  ],
  potential_customers: [],
  projects: [{ id: "prosjekt-1", name: "Testprosjekt 😀" }],
  tenders: [],
  tender_bids: [],
  sms_inbox: [{ id: "sms-1", body: "Ja takk, oppdiktet svar" }],
  app_settings: [{ id: "innst-1", tenant_id: TENANT, sms_token: "TESTTOKEN-ikke-ekte-0000" }],
  tenants: [{ id: TENANT, name: "Testfirma AS" }],
  tenant_users: [{ id: "bruker-1", tenant_id: TENANT, email: "ansatt@example.invalid" }],
};
const ANTALL = Object.fromEntries(Object.entries(DATA).map(([t, r]) => [t, r.length]));
const MARKØRER = [
  "Testkunde Åsheim",
  "testkunde@example.invalid",
  "TESTTOKEN-ikke-ekte-0000",
  "signeringstoken-test-1111",
  "VEVTVFNJR05BVFVS",
  "192.0.2.10",
];

// Etterligner PostgREST slik skriptet bruker det: GET med Range, maks 1000 rader,
// og en tom liste når man blar forbi slutten.
const FALSK_NOKKEL = "falsk-service-role-for-test";
let forespørsler = 0;
let feilendeTabell = null;
const tjener = createServer((req, res) => {
  forespørsler++;
  const json = (status, kropp) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(kropp));
  };
  if (
    req.headers.apikey !== FALSK_NOKKEL ||
    req.headers.authorization !== `Bearer ${FALSK_NOKKEL}`
  ) {
    return json(401, { message: "Invalid API key" });
  }
  const m = req.url.match(/^\/rest\/v1\/(\w+)\?select=\*$/);
  if (!m || !(m[1] in DATA))
    return json(404, { code: "42P01", message: "relation does not exist" });
  if (m[1] === feilendeTabell) return json(500, { message: "oppdiktet feil" });
  const [fra, til] = (req.headers.range ?? "0-999").split("-").map(Number);
  json(200, DATA[m[1]].slice(fra, Math.min(til + 1, fra + 1000)));
});
await new Promise((klar) => tjener.listen(0, "127.0.0.1", klar));

const her = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sikkerhetskopi-test-"));
const repo = join(tmp, "repo");
const backupmappe = join(tmp, "tilbudssystem-backup");

// Med BOM, slik .env har vært før.
const BOM = String.fromCodePoint(0xfeff);
function skrivEnv(ekstra = "") {
  writeFileSync(
    join(repo, ".env"),
    `${BOM}VITE_SUPABASE_URL=http://127.0.0.1:${tjener.address().port}\n` +
      `SUPABASE_SERVICE_ROLE_KEY="${FALSK_NOKKEL}"\n${ekstra}`,
    "utf8",
  );
}

// Kjører et av skriptene uten terminal, slik et program ser det.
function kjør(skript, argumenter = [], { passfrase = PASSFRASE } = {}) {
  const env = { ...process.env };
  delete env.SIKKERHETSKOPI_PASSFRASE;
  if (passfrase !== null) env.SIKKERHETSKOPI_PASSFRASE = passfrase;
  return new Promise((ferdig) => {
    const barn = spawn(process.execPath, [join(repo, "scripts", skript), ...argumenter], {
      cwd: repo,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    barn.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    barn.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
    barn.stdin.end();
    const vakt = setTimeout(() => barn.kill(), 60_000);
    barn.on("close", (kode) => {
      clearTimeout(vakt);
      ferdig({ kode, stdout, stderr });
    });
  });
}

const filer = () => (existsSync(backupmappe) ? readdirSync(backupmappe).sort() : []);
const tøm = () => rmSync(backupmappe, { recursive: true, force: true });
const lesKopi = async (navn, passfrase = PASSFRASE) =>
  pakkUt(await dekrypter(readFileSync(join(backupmappe, navn)), passfrase));
const somJson = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return `ikke JSON: ${t.slice(0, 80)}`;
  }
};
function vis(navn, svar) {
  if (svar.kode !== 0)
    console.log(
      `        (${navn}: kode ${svar.kode}, stderr: ${svar.stderr.trim().slice(0, 300)})`,
    );
}

try {
  mkdirSync(join(repo, "scripts"), { recursive: true });
  for (const f of [
    "sikkerhetskopi.mjs",
    "sikkerhetskopi-felles.mjs",
    "gjenopprett-sikkerhetskopi.mjs",
  ]) {
    copyFileSync(join(her, f), join(repo, "scripts", f));
  }
  skrivEnv();

  // Vanlig kjøring
  let svar = await kjør("sikkerhetskopi.mjs");
  sjekk("kopien går uten feil", svar.kode, 0);
  vis("kopi", svar);
  const navn = filer();
  sjekk(
    "én fil og ingenting annet i mappa",
    navn.length === 1 && navn[0].endsWith(".kryptert"),
    true,
  );
  sjekk(
    "filnavnet er dato og klokkeslett",
    /^\d{4}-\d{2}-\d{2}_\d{6}\.kryptert$/.test(navn[0]),
    true,
  );
  const råfil = readFileSync(join(backupmappe, navn[0]));
  for (const markør of MARKØRER) {
    sjekk(`«${markør}» står ikke i fila`, råfil.includes(Buffer.from(markør)), false);
  }
  const kopi = await lesKopi(navn[0]);
  for (const [tabell, rader] of Object.entries(DATA)) {
    sjekk(`${tabell}: alle ${rader.length} rader er med`, kopi.tabeller[tabell], rader);
  }
  sjekk("oversikten i kopien har antallene", kopi.oversikt, ANTALL);
  sjekk("kopien har tidspunktet", Number.isNaN(Date.parse(kopi.tatt)), false);

  // Oversikt uten å vise data
  svar = await kjør("gjenopprett-sikkerhetskopi.mjs");
  sjekk("oversikten går uten feil", svar.kode, 0);
  vis("oversikt", svar);
  sjekk("oversikten bruker den nyeste fila", svar.stdout.includes(navn[0]), true);
  for (const [tabell, antall] of Object.entries(ANTALL)) {
    sjekk(
      `oversikten: ${tabell} har ${antall} rader`,
      new RegExp(`^\\s*${tabell}\\s+${antall} rader$`, "m").test(svar.stdout),
      true,
    );
  }
  for (const markør of MARKØRER) {
    sjekk(`oversikten viser ikke «${markør}»`, (svar.stdout + svar.stderr).includes(markør), false);
  }

  // Én tabell som JSON, med filnavnet uten endelse
  svar = await kjør("gjenopprett-sikkerhetskopi.mjs", [
    navn[0].replace(".kryptert", ""),
    "--tabell",
    "customers",
  ]);
  sjekk("--tabell gir ren JSON på stdout", somJson(svar.stdout), DATA.customers);
  vis("--tabell", svar);

  svar = await kjør("gjenopprett-sikkerhetskopi.mjs", ["--tabell", "finnes_ikke"]);
  sjekk(
    "ukjent tabell gir feilkode og lister de som finnes",
    [svar.kode !== 0, svar.stderr.includes("customers")],
    [true, true],
  );

  // Tilbake til JSON-filer
  const ut = join(tmp, "gjenopprettet");
  svar = await kjør("gjenopprett-sikkerhetskopi.mjs", ["--til-mappe", ut]);
  sjekk("--til-mappe går uten feil", svar.kode, 0);
  vis("--til-mappe", svar);
  for (const [tabell, rader] of Object.entries(DATA)) {
    sjekk(
      `--til-mappe: ${tabell}.json`,
      somJson(readFileSync(join(ut, `${tabell}.json`), "utf8")),
      rader,
    );
  }
  const oversikt = somJson(readFileSync(join(ut, "_oversikt.json"), "utf8"));
  sjekk(
    "--til-mappe: _oversikt.json som før",
    [oversikt.tatt, oversikt.tabeller],
    [kopi.tatt, ANTALL],
  );

  svar = await kjør("gjenopprett-sikkerhetskopi.mjs", ["--til-mappe", join(repo, "ut")]);
  sjekk(
    "--til-mappe nekter mappe inne i repoet",
    [svar.kode !== 0, existsSync(join(repo, "ut"))],
    [true, false],
  );

  // Andre filnavn enn tabellene, så det er sjekken av mappa som stopper, ikke
  // at filene finnes fra før.
  const opptatt = join(tmp, "opptatt");
  mkdirSync(opptatt);
  writeFileSync(join(opptatt, "annet.txt"), "noe som lå der fra før", "utf8");
  svar = await kjør("gjenopprett-sikkerhetskopi.mjs", ["--til-mappe", opptatt]);
  sjekk(
    "--til-mappe nekter mappe som ikke er tom",
    [svar.kode !== 0, readdirSync(opptatt)],
    [true, ["annet.txt"]],
  );

  // Feil passordfrase
  svar = await kjør("gjenopprett-sikkerhetskopi.mjs", [], {
    passfrase: "feil frase for oppdiktede data",
  });
  sjekk(
    "feil passordfrase gir feilkode og ingen data",
    [svar.kode !== 0, svar.stdout, /passordfrase/i.test(svar.stderr)],
    [true, "", true],
  );

  // Ingen passordfrase og ingen terminal: stopp før noe hentes
  tøm();
  forespørsler = 0;
  svar = await kjør("sikkerhetskopi.mjs", [], { passfrase: null });
  sjekk(
    "uten passordfrase: feilkode, ingen fil og ingen henting",
    [
      svar.kode !== 0,
      filer().length,
      forespørsler,
      svar.stderr.includes("SIKKERHETSKOPI_PASSFRASE"),
    ],
    [true, 0, 0, true],
  );

  svar = await kjør("sikkerhetskopi.mjs", [], { passfrase: "kort" });
  sjekk(
    "for kort passordfrase: feilkode, ingen fil og ingen henting",
    [svar.kode !== 0, filer().length, forespørsler],
    [true, 0, 0],
  );

  // Passordfrasen ved siden av kopiene er ingen beskyttelse
  skrivEnv(`SIKKERHETSKOPI_PASSFRASE=${PASSFRASE}\n`);
  svar = await kjør("sikkerhetskopi.mjs");
  sjekk(
    "passordfrase i .env avvises",
    [svar.kode !== 0, filer().length, forespørsler, svar.stderr.includes(".env")],
    [true, 0, 0, true],
  );
  skrivEnv();

  // Én tabell feiler: resten skal likevel sikres, men det skal synes
  feilendeTabell = "sms_inbox";
  svar = await kjør("sikkerhetskopi.mjs");
  feilendeTabell = null;
  sjekk("feil i én tabell gir feilkode 1", svar.kode, 1);
  const delvis = await lesKopi(filer()[0]);
  sjekk("resten av tabellene er med", delvis.tabeller.customers, DATA.customers);
  sjekk(
    "oversikten sier hvilken som feilet",
    String(delvis.oversikt.sms_inbox).startsWith("FEIL"),
    true,
  );
  sjekk("den feilende tabellen er ikke med som tom", "sms_inbox" in delvis.tabeller, false);
  svar = await kjør("gjenopprett-sikkerhetskopi.mjs");
  sjekk("oversikten viser feilen", /^\s*sms_inbox\s+FEIL/m.test(svar.stdout), true);

  // Gamle klartekstkopier
  tøm();
  const gammel = join(backupmappe, "2026-08-19_151047");
  mkdirSync(gammel, { recursive: true });
  const gammelOversikt = { ...ANTALL, sms_inbox: "FEIL: 500 oppdiktet" };
  for (const [tabell, rader] of Object.entries(DATA)) {
    // customers.json med BOM, som om den var lagret i Notisblokk.
    const bom = tabell === "customers" ? BOM : "";
    if (tabell !== "sms_inbox")
      writeFileSync(join(gammel, `${tabell}.json`), bom + JSON.stringify(rader, null, 2), "utf8");
  }
  writeFileSync(
    join(gammel, "_oversikt.json"),
    JSON.stringify({ tatt: "2026-08-19T13:10:47.000Z", tabeller: gammelOversikt }, null, 2),
    "utf8",
  );
  forespørsler = 0;
  svar = await kjør("sikkerhetskopi.mjs", ["--fra-mappe", gammel]);
  sjekk("--fra-mappe går uten feil", svar.kode, 0);
  vis("--fra-mappe", svar);
  sjekk("--fra-mappe henter ingenting fra basen", forespørsler, 0);
  sjekk("--fra-mappe gir <mappenavn>.kryptert", filer(), [
    "2026-08-19_151047",
    "2026-08-19_151047.kryptert",
  ]);
  sjekk("klartekstmappa står urørt", readdirSync(gammel).length, 16);
  const konvertert = await lesKopi("2026-08-19_151047.kryptert");
  sjekk("--fra-mappe: tidspunktet følger med", konvertert.tatt, "2026-08-19T13:10:47.000Z");
  sjekk("--fra-mappe: oversikten følger med", konvertert.oversikt, gammelOversikt);
  for (const [tabell, rader] of Object.entries(DATA)) {
    if (tabell !== "sms_inbox") sjekk(`--fra-mappe: ${tabell}`, konvertert.tabeller[tabell], rader);
  }

  const tuklet = join(tmp, "tuklet");
  mkdirSync(tuklet);
  writeFileSync(join(tuklet, "customers.json"), JSON.stringify(DATA.customers), "utf8");
  writeFileSync(
    join(tuklet, "_oversikt.json"),
    JSON.stringify({ tatt: "2026-08-19T13:10:47.000Z", tabeller: { customers: 5 } }),
    "utf8",
  );
  svar = await kjør("sikkerhetskopi.mjs", ["--fra-mappe", tuklet]);
  sjekk(
    "--fra-mappe nekter når antallet ikke stemmer",
    [svar.kode !== 0, existsSync(join(backupmappe, "tuklet.kryptert"))],
    [true, false],
  );

  const uten = join(tmp, "uten-oversikt");
  mkdirSync(uten);
  writeFileSync(join(uten, "customers.json"), JSON.stringify(DATA.customers), "utf8");
  svar = await kjør("sikkerhetskopi.mjs", ["--fra-mappe", uten]);
  sjekk(
    "--fra-mappe nekter mappe uten _oversikt.json",
    [svar.kode !== 0, existsSync(join(backupmappe, "uten-oversikt.kryptert"))],
    [true, false],
  );

  // Den nyeste kopien velges når ingen fil er oppgitt
  svar = await kjør("sikkerhetskopi.mjs");
  const nyeste = filer()
    .filter((f) => f.endsWith(".kryptert"))
    .at(-1);
  svar = await kjør("gjenopprett-sikkerhetskopi.mjs");
  sjekk(
    "oversikten velger den nyeste av flere",
    [svar.stdout.includes(nyeste), svar.stdout.includes("2026-08-19_151047")],
    [true, false],
  );
} finally {
  tjener.close();
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
