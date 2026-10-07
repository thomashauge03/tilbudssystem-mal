// Kryptert sikkerhetskopi av alle data i basen.
//
// Bakgrunn: Supabase free plan har ingen automatiske sikkerhetskopier. Da 18.08.2026
// nullet antallet seg på endring 1017-1 fantes ingen vei tilbake. Denne skal kjøres
// før større endringer, og gjerne fast.
//
//   node scripts/sikkerhetskopi.mjs        (eller npm run backup)
//
// Kopien blir én fil, ../tilbudssystem-backup/<dato_klokkeslett>.kryptert, altså
// UTENFOR repoet. Den inneholder kundedata, signaturer og tokener, og etter
// sikkerhetsgjennomgangen 07.10.2026 skal slikt aldri ligge ukryptert på disk.
// Alt hentes og krypteres i minnet. Fila leses tilbake og kontrolleres før
// skriptet sier at kopien er tatt.
//
// Passordfrasen leses fra miljøvariabelen SIKKERHETSKOPI_PASSFRASE. Er den ikke
// satt, blir du spurt to ganger, uten at det du skriver vises. Minst 12 tegn.
// Oppbevar den i en passordbehandler: glemmes den, kan ingen åpne kopiene. Den
// skal heller ikke stå i .env eller noe annet sted på denne disken, for da
// beskytter krypteringen ingenting. Står den i .env, nekter skriptet å kjøre.
//
// Gamle klartekstkopier (en mappe med én JSON-fil per tabell) krypteres slik:
//
//   node scripts/sikkerhetskopi.mjs --fra-mappe ../tilbudssystem-backup/2026-08-19_151047
//
// Mappa blir stående. Slett den selv når den krypterte kopien er på plass.
// Kopiene åpnes med gjenopprett-sikkerhetskopi.mjs.

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  BACKUPMAPPE,
  FILENDELSE,
  MILJOVARIABEL,
  ROT,
  dekrypter,
  hentPassfrase,
  krypter,
  lagStempel,
  pakk,
} from "./sikkerhetskopi-felles.mjs";

const BRUK = `Bruk:
  node scripts/sikkerhetskopi.mjs
  node scripts/sikkerhetskopi.mjs --fra-mappe <mappe med en gammel klartekstkopi>
Se kommentaren øverst i skriptet.`;

// Rekkefølgen er valgt slik at det viktigste kommer først: mister vi noe, er det
// linjene på tilbud og endringer som ikke kan gjenskapes.
const TABELLER = [
  "offers",
  "offer_lines",
  "amendments",
  "amendment_lines",
  "amendment_signing_tokens",
  "offer_signing_tokens",
  "line_history",
  "customers",
  "potential_customers",
  "projects",
  "tenders",
  "tender_bids",
  "sms_inbox",
  "app_settings",
  "tenants",
  "tenant_users",
];

// .env har hatt BOM før, og den velter enhver parser. Tegnet lages her i stedet
// for å stå i kildekoden, der det er usynlig og lett forsvinner i en editor.
const BOM = String.fromCodePoint(0xfeff);
function lesTekst(sti) {
  const tekst = readFileSync(sti, "utf8");
  return tekst.startsWith(BOM) ? tekst.slice(1) : tekst;
}

// .env leses for hånd, av samme grunn.
function lesEnv() {
  const sti = join(ROT, ".env");
  const env = {};
  if (!existsSync(sti)) return env;
  for (const linje of lesTekst(sti).split(/\r?\n/)) {
    const m = linje.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

async function hent(url, nokkel, tabell) {
  // PostgREST gir maks 1000 rader per kall, så vi blar oss gjennom.
  const alle = [];
  const side = 1000;
  for (let fra = 0; ; fra += side) {
    const svar = await fetch(`${url}/rest/v1/${tabell}?select=*`, {
      headers: {
        apikey: nokkel,
        Authorization: `Bearer ${nokkel}`,
        Range: `${fra}-${fra + side - 1}`,
      },
    });
    if (!svar.ok) throw new Error(`${svar.status} ${(await svar.text()).slice(0, 200)}`);
    const rader = await svar.json();
    alle.push(...rader);
    if (rader.length < side) break;
  }
  return alle;
}

// En tabell som feiler, stopper ikke resten. Den blir stående i oversikten med
// feilen, men ikke i tabellene, så den aldri kan forveksles med en tom tabell.
async function hentFraBasen(env) {
  const tabeller = {};
  const oversikt = {};
  for (const tabell of TABELLER) {
    try {
      const rader = await hent(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, tabell);
      tabeller[tabell] = rader;
      oversikt[tabell] = rader.length;
      console.log(`  ${tabell.padEnd(26)} ${String(rader.length).padStart(5)} rader`);
    } catch (e) {
      oversikt[tabell] = `FEIL: ${e.message}`;
      console.log(`  ${tabell.padEnd(26)} FEIL: ${e.message}`);
    }
  }
  return { tabeller, oversikt };
}

function lesJson(sti) {
  return JSON.parse(lesTekst(sti));
}

// En gammel klartekstkopi: én JSON-fil per tabell pluss _oversikt.json. Alt må
// stemme med oversikten, ellers kan noe mangle uten at noen merker det.
function lesKlartekstmappe(mappe) {
  const oversiktsfil = join(mappe, "_oversikt.json");
  if (!existsSync(oversiktsfil)) {
    throw new Error(`${mappe} har ingen _oversikt.json, så det er ikke en sikkerhetskopi herfra.`);
  }
  const { tatt, tabeller: oversikt } = lesJson(oversiktsfil);
  if (typeof tatt !== "string" || typeof oversikt !== "object" || oversikt === null) {
    throw new Error(`${oversiktsfil} mangler tidspunkt eller tabelloversikt.`);
  }
  const ukjente = readdirSync(mappe).filter(
    (f) => f.endsWith(".json") && f !== "_oversikt.json" && !(f.slice(0, -5) in oversikt),
  );
  if (ukjente.length)
    throw new Error(`Filer som ikke står i _oversikt.json: ${ukjente.join(", ")}.`);

  const tabeller = {};
  for (const [tabell, antall] of Object.entries(oversikt)) {
    if (typeof antall !== "number") continue; // tabellen feilet da kopien ble tatt
    const rader = lesJson(join(mappe, `${tabell}.json`));
    if (!Array.isArray(rader) || rader.length !== antall) {
      throw new Error(
        `${tabell}.json har ${Array.isArray(rader) ? rader.length : "ingen"} rader, men oversikten sier ${antall}.`,
      );
    }
    tabeller[tabell] = rader;
  }
  return { tatt, oversikt, tabeller };
}

// Midlertidig fil og navnebytte til slutt, så en avbrutt kjøring aldri etterlater
// en halv kopi under et ekte navn. Det som skrives, er allerede kryptert.
function skrivAtomisk(sti, data) {
  const midlertidig = `${sti}.${process.pid}.tmp`;
  const fd = openSync(midlertidig, "wx", 0o600);
  try {
    for (let skrevet = 0; skrevet < data.length; ) skrevet += writeSync(fd, data, skrevet);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    rmSync(midlertidig, { force: true });
    throw e;
  }
  closeSync(fd);
  renameSync(midlertidig, sti);
}

async function main() {
  let valg;
  try {
    valg = parseArgs({
      options: { "fra-mappe": { type: "string" }, hjelp: { type: "boolean", short: "h" } },
    }).values;
  } catch (e) {
    throw new Error(`${e.message}\n${BRUK}`);
  }
  if (valg.hjelp) return console.log(BRUK);

  const env = lesEnv();
  if (MILJOVARIABEL in env) {
    throw new Error(
      `${MILJOVARIABEL} står i .env. Fjern den derfra: ligger passordfrasen på samme ` +
        "disk som kopiene, beskytter krypteringen ingenting.",
    );
  }

  const fraMappe = valg["fra-mappe"] && resolve(valg["fra-mappe"]);
  const gammel = fraMappe && lesKlartekstmappe(fraMappe);
  if (!fraMappe && (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("Fant ikke VITE_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY i .env");
  }
  if (fraMappe && existsSync(join(BACKUPMAPPE, basename(fraMappe) + FILENDELSE))) {
    throw new Error(`${basename(fraMappe)}${FILENDELSE} finnes allerede i ${BACKUPMAPPE}.`);
  }
  const kilde = fraMappe
    ? `klartekstkopien ${basename(fraMappe)}`
    : new URL(env.VITE_SUPABASE_URL).host;

  // Passordfrasen først. Uten den skal ingenting hentes.
  const passfrase = await hentPassfrase({ ny: true });

  const naa = new Date();
  const navn = fraMappe ? basename(fraMappe) : lagStempel(naa);
  const innhold = fraMappe
    ? { tatt: gammel.tatt, kilde, tabeller: gammel.tabeller, oversikt: gammel.oversikt }
    : { tatt: naa.toISOString(), kilde, ...(await hentFraBasen(env)) };

  mkdirSync(BACKUPMAPPE, { recursive: true });
  const fil = join(BACKUPMAPPE, navn + FILENDELSE);
  if (existsSync(fil)) throw new Error(`${fil} finnes allerede.`);
  const pakket = pakk(innhold);
  skrivAtomisk(fil, await krypter(pakket, passfrase));

  // En kopi som ikke kan åpnes, er ingen kopi. Fila leses tilbake slik
  // gjenopprettingen gjør det, før vi sier at alt gikk bra.
  const kontroll = await dekrypter(readFileSync(fil), passfrase);
  if (!kontroll.equals(pakket)) {
    throw new Error(`Kontrollen av ${fil} feilet: innholdet er ikke likt det som ble kryptert.`);
  }

  const verdier = Object.values(innhold.oversikt);
  const rader = verdier.filter((n) => typeof n === "number").reduce((a, b) => a + b, 0);
  const feilet = verdier.filter((n) => typeof n !== "number").length;
  const byte = statSync(fil).size;
  const storrelse =
    byte < 1024 * 1024
      ? `${Math.ceil(byte / 1024)} kB`
      : `${(byte / 1024 / 1024).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB`;
  console.log(`\nKryptert sikkerhetskopi lagret i ${fil}`);
  console.log(
    `${rader} rader, ${storrelse}. Kontrollert: fila lar seg åpne og er lik det som ble kryptert.`,
  );
  if (fraMappe) {
    if (feilet)
      console.log(
        `${feilet} tabell(er) manglet allerede i klartekstkopien; det står i oversikten.`,
      );
    console.log(
      `Klartekstmappa ${fraMappe} ligger der fortsatt. Slett den selv når du har sjekket kopien.`,
    );
  } else if (feilet) {
    console.log(`${feilet} tabell(er) kunne ikke leses; feilen står i oversikten i kopien.`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (e) {
  console.error(e.message);
  process.exitCode = e.kode ?? 1;
}
