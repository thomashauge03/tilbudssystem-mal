import React from "react";
import { endring, endringSum, kunde, MVA, nok, tilbud, tilbudSum } from "../data";
import { Hake, Signatur } from "../felles/Signatur";
import { FjordheimLogo } from "./FjordheimLogo";
import { Ikon } from "./deler";

const g = {
  bg: "#f9fafb",
  kant: "#e5e7eb",
  g300: "#d1d5db",
  g400: "#9ca3af",
  g500: "#6b7280",
  g600: "#4b5563",
  g700: "#374151",
  g900: "#111827",
  primar: "oklch(0.49 0.22 27)",
};

const Kort: React.FC<{ children: React.ReactNode; stil?: React.CSSProperties }> = ({ children, stil }) => (
  <div style={{ background: "#fff", border: `1px solid ${g.kant}`, borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", padding: 20, ...stil }}>
    {children}
  </div>
);

export const SIGNATUR_BREDDE = 297;

/**
 * Signeringssiden kunden åpner fra lenken (src/routes/signer.$token.tsx), slik
 * den ser ut på en telefon. Alt styres utenfra: rulling, hvor mye av navnet
 * som er skrevet, hvor langt signaturen er tegnet, avkrysningen og knappen.
 */
export const Signeringsside: React.FC<{
  dokument?: "tilbud" | "endring";
  rull?: number;
  navnTegn?: number;
  navnFokus?: boolean;
  signatur?: number;
  avkrysset?: boolean;
  knappTrykk?: number;
  ferdig?: number;
  hake?: number;
}> = ({ dokument = "tilbud", rull = 0, navnTegn = 0, navnFokus = false, signatur = 0, avkrysset = false, knappTrykk = 0, ferdig = 0, hake = 0 }) => {
  const navn = kunde.navn.slice(0, Math.floor(navnTegn));
  const klar = navn.length === kunde.navn.length && signatur >= 1 && avkrysset;
  const erEndring = dokument === "endring";
  const eks = erEndring ? endringSum : tilbudSum;
  const tekster = erEndring
    ? {
        merke: `Krav om endring #${endring.nummer}`,
        tittel: "Sprenging av fjell i grøft",
        skjema: "Signer endringen",
        bekreft: `Jeg bekrefter at jeg har lest kravet om endring #${endring.nummer}, og at jeg på vegne av ${kunde.navn}`,
        fet: "godkjenner endringen og prisen",
        knapp: "Godkjenn og signer endringen",
        takk: `Krav om endring #${endring.nummer} er nå godkjent og signert av`,
      }
    : {
        merke: `Tilbud #${tilbud.nummer}`,
        tittel: tilbud.tittel,
        skjema: "Signer tilbudet",
        bekreft: `Jeg bekrefter at jeg har lest og forstått tilbud #${tilbud.nummer} – ${tilbud.tittel}, og at jeg på vegne av ${kunde.navn}`,
        fet: "aksepterer tilbudet og inngår en bindende avtale",
        knapp: "Godkjenn og signer tilbud",
        takk: `Tilbud #${tilbud.nummer} – ${tilbud.tittel} er nå godkjent og signert av`,
      };
  return (
    <div style={{ position: "absolute", inset: 0, background: g.bg, color: g.g900, fontSize: 14, lineHeight: 1.45 }}>
      <div style={{ transform: `translateY(${-rull}px)`, padding: "62px 16px 40px", display: "flex", flexDirection: "column", gap: 20, opacity: 1 - ferdig }}>
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: 2 }}>
          <FjordheimLogo hoyde={30} />
        </div>
        <Kort>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: g.g400, marginBottom: 4 }}>
                {tekster.merke}
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{tekster.tittel}</div>
              <div style={{ fontSize: 13, color: g.g500, marginTop: 2 }}>Til: {kunde.navn}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              {[
                { t: "Se tilbud", i: "fil" as const },
                { t: "Se kontrakt", i: "kontrakt" as const },
              ].map((b) => (
                <div
                  key={b.t}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    height: 30,
                    padding: "0 10px",
                    border: `1px solid ${g.g300}`,
                    borderRadius: 7,
                    fontSize: 12.5,
                    fontWeight: 500,
                  }}
                >
                  <Ikon navn={b.i} storrelse={14} />
                  {b.t}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, borderTop: `1px solid ${g.kant}`, paddingTop: 14 }}>
            <div>
              <div style={{ fontSize: 11.5, color: g.g400, fontWeight: 500 }}>Tilbudsdato</div>
              <div style={{ fontWeight: 500, color: g.g700 }}>{tilbud.dato}</div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: g.g400, fontWeight: 500 }}>Gyldig til</div>
              <div style={{ fontWeight: 500, color: g.g700 }}>{tilbud.gyldigTil}</div>
            </div>
          </div>
        </Kort>
        <Kort>
          <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: g.g400, marginBottom: 10 }}>Beløp</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: g.g500 }}>Totalt eks. mva</span>
            <span style={{ fontWeight: 600 }}>{nok(eks)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${g.kant}`, paddingTop: 8, marginTop: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: g.g500 }}>Totalt inkl. mva</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{nok(eks * (1 + MVA))}</span>
          </div>
        </Kort>
        <Kort stil={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{tekster.skjema}</div>
            <div style={{ fontSize: 13.5, color: g.g500, marginTop: 2 }}>
              Ved å signere {erEndring ? "godkjenner du endringen" : "aksepterer du tilbudet"} på vegne av {kunde.navn}.
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 7 }}>Fullt navn *</div>
            <div
              style={{
                height: 40,
                borderRadius: 7,
                border: `1px solid ${navnFokus ? "oklch(0.49 0.22 27 / 0.7)" : g.g300}`,
                boxShadow: navnFokus ? "0 0 0 3px oklch(0.49 0.22 27 / 0.15)" : undefined,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                fontSize: 15,
                color: navn ? g.g900 : g.g400,
              }}
            >
              {navn || "Skriv inn ditt fulle navn"}
              {navnFokus && navn.length < kunde.navn.length && (
                <span style={{ display: "inline-block", width: 1.5, height: 18, background: g.g900, marginLeft: 1 }} />
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 7 }}>Signatur *</div>
            <div
              style={{
                position: "relative",
                borderRadius: 8,
                border: `2px dashed ${g.g300}`,
                background: "#fff",
                height: SIGNATUR_BREDDE / 3 + 4,
                overflow: "hidden",
              }}
            >
              {signatur <= 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    fontSize: 13.5,
                    color: g.g400,
                  }}
                >
                  <Ikon navn="penn" storrelse={16} />
                  Tegn signaturen din her
                </div>
              )}
              <Signatur p={signatur} bredde={SIGNATUR_BREDDE} />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              border: `1px solid ${g.kant}`,
              background: g.bg,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                flexShrink: 0,
                marginTop: 1,
                borderRadius: 4,
                border: `1.5px solid ${avkrysset ? g.g900 : g.g400}`,
                background: avkrysset ? g.g900 : "#fff",
                display: "grid",
                placeItems: "center",
              }}
            >
              {avkrysset && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.4, color: g.g600 }}>
              {tekster.bekreft} <b style={{ color: g.g900 }}>{tekster.fet}</b> i samsvar med de oppgitte vilkårene.
            </div>
          </div>
          <div
            style={{
              height: 44,
              borderRadius: 8,
              background: g.primar,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 600,
              opacity: klar ? 1 : 0.5,
              transform: `scale(${1 - knappTrykk * 0.04})`,
              filter: knappTrykk ? `brightness(${1 - knappTrykk * 0.15})` : undefined,
            }}
          >
            {tekster.knapp}
          </div>
          <div style={{ borderTop: `1px solid ${g.kant}`, paddingTop: 14, textAlign: "center", fontSize: 13.5, color: g.g500 }}>
            {erEndring ? "Er dere ikke enige i kravet?" : "Skal dere ikke gå videre med tilbudet?"}
          </div>
        </Kort>
      </div>
      {ferdig > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: "0 36px",
            textAlign: "center",
            opacity: ferdig,
            transform: `translateY(${(1 - ferdig) * 16}px)`,
          }}
        >
          <Hake p={hake} storrelse={72} />
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" }}>Takk for signeringen!</div>
          <div style={{ fontSize: 15, color: g.g600, lineHeight: 1.5 }}>
            {tekster.takk} <b>{kunde.navn}</b>.
          </div>
          <div style={{ fontSize: 13, color: g.g400 }}>Du kan lukke dette vinduet.</div>
        </div>
      )}
    </div>
  );
};
