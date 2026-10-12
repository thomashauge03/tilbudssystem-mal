import React from "react";
import { erOverskrift, firma, kunde, linjeSum, MVA, nok, tilbud, tilbudSum } from "../data";
import { inter } from "../fonter";
import { FjordheimLogo } from "./FjordheimLogo";

const num = (n: number) => new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n);

/**
 * Første side av tilbudet som PDF — det kunden får. Firmaets logo øverst,
 * linjene med overskrifter, og summen med og uten mva.
 */
export const TilbudPdf: React.FC<{ bredde: number }> = ({ bredde }) => {
  const zoom = bredde / 794;
  const mva = tilbudSum * MVA;
  const graa = "#6b7280";
  return (
    <div
      style={{
        width: bredde,
        height: (bredde * 1123) / 794,
        background: "#FFFFFF",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 30px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ zoom, width: 794, height: 1123, padding: "56px 64px", fontFamily: inter, color: "#111827", fontSize: 12, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <FjordheimLogo hoyde={54} />
          <div style={{ textAlign: "right", fontSize: 11, lineHeight: 1.6, color: graa }}>
            <div style={{ fontWeight: 700, color: "#111827", fontSize: 12 }}>{firma.navn}</div>
            <div>Tilbud #{tilbud.nummer}</div>
            <div>Dato {tilbud.dato}</div>
            <div>Gyldig til {tilbud.gyldigTil}</div>
          </div>
        </div>
        <div style={{ marginTop: 48, fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>TILBUD</div>
        <div style={{ marginTop: 2, fontSize: 16, fontWeight: 600 }}>{tilbud.tittel}</div>
        <div style={{ marginTop: 22, display: "flex", gap: 48, fontSize: 11.5, lineHeight: 1.6 }}>
          <div>
            <div style={{ color: graa, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9.5 }}>Til</div>
            <div style={{ fontWeight: 600 }}>{kunde.navn}</div>
          </div>
          <div>
            <div style={{ color: graa, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9.5 }}>Vår referanse</div>
            <div style={{ fontWeight: 600 }}>{firma.bruker}</div>
          </div>
          <div>
            <div style={{ color: graa, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9.5 }}>Prosjekt</div>
            <div style={{ fontWeight: 600 }}>{tilbud.prosjekt}</div>
          </div>
        </div>
        <div style={{ marginTop: 20, fontSize: 11.5, lineHeight: 1.6, color: "#374151", maxWidth: 560 }}>{tilbud.tekst}</div>
        <table style={{ marginTop: 22, width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #111827", textAlign: "left" }}>
              {["Beskrivelse", "Antall", "Enhet", "Pris", "Sum"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: "6px 4px",
                    fontWeight: 700,
                    fontSize: 9.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    textAlign: i === 0 || i === 2 ? "left" : "right",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tilbud.linjer.map((l, i) =>
              erOverskrift(l) ? (
                <tr key={i}>
                  <td colSpan={5} style={{ padding: "12px 4px 5px", fontWeight: 800, fontSize: 11, letterSpacing: "0.04em", borderBottom: "1px solid #e5e7eb" }}>
                    {l.overskrift}
                  </td>
                </tr>
              ) : (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "7px 4px" }}>{l.tekst}</td>
                  <td style={{ padding: "7px 4px", textAlign: "right" }}>{num(l.antall)}</td>
                  <td style={{ padding: "7px 4px" }}>{l.enhet}</td>
                  <td style={{ padding: "7px 4px", textAlign: "right" }}>{nok(l.pris)}</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 600 }}>{nok(linjeSum(l))}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <div style={{ marginTop: 18, marginLeft: "auto", width: 300, fontSize: 11.5, lineHeight: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: graa }}>Sum eks. mva</span>
            <span>{nok(tilbudSum)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: graa }}>Mva 25 %</span>
            <span>{nok(mva)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1.5px solid #111827", marginTop: 4, paddingTop: 4, fontWeight: 800, fontSize: 13 }}>
            <span>Totalt inkl. mva</span>
            <span>{nok(tilbudSum + mva)}</span>
          </div>
        </div>
        <div style={{ position: "absolute", left: 64, right: 64, bottom: 44, borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 9.5, color: graa }}>
          <span>{firma.navn}</span>
          <span>Side 1 av 2</span>
        </div>
      </div>
    </div>
  );
};
