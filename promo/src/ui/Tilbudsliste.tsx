import React from "react";
import { andreTilbud, kunde, nok, tilbud, tilbudSum } from "../data";
import { inter } from "../fonter";
import { app } from "../tema";
import { Ikon, Kort, Merke, Sidetittel } from "./deler";

/**
 * Tilbudslisten (src/routes/tilbud.index.tsx). Vårt tilbud ligger øverst, og
 * `godkjent` (0–1) bytter merkelappen fra «Sendt» til «Godkjent» med et lite
 * sprett og lyser opp raden.
 */
export const Tilbudsliste: React.FC<{ godkjent?: number }> = ({ godkjent = 0 }) => {
  const rader = [
    { nummer: tilbud.nummer, kunde: kunde.navn, tittel: tilbud.tittel, dato: tilbud.dato, gyldig: tilbud.gyldigTil, sum: tilbudSum, vaar: true },
    ...andreTilbud.map((t, i) => ({
      nummer: t.nummer,
      kunde: t.kunde,
      tittel: t.tittel,
      dato: ["11.09.2026", "08.09.2026", "02.09.2026", "28.08.2026", "21.08.2026"][i],
      gyldig: ["26.09.2026", "08.10.2026", "02.10.2026", "—", "—"][i],
      sum: t.total,
      vaar: false,
    })),
  ];
  const status = (i: number) => (i === 0 ? null : (["Sendt", "Godkjent", "Godkjent", "Fullført", "Godkjent"] as const)[i - 1]);
  const pop = godkjent > 0 && godkjent < 1 ? 1 + Math.sin(godkjent * Math.PI) * 0.18 : 1;

  return (
    <div>
      <Sidetittel tittel="Tilbud" under="Alle tilbud, med status og signering" />
      <Kort padding={0} stil={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "oklch(0.95 0.01 80 / 0.5)", textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: app.dempetTekst }}>
              {["Nr.", "Status", "Kunde", "Beskrivelse", "Opprettet", "Gyldig t.o.m.", "Signert", "Sum eks. mva"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", fontWeight: 600, textAlign: h === "Sum eks. mva" ? "right" : h === "Signert" ? "center" : "left", borderBottom: `1px solid ${app.kant}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rader.map((r, i) => {
              const s = status(i);
              const lys = r.vaar ? Math.sin(Math.min(1, godkjent) * Math.PI) * 0.6 : 0;
              return (
                <tr
                  key={r.nummer}
                  style={{
                    borderBottom: `1px solid ${app.kant}`,
                    background: r.vaar ? `rgba(34,197,94,${0.1 * lys + (godkjent >= 1 ? 0.04 : 0)})` : i % 2 === 1 ? "oklch(0.95 0.01 80 / 0.2)" : undefined,
                  }}
                >
                  <td style={{ padding: "13px 16px", color: app.primar, fontVariantNumeric: "tabular-nums" }}>#{r.nummer}</td>
                  <td style={{ padding: "13px 16px" }}>
                    {r.vaar ? (
                      <Merke tone={godkjent >= 0.5 ? "gronn" : "gul"} stil={{ transform: `scale(${pop})` }}>
                        {godkjent >= 0.5 ? "Godkjent" : "Sendt"}
                      </Merke>
                    ) : (
                      <Merke tone={s === "Sendt" ? "gul" : s === "Fullført" ? "bla" : "gronn"}>{s}</Merke>
                    )}
                  </td>
                  <td style={{ padding: "13px 16px" }}>{r.kunde}</td>
                  <td style={{ padding: "13px 16px", fontWeight: r.vaar ? 600 : 400 }}>{r.tittel}</td>
                  <td style={{ padding: "13px 16px", color: app.dempetTekst }}>{r.dato}</td>
                  <td style={{ padding: "13px 16px", color: app.dempetTekst }}>{r.gyldig}</td>
                  <td style={{ padding: "13px 16px", textAlign: "center" }}>
                    <span style={{ display: "inline-flex", color: (r.vaar ? godkjent >= 0.5 : s !== "Sendt") ? "#16a34a" : "rgba(0,0,0,0.18)" }}>
                      <Ikon navn="penn" storrelse={16} />
                    </span>
                  </td>
                  <td style={{ padding: "13px 16px", textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{nok(r.sum)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Kort>
    </div>
  );
};

/**
 * E-postvarselet, slik det dukker opp på skjermen: emnet er det samme som
 * varsel-e-posten i appen bruker (supabase/functions/varsel-epost/tekst.ts).
 */
export const EpostVarsel: React.FC<{ bredde: number; mork?: boolean; emne?: string; tekst?: string }> = ({
  bredde,
  mork = false,
  emne = `Tilbud #${tilbud.nummer} signert av ${kunde.navn}`,
  tekst = `${kunde.navn} signerte tilbud #${tilbud.nummer} «${tilbud.tittel}» den 17. september kl. ${tilbud.signert.klokke}.`,
}) => (
  <div
    style={{
      width: bredde,
      borderRadius: 22,
      padding: "14px 16px",
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      background: mork ? "rgba(40,40,44,0.78)" : "rgba(246,246,248,0.88)",
      backdropFilter: "blur(30px) saturate(1.6)",
      boxShadow: "0 20px 50px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(0,0,0,0.12)",
      color: mork ? "#fff" : "#111",
      fontFamily: inter,
      fontFeatureSettings: "'cv11'",
    }}
  >
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 9,
        flexShrink: 0,
        background: "linear-gradient(180deg, #3d8bff, #1f6bff)",
        display: "grid",
        placeItems: "center",
        color: "#fff",
      }}
    >
      <Ikon navn="epost" storrelse={22} strek={1.8} />
    </div>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, opacity: 0.55, fontWeight: 500 }}>
        <span>E-post</span>
        <span>nå</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2, letterSpacing: "-0.01em" }}>{emne}</div>
      <div style={{ fontSize: 14, opacity: 0.8, marginTop: 2, lineHeight: 1.35 }}>{tekst}</div>
    </div>
  </div>
);
