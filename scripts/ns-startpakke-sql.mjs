// Lager VALUES-radene til startpakken i NS-kodebanken fra docs/ns3420-startliste.md.
// Kjør: node scripts/ns-startpakke-sql.mjs
//
// Koder som bare gjelder utgaven fra 2015 og eldre, tas ikke med. Flere av dem
// betyr noe annet i dag (UP1.11 var forankring av rør og er nå betongkum).
// UVERIFISERT-koder (bare én byggherre) merkes med maa_kontrolleres = true.
import { readFileSync } from "node:fs";

const md = readFileSync(new URL("../docs/ns3420-startliste.md", import.meta.url), "utf8");
// Samme skrivemåte som enhetene i appen (UNITS i src/lib/format.ts)
const ENHET = { m2: "m²", m3: "m³", timer: "time" };
const q = (s) => `'${s.replace(/'/g, "''")}'`;

const rader = [];
for (const linje of md.split("\n")) {
  const m = linje.match(/^\| ([A-Z]+) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \|/);
  if (!m) continue;
  const [, del, kode, emne, enhetRaa, status] = m;
  if (status.includes("≤2015")) continue;
  const forste = enhetRaa.split("/")[0].trim();
  const enhet = ENHET[forste] ?? forste;
  const maa = status.trim().startsWith("UVERIFISERT");
  rader.push(`    (${q(del)}, ${q(kode.trim())}, ${q(emne.trim())}, ${q(enhet)}, ${maa})`);
}
console.log(rader.join(",\n"));
console.error(`${rader.length} koder`);
