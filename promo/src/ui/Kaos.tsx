import React from "react";
import { loadFont } from "@remotion/google-fonts/Caveat";
import { inter } from "../fonter";

const { fontFamily: haandskrift } = loadFont("normal", { weights: ["600"], subsets: ["latin", "latin-ext"] });

/**
 * «Slik er det i dag»: dokumenter, regneark, e-poster, SMS-er og gule lapper.
 * Bevisst generiske — ingen programmer eller merker, bare kjente former.
 */

const Tittellinje: React.FC<{ farge: string; navn: string }> = ({ farge, navn }) => (
  <div style={{ height: 30, background: farge, display: "flex", alignItems: "center", padding: "0 12px", gap: 7 }}>
    {[0, 1, 2].map((i) => (
      <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }} />
    ))}
    <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.92)" }}>{navn}</span>
  </div>
);

export const Dokument: React.FC<{ navn: string; bredde?: number }> = ({ navn, bredde = 420 }) => (
  <div style={{ width: bredde, borderRadius: 10, overflow: "hidden", background: "#e9ebef", boxShadow: "0 24px 60px rgba(0,0,0,0.55)", fontFamily: inter }}>
    <Tittellinje farge="#3b5b8f" navn={navn} />
    <div style={{ padding: "18px 26px 26px" }}>
      <div style={{ background: "#fff", padding: "22px 24px", borderRadius: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1f2937" }}>TILBUD</div>
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>Graving og drenering — utkast 3 (ENDELIG?)</div>
        {[100, 92, 97, 60, 0, 88, 94, 70].map((w, i) =>
          w ? (
            <div key={i} style={{ height: 6, width: `${w}%`, background: "#d1d5db", borderRadius: 3, marginTop: 9 }} />
          ) : (
            <div key={i} style={{ height: 10 }} />
          ),
        )}
        <div style={{ marginTop: 14, border: "1px solid #d1d5db" }}>
          {[0, 1, 2, 3].map((r) => (
            <div key={r} style={{ display: "flex", borderTop: r ? "1px solid #e5e7eb" : undefined }}>
              {[55, 15, 30].map((w, c) => (
                <div key={c} style={{ width: `${w}%`, height: 16, borderLeft: c ? "1px solid #e5e7eb" : undefined, padding: "5px 6px" }}>
                  <div style={{ height: 5, width: c === 2 ? "70%" : "85%", background: r === 0 ? "#9ca3af" : "#e5e7eb", borderRadius: 2, marginLeft: c === 2 ? "auto" : 0 }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const KOLONNER = ["A", "B", "C", "D", "E", "F"];
const CELLER = [
  ["Post", "Mengde", "Enh.", "Pris", "Sum", ""],
  ["Graving", "48", "m", "450", "21 600", ""],
  ["Drens", "48", "m", "520", "#REF!", ""],
  ["Kummer", "2", "stk", "6 800", "13 600", ""],
  ["Pukk", "30", "m3", "615", "18 450", "??"],
  ["Asfalt", "65", "m2", "830", "53 950", ""],
  ["", "", "", "SUM", "#REF!", ""],
];

export const Regneark: React.FC<{ navn: string; bredde?: number }> = ({ navn, bredde = 460 }) => (
  <div style={{ width: bredde, borderRadius: 10, overflow: "hidden", background: "#fff", boxShadow: "0 24px 60px rgba(0,0,0,0.55)", fontFamily: inter }}>
    <Tittellinje farge="#2f6b4a" navn={navn} />
    <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${KOLONNER.length}, 1fr)`, fontSize: 11 }}>
      <div style={{ background: "#f3f4f6", borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }} />
      {KOLONNER.map((k) => (
        <div key={k} style={{ background: "#f3f4f6", textAlign: "center", padding: "3px 0", color: "#6b7280", borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}>
          {k}
        </div>
      ))}
      {CELLER.map((rad, r) => (
        <React.Fragment key={r}>
          <div style={{ background: "#f3f4f6", textAlign: "center", padding: "4px 0", color: "#6b7280", borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}>
            {r + 1}
          </div>
          {rad.map((c, i) => (
            <div
              key={i}
              style={{
                padding: "4px 6px",
                borderRight: "1px solid #eef0f2",
                borderBottom: "1px solid #eef0f2",
                textAlign: i >= 1 && i <= 4 ? "right" : "left",
                fontWeight: r === 0 || c === "SUM" ? 700 : 400,
                color: c.startsWith("#") ? "#dc2626" : "#1f2937",
                background: c.startsWith("#") ? "#fee2e2" : undefined,
                whiteSpace: "nowrap",
              }}
            >
              {c}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  </div>
);

export const Epost: React.FC<{ fra: string; emne: string; tekst: string; bredde?: number }> = ({ fra, emne, tekst, bredde = 400 }) => (
  <div style={{ width: bredde, borderRadius: 14, background: "#fff", boxShadow: "0 24px 60px rgba(0,0,0,0.55)", padding: "14px 16px", fontFamily: inter, display: "flex", gap: 12 }}>
    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#cbd5e1", color: "#334155", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
      {fra
        .split(" ")
        .map((d) => d[0])
        .join("")}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
        <b style={{ color: "#111827" }}>{fra}</b>
        <span style={{ color: "#9ca3af", fontSize: 12 }}>22:47</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginTop: 1 }}>{emne}</div>
      <div style={{ fontSize: 12.5, color: "#6b7280", marginTop: 2, lineHeight: 1.35 }}>{tekst}</div>
    </div>
  </div>
);

export const Sms: React.FC<{ tekst: string; bredde?: number }> = ({ tekst, bredde = 300 }) => (
  <div
    style={{
      maxWidth: bredde,
      borderRadius: 20,
      background: "#e5e5ea",
      color: "#111",
      padding: "10px 15px",
      fontSize: 16,
      lineHeight: 1.3,
      fontFamily: inter,
      boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
    }}
  >
    {tekst}
  </div>
);

export const Lapp: React.FC<{ tekst: string; storrelse?: number }> = ({ tekst, storrelse = 190 }) => (
  <div
    style={{
      width: storrelse,
      height: storrelse,
      background: "linear-gradient(170deg, #fff3a3 0%, #ffe872 100%)",
      boxShadow: "0 20px 44px rgba(0,0,0,0.5)",
      padding: 18,
      fontFamily: haandskrift,
      fontSize: storrelse * 0.17,
      fontWeight: 600,
      lineHeight: 1.1,
      color: "#3a3320",
    }}
  >
    {tekst}
  </div>
);

export const PdfIkon: React.FC<{ navn: string }> = ({ navn }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontFamily: inter, width: 150 }}>
    <div
      style={{
        width: 84,
        height: 104,
        background: "#fff",
        borderRadius: 6,
        position: "relative",
        boxShadow: "0 16px 36px rgba(0,0,0,0.5)",
        clipPath: "polygon(0 0, 72% 0, 100% 22%, 100% 100%, 0 100%)",
      }}
    >
      <div style={{ position: "absolute", left: 10, bottom: 14, background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 800, padding: "3px 6px", borderRadius: 3 }}>PDF</div>
    </div>
    <div style={{ fontSize: 13, color: "#e5e7eb", textAlign: "center", fontWeight: 500 }}>{navn}</div>
  </div>
);
