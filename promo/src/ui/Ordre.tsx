import React from "react";
import { andreTilbud, endringSum, kunde, nok as nokRaa, ordreverdi, tilbud } from "../data";

// Hele kroner mens tallene teller, ellers flimrer ørene
const nok = (n: number) => nokRaa(Math.round(n));
import { app } from "../tema";
import { Ikon, Kort, Merke, Sidetittel, Stolpe } from "./deler";

/**
 * Ordre (src/routes/ordre.tsx): sammendrag øverst, så én rad per godkjent
 * tilbud med fakturert og fremdrift.
 *
 * `fakturert` (0–1) er hvor mye av vår ordre som er fakturert. Sammendraget
 * og raden følger den, og statusen går fra «Ikke startet» via «Delvis utført»
 * til «Utført».
 */
export const Ordre: React.FC<{ fakturert?: number; uthev?: number }> = ({ fakturert = 0, uthev = 0 }) => {
  const andre = andreTilbud.filter((t) => t.fakturert < 1);
  const andreTotal = andre.reduce((s, t) => s + t.total, 0);
  const andreFakt = andre.reduce((s, t) => s + t.total * t.fakturert, 0);
  const vaarFakt = ordreverdi * fakturert;
  const total = ordreverdi + andreTotal;
  const fakt = vaarFakt + andreFakt;

  const status = (andel: number) => (andel <= 0 ? "Ikke startet" : andel >= 0.999 ? "Utført" : "Delvis utført");
  const tone = (s: string) => (s === "Utført" ? "gronn" : s === "Delvis utført" ? "gul" : "slate");

  const rader = [
    { nummer: tilbud.nummer, kunde: kunde.navn, tittel: tilbud.tittel, dato: "17.09.2026", total: ordreverdi, andel: fakturert, vaar: true },
    ...andre.map((t, i) => ({
      nummer: t.nummer,
      kunde: t.kunde,
      tittel: t.tittel,
      dato: ["12.09.2026", "04.09.2026", "30.08.2026"][i] ?? "25.08.2026",
      total: t.total,
      andel: t.fakturert,
      vaar: false,
    })),
  ];

  return (
    <div>
      <Sidetittel tittel="Ordre" under="Godkjente tilbud og hva som er fakturert" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { l: "Total ordreverdi", v: nok(total), h: `herav ${nok(endringSum)} i endringsmeldinger` },
          { l: "Fakturert", v: nok(fakt), h: null },
          { l: "Gjenstår", v: nok(Math.max(0, total - fakt)), h: null },
        ].map((c) => (
          <Kort key={c.l}>
            <div style={{ fontSize: 14, color: app.dempetTekst }}>{c.l}</div>
            <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums" }}>{c.v}</div>
            {c.h && <div style={{ marginTop: 4, fontSize: 12, color: app.dempetTekst }}>{c.h}</div>}
          </Kort>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 16px" }}>
        <div
          style={{
            flex: 1,
            maxWidth: 384,
            height: 36,
            borderRadius: 7,
            border: `1px solid ${app.input}`,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 12px",
            fontSize: 14,
            color: app.dempetTekst,
          }}
        >
          <Ikon navn="sok" storrelse={16} />
          Søk på kunde, beskrivelse eller nr…
        </div>
        <div style={{ display: "flex", border: `1px solid ${app.kant}`, borderRadius: 7, background: "#fff", padding: 4 }}>
          {["Alle", "Aktive", "Fullførte"].map((f) => (
            <div
              key={f}
              style={{
                padding: "4px 12px",
                borderRadius: 5,
                fontSize: 14,
                fontWeight: 500,
                background: f === "Aktive" ? app.primar : "transparent",
                color: f === "Aktive" ? "#fff" : app.dempetTekst,
              }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>
      <Kort padding={0} stil={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "oklch(0.95 0.01 80 / 0.5)", textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: app.dempetTekst }}>
              {["Nr.", "Status", "Kunde", "Beskrivelse", "Signert", "Totalt", "Fakturert", "Fremdrift"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "12px 16px",
                    fontWeight: 600,
                    borderBottom: `1px solid ${app.kant}`,
                    textAlign: h === "Totalt" || h === "Fakturert" ? "right" : h === "Signert" ? "center" : "left",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rader.map((r, i) => {
              const s = status(r.andel);
              return (
                <tr
                  key={r.nummer}
                  style={{
                    borderBottom: `1px solid ${app.kant}`,
                    background: r.vaar ? `oklch(0.97 0.03 80 / ${0.4 + uthev * 0.6})` : i % 2 === 1 ? "oklch(0.95 0.01 80 / 0.2)" : undefined,
                  }}
                >
                  <td style={{ padding: "14px 16px", color: app.primar, fontVariantNumeric: "tabular-nums" }}>#{r.nummer}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <Merke tone={tone(s)}>{s}</Merke>
                  </td>
                  <td style={{ padding: "14px 16px" }}>{r.kunde}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontWeight: r.vaar ? 600 : 400 }}>{r.tittel}</span>
                    {r.vaar && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: app.dempetTekst }}>
                        + 1 endring
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: "#15803d" }}>
                      <Ikon navn="sjekk" storrelse={14} />
                      {r.dato}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{nok(r.total)}</td>
                  <td style={{ padding: "14px 16px", textAlign: "right", color: app.dempetTekst, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {r.andel > 0 ? nok(r.total * r.andel) : "—"}
                  </td>
                  <td style={{ padding: "14px 16px", width: 170 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Stolpe pst={r.andel * 100} farge={r.andel >= 0.999 ? "#16a34a" : r.andel > 0 ? "#f59e0b" : "#e5e7eb"} hoyde={7} />
                      <span style={{ fontSize: 12, color: app.dempetTekst, width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(r.andel * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Kort>
    </div>
  );
};
