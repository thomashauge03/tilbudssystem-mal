import React from "react";
import { andreTilbud, dashbord, endringSum, firma, kunde, nok, ordreverdi, tilbud } from "../data";
import { app } from "../tema";
import { FjordheimMerke } from "./FjordheimLogo";
import { Ikon, IkonNavn } from "./deler";

const Flis: React.FC<{ ikon: IkonNavn; etikett: string; verdi: string; tone: { bg: string; fg: string } }> = ({ ikon, etikett, verdi, tone }) => (
  <div style={{ borderRadius: 12, border: `1px solid ${app.kant}`, background: "#fff", padding: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ borderRadius: 8, padding: 6, background: tone.bg, color: tone.fg, display: "flex" }}>
        <Ikon navn={ikon} storrelse={15} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: app.dempetTekst }}>{etikett}</span>
    </div>
    <div style={{ marginTop: 8, fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{verdi}</div>
  </div>
);

/**
 * Mobilvisningen (src/routes/mobil.tsx): nøkkeltall, endringsmeldinger,
 * tilbud som utløper og de siste tilbudene — det man trenger ute på anlegget.
 */
export const MobilOversikt: React.FC<{ rull?: number }> = ({ rull = 0 }) => {
  const siste = [
    { nummer: tilbud.nummer, tittel: tilbud.tittel, kunde: kunde.navn, sum: ordreverdi, signert: true },
    ...andreTilbud.map((t) => ({ nummer: t.nummer, tittel: t.tittel, kunde: t.kunde, sum: t.total, signert: t.fakturert > 0 })),
  ];
  return (
    <div style={{ position: "absolute", inset: 0, background: app.bakgrunn, color: app.tekst, fontSize: 14 }}>
      <div style={{ transform: `translateY(${-rull}px)` }}>
        <div
          style={{
            paddingTop: 54,
            background: "#fff",
            borderBottom: `1px solid ${app.kant}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
            <FjordheimMerke storrelse={28} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{firma.navn}</span>
            <span style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: "50%", background: app.primar, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>
              {firma.initialer}
            </span>
          </div>
        </div>
        <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Flis ikon="dollar" etikett="Kontraktssum" verdi={nok(dashbord.kontraktssum)} tone={{ bg: "oklch(0.49 0.22 27 / 0.1)", fg: app.primar }} />
            <Flis ikon="sjekk" etikett="Fakturert" verdi={nok(dashbord.fakturert)} tone={{ bg: "#d1fae5", fg: "#047857" }} />
            <Flis ikon="trend" etikett="Gjenstår" verdi={nok(dashbord.kontraktssum - dashbord.fakturert)} tone={{ bg: "#fef3c7", fg: "#b45309" }} />
            <Flis ikon="fil" etikett="Åpne tilbud" verdi={String(dashbord.apneTilbud)} tone={{ bg: "#dbeafe", fg: "#1d4ed8" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 12, border: `1px solid ${app.kant}`, background: "#fff", padding: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              <Ikon navn="utklipp" storrelse={16} farge={app.dempetTekst} />
              Endringsmeldinger
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: app.dempetTekst }}>
              {dashbord.endringer} · {nok(dashbord.endringerSum + endringSum * 0)}
              <Ikon navn="pilHoyre" storrelse={14} />
            </span>
          </div>
          <div style={{ borderRadius: 12, border: `1px solid ${app.kant}`, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${app.kant}`, padding: "10px 12px" }}>
              <Ikon navn="klokke" storrelse={16} farge={app.dempetTekst} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Utløper snart</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: app.dempetTekst }}>Neste 14 dager</span>
            </div>
            {andreTilbud.slice(0, 2).map((t, i) => (
              <div key={t.nummer} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderTop: i ? `1px solid ${app.kant}` : undefined }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    #{t.nummer} {t.tittel}
                  </div>
                  <div style={{ fontSize: 12, color: app.dempetTekst }}>{t.kunde}</div>
                </div>
                <span style={{ borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 500, background: i ? "#fef3c7" : "#fee2e2", color: i ? "#b45309" : "#b91c1c" }}>
                  {i ? "11d" : "5d"}
                </span>
              </div>
            ))}
          </div>
          <div style={{ borderRadius: 12, border: `1px solid ${app.kant}`, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${app.kant}`, padding: "10px 12px" }}>
              <Ikon navn="fil" storrelse={16} farge={app.dempetTekst} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Siste tilbud</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, color: app.primar }}>Se alle</span>
            </div>
            {siste.map((o, i) => (
              <div key={o.nummer} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderTop: i ? `1px solid ${app.kant}` : undefined }}>
                <span style={{ width: 44, flexShrink: 0, fontSize: 12, color: app.dempetTekst, fontVariantNumeric: "tabular-nums" }}>#{o.nummer}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.tittel}</div>
                  <div style={{ fontSize: 12, color: app.dempetTekst }}>{o.kunde}</div>
                </div>
                <span style={{ display: "flex", gap: 3, color: o.signert ? "#16a34a" : "rgba(0,0,0,0.18)" }}>
                  <Ikon navn="penn" storrelse={14} />
                  <Ikon navn="filSjekk" storrelse={14} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{nok(o.sum)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
