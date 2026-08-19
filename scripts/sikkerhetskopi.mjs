// Sikkerhetskopi av alle data i basen, som JSON-filer på disk.
//
// Bakgrunn: Supabase free plan har ingen automatiske sikkerhetskopier. Da 18.08.2026
// nullet antallet seg på endring 1017-1 fantes ingen vei tilbake. Denne skal kjøres
// før større endringer — og gjerne fast.
//
//   node scripts/sikkerhetskopi.mjs
//
// Kopien havner i ../tilbudssystem-backup/<dato-klokkeslett>/ — altså UTENFOR repoet,
// så produksjonsdata aldri havner i git.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// .env leses for hånd. Fila har hatt BOM før, og den velter enhver parser.
const env = {};
for (const linje of readFileSync(join(rot, ".env"), "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
  const m = linje.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const URL_BASE = env.VITE_SUPABASE_URL;
const NOKKEL = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !NOKKEL) {
  console.error("Fant ikke VITE_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY i .env");
  process.exit(1);
}

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

async function hent(tabell) {
  // PostgREST gir maks 1000 rader per kall, så vi blar oss gjennom.
  const alle = [];
  const side = 1000;
  for (let fra = 0; ; fra += side) {
    const svar = await fetch(`${URL_BASE}/rest/v1/${tabell}?select=*`, {
      headers: {
        apikey: NOKKEL,
        Authorization: `Bearer ${NOKKEL}`,
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

const naa = new Date();
const stempel =
  naa.toISOString().slice(0, 10) + "_" + naa.toTimeString().slice(0, 8).replace(/:/g, "");
const mappe = join(rot, "..", "tilbudssystem-backup", stempel);
mkdirSync(mappe, { recursive: true });

const fasit = {};
let feilet = 0;

for (const tabell of TABELLER) {
  try {
    const rader = await hent(tabell);
    writeFileSync(join(mappe, `${tabell}.json`), JSON.stringify(rader, null, 2), "utf8");
    fasit[tabell] = rader.length;
    console.log(`  ${tabell.padEnd(26)} ${String(rader.length).padStart(5)} rader`);
  } catch (e) {
    feilet++;
    fasit[tabell] = `FEIL: ${e.message}`;
    console.log(`  ${tabell.padEnd(26)}   — ${e.message}`);
  }
}

writeFileSync(
  join(mappe, "_oversikt.json"),
  JSON.stringify({ tatt: naa.toISOString(), tabeller: fasit }, null, 2),
  "utf8",
);

console.log(`\nSikkerhetskopi lagret i ${mappe}`);
if (feilet) console.log(`${feilet} tabell(er) kunne ikke leses — se _oversikt.json.`);
