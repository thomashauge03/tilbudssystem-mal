// Sammenligner to kataloger fra katalog.mjs, typisk produksjonen og kjeden.
//
//   node scripts/migrasjonstest/sammenlign.mjs prod.json kjede.json
//
// Forskjeller som bare gjelder linjeskift (CRLF), mellomrom eller kommentarer i
// funksjonstekster, og utvidelser Supabase har selv, regnes ikke som avvik.
// Avslutter med kode 1 hvis det finnes andre avvik.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Finnes i Supabase, men ikke i PGlite. pg_net er etterlignet i oppsettet.
export const MILJOUTVIDELSER = ["pg_net", "pg_stat_statements", "supabase_vault"];

const OPPSETT = {
  tabeller: {
    nokkel: (r) => r.navn,
    felt: ["type", "rls", "force_rls", "acl", "eier", "kommentar", "lagringsvalg", "replika_id", "varighet"],
  },
  kolonner: {
    nokkel: (r) => `${r.tabell}.${r.kolonne}`,
    felt: ["type", "ikke_null", "standard", "identitet", "generert", "acl", "kommentar", "pos"],
  },
  begrensninger: { nokkel: (r) => `${r.tabell}.${r.navn}`, felt: ["type", "def"] },
  indekser: { nokkel: (r) => `${r.tabell}.${r.navn}`, felt: ["def", "fra_begrensning"] },
  funksjoner: { nokkel: (r) => `${r.navn}(${r.args})`, felt: ["type", "def", "acl", "eier", "kommentar"] },
  triggere: { nokkel: (r) => `${r.skjema}.${r.tabell}.${r.navn}`, felt: ["def", "aktiv"] },
  policyer: {
    nokkel: (r) => `${r.skjema}.${r.tabell}.${r.navn}`,
    felt: ["permissive", "roller", "cmd", "qual", "with_check"],
  },
  visninger: { nokkel: (r) => r.navn, felt: ["def", "type"] },
  sekvenser: {
    nokkel: (r) => r.navn,
    felt: ["type", "start", "steg", "min", "max", "syklus", "eid_av", "acl"],
  },
  typer: { nokkel: (r) => r.navn, felt: ["type", "verdier", "basistype"] },
  utvidelser: { nokkel: (r) => r.navn, felt: ["skjema"] },
  skjemarettigheter: { nokkel: (r) => r.navn, felt: ["acl"] },
  publikasjoner: { nokkel: (r) => `${r.navn}.${r.tabell}`, felt: [] },
  bøtter: { nokkel: (r) => r.id, felt: ["navn", "offentlig", "grense", "typer"] },
};

const sortert = (x) => (Array.isArray(x) ? [...x].sort() : x);
const mellomrom = (s) => s.replace(/\s+/g, " ").trim();
const utenKommentarer = (s) => mellomrom(s.replace(/--[^\n]*/g, ""));

/** Hvilken ufarlig forskjell det er, eller null hvis den er reell. */
function klasse(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return null;
  if (a.replace(/\r/g, "") === b.replace(/\r/g, "")) return "bare linjeskift (CRLF)";
  if (mellomrom(a) === mellomrom(b)) return "bare mellomrom";
  if (utenKommentarer(a) === utenKommentarer(b)) return "bare kommentarer";
  return null;
}

/** { kategori: { kunIProd, kunIKjede, ulike: [{ nokkel, forskjell }] } } */
export function sammenlign(prod, kjede) {
  const resultat = {};
  for (const [kat, { nokkel, felt }] of Object.entries(OPPSETT)) {
    const a = new Map((prod[kat] || []).map((r) => [nokkel(r), r]));
    const b = new Map((kjede[kat] || []).map((r) => [nokkel(r), r]));
    const ulike = [];
    for (const [k, ra] of a) {
      const rb = b.get(k);
      if (!rb) continue;
      const forskjell = {};
      for (const f of felt) {
        if (JSON.stringify(sortert(ra[f])) === JSON.stringify(sortert(rb[f]))) continue;
        forskjell[f] = { prod: ra[f], kjede: rb[f], klasse: klasse(ra[f], rb[f]) };
      }
      if (Object.keys(forskjell).length) ulike.push({ nokkel: k, forskjell });
    }
    resultat[kat] = {
      kunIProd: [...a.keys()].filter((k) => !b.has(k)),
      kunIKjede: [...b.keys()].filter((k) => !a.has(k)),
      ulike,
    };
  }
  return resultat;
}

const ufarlig = (u) => Object.values(u.forskjell).every((f) => f.klasse);

/** Avvikene som betyr noe, som lesbare linjer. Tom liste: kjeden gir produksjonen. */
export function vesentligeAvvik(resultat) {
  const ut = [];
  for (const [kat, r] of Object.entries(resultat)) {
    for (const k of r.kunIProd) {
      if (kat === "utvidelser" && MILJOUTVIDELSER.includes(k)) continue;
      ut.push(`${kat}: ${k} finnes bare i produksjon`);
    }
    for (const k of r.kunIKjede) ut.push(`${kat}: ${k} finnes bare i kjeden`);
    for (const u of r.ulike) {
      if (ufarlig(u)) continue;
      const felt = Object.entries(u.forskjell)
        .filter(([, f]) => !f.klasse)
        .map(([navn, f]) => {
          if (navn !== "def") return `${navn}: prod ${JSON.stringify(f.prod)}, kjede ${JSON.stringify(f.kjede)}`;
          const la = String(f.prod).replace(/\r/g, "").split("\n");
          const lb = String(f.kjede).replace(/\r/g, "").split("\n");
          let i = 0;
          while (i < la.length && la[i] === lb[i]) i++;
          return `def fra linje ${i + 1}: prod «${(la[i] ?? "").trim()}», kjede «${(lb[i] ?? "").trim()}»`;
        });
      ut.push(`${kat}: ${u.nokkel} er ulik (${felt.join("; ")})`);
    }
  }
  return ut;
}

/** De ufarlige forskjellene, gruppert, til rapporten. */
export function ufarligeForskjeller(resultat) {
  const grupper = {};
  for (const [kat, r] of Object.entries(resultat)) {
    for (const u of r.ulike) {
      if (!ufarlig(u)) continue;
      const k = `${kat}, ${[...new Set(Object.values(u.forskjell).map((f) => f.klasse))].join(" og ")}`;
      (grupper[k] ||= []).push(u.nokkel.split("(")[0]);
    }
    if (kat === "utvidelser") {
      const miljo = r.kunIProd.filter((k) => MILJOUTVIDELSER.includes(k));
      if (miljo.length) grupper["utvidelser Supabase har selv"] = miljo;
    }
  }
  return grupper;
}

export function skrivRapport(resultat) {
  const avvik = vesentligeAvvik(resultat);
  for (const [k, liste] of Object.entries(ufarligeForskjeller(resultat))) {
    console.log(`likt bortsett fra ${k} (${liste.length}): ${liste.join(", ")}`);
  }
  if (avvik.length) {
    console.log(`\n${avvik.length} avvik:`);
    for (const a of avvik) console.log(`  ${a}`);
  } else {
    console.log("\ningen avvik: kjeden gir samme skjema som produksjonen");
  }
  return avvik;
}

const kjortDirekte =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (kjortDirekte) {
  const [, , aFil, bFil] = process.argv;
  if (!aFil || !bFil) {
    console.log("Bruk: node scripts/migrasjonstest/sammenlign.mjs prod.json kjede.json");
    process.exit(2);
  }
  const lesJson = (f) => JSON.parse(readFileSync(f, "utf8"));
  const avvik = skrivRapport(sammenlign(lesJson(aFil), lesJson(bFil)));
  process.exitCode = avvik.length ? 1 : 0;
}
