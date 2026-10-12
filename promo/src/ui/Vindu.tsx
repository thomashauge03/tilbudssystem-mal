import React from "react";
import { inter } from "../fonter";
import { app } from "../tema";
import { firma } from "../data";
import { FjordheimLogo } from "./FjordheimLogo";

const FANER = [
  "Dashboard",
  "Tilbud",
  "Ordre",
  "Endringsmeldinger",
  "Fremdriftsplan",
  "Status",
  "Prosjekt",
  "Anbud",
  "Kunder",
  "Potensielle kunder",
  "Adm.kost.",
] as const;

export type Fane = (typeof FANER)[number];

/** Toppmenyen i appen (hm-topnav i src/styles.css). */
export const Toppnav: React.FC<{ aktiv?: Fane }> = ({ aktiv }) => (
  <div
    style={{
      height: 60,
      background: "#FFFFFF",
      borderBottom: `1px solid ${app.kant}`,
      display: "flex",
      alignItems: "stretch",
      padding: "0 32px",
      flexShrink: 0,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", paddingRight: 24 }}>
      <FjordheimLogo hoyde={34} />
    </div>
    <div style={{ width: 1, background: app.kant, margin: "14px 0" }} />
    <div style={{ display: "flex", alignItems: "stretch", marginLeft: 8 }}>
      {FANER.map((f) => {
        const erAktiv = f === aktiv;
        return (
          <div
            key={f}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
              fontSize: 13,
              fontWeight: erAktiv ? 600 : 500,
              color: erAktiv ? app.tekst : app.dempetTekst,
              letterSpacing: "0.01em",
              position: "relative",
              whiteSpace: "nowrap",
            }}
          >
            {f}
            {erAktiv && (
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  right: 16,
                  bottom: -1,
                  height: 2,
                  background: app.primar,
                  borderRadius: "2px 2px 0 0",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 12px 5px 6px",
          borderRadius: 999,
          background: app.sekundar,
          fontSize: 12.5,
          fontWeight: 500,
          color: app.sekundarTekst,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: app.primar,
            color: "#FFFFFF",
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {firma.initialer}
        </div>
        erik
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={app.dempetTekst} strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  </div>
);

/**
 * Et appvindu slik det står i filmen: appen selv, med avrundede hjørner og en
 * tynn lyskant, uten nettleserramme rundt. Innholdet legges ut i appens egen
 * størrelse og forstørres med CSS-zoom — da tegnes teksten skarp i den nye
 * størrelsen, i stedet for at et ferdig bilde blåses opp.
 */
export const Vindu: React.FC<{
  /** Bredden på skjermen i filmen, i bildepunkter */
  bredde: number;
  hoyde: number;
  /** Hvor stor appen er i vinduet. 1 = appens egne punkter. */
  zoom?: number;
  /** Rulling inne i appen, i appens egne punkter */
  rullY?: number;
  rullX?: number;
  aktiv?: Fane;
  /** 0–1: et lysstreif som går over glasset */
  glans?: number;
  utenMeny?: boolean;
  children: React.ReactNode;
  /** Ting som skal ligge over innholdet uten å rulle med (markør, varsler) */
  over?: React.ReactNode;
}> = ({ bredde, hoyde, zoom = 1, rullY = 0, rullX = 0, aktiv, glans, utenMeny, children, over }) => {
  const radius = 18;
  return (
    <div
      style={{
        width: bredde,
        height: hoyde,
        borderRadius: radius,
        overflow: "hidden",
        position: "relative",
        background: app.bakgrunn,
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.10), 0 30px 80px rgba(0,0,0,0.55), 0 0 140px rgba(255,255,255,0.06)",
        fontFamily: inter,
        color: app.tekst,
        fontSize: 14,
        lineHeight: 1.45,
        fontFeatureSettings: "'cv11'",
      }}
    >
      <div
        style={{
          zoom,
          width: bredde / zoom,
          height: hoyde / zoom,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {!utenMeny && <Toppnav aktiv={aktiv} />}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div style={{ transform: `translate(${-rullX}px, ${-rullY}px)`, padding: "28px 32px" }}>{children}</div>
        </div>
        {over}
      </div>
      {glans !== undefined && glans > 0 && glans < 1 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(115deg, rgba(255,255,255,0) ${glans * 140 - 30}%, rgba(255,255,255,0.13) ${glans * 140 - 15}%, rgba(255,255,255,0) ${glans * 140}%)`,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
