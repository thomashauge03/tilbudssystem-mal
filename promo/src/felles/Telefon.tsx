import React from "react";
import { inter } from "../fonter";

export const SKJERM_B = 393;
export const SKJERM_H = 852;
const KANT = 13;

/**
 * En nøytral mobiltelefon — ikke en bestemt modell. Skjermen er 393 × 852
 * punkter, og hele telefonen forstørres med CSS-zoom så innholdet tegnes
 * skarpt i sin endelige størrelse.
 */
export const Telefon: React.FC<{
  zoom?: number;
  klokke?: string;
  /** Mørk statuslinje (lys tekst) når innholdet øverst er mørkt */
  morkStatus?: boolean;
  skjermFarge?: string;
  children: React.ReactNode;
  /** Legges over skjerminnholdet (berøringspunkter, varsler) */
  over?: React.ReactNode;
}> = ({ zoom = 1, klokke = "19:42", morkStatus = false, skjermFarge = "#FFFFFF", children, over }) => {
  const tekst = morkStatus ? "#FFFFFF" : "#000000";
  return (
    <div style={{ zoom, position: "relative", width: SKJERM_B + 2 * KANT, height: SKJERM_H + 2 * KANT }}>
      {/* Knappene på sidene */}
      {[
        { side: "left", top: 170, h: 34 },
        { side: "left", top: 230, h: 64 },
        { side: "left", top: 308, h: 64 },
        { side: "right", top: 250, h: 100 },
      ].map((k, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            [k.side]: -3,
            top: k.top,
            width: 4,
            height: k.h,
            borderRadius: 2,
            background: "linear-gradient(90deg, #2b2b2e, #5a5a60, #2b2b2e)",
          }}
        />
      ))}
      {/* Rammen: tynn metallkant rundt en svart glasskant */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 66,
          padding: 2.5,
          background: "linear-gradient(150deg, #6b6b70 0%, #2a2a2d 22%, #1b1b1d 50%, #2f2f33 78%, #77777d 100%)",
          boxShadow: "0 50px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: 64, background: "#050505", padding: KANT - 2.5 }}>
          <div
            style={{
              width: SKJERM_B,
              height: SKJERM_H,
              borderRadius: 52,
              overflow: "hidden",
              position: "relative",
              background: skjermFarge,
              fontFamily: inter,
              fontFeatureSettings: "'cv11'",
            }}
          >
            {children}
            {/* Statuslinjen */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 34px 0 42px",
                color: tekst,
                fontSize: 16,
                fontWeight: 600,
                zIndex: 20,
                pointerEvents: "none",
              }}
            >
              <span style={{ letterSpacing: "-0.01em" }}>{klokke}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="18" height="12" viewBox="0 0 18 12" fill={tekst}>
                  <rect x="0" y="8" width="3" height="4" rx="1" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                  <rect x="10" y="3" width="3" height="9" rx="1" />
                  <rect x="15" y="0" width="3" height="12" rx="1" />
                </svg>
                <svg width="16" height="12" viewBox="0 0 16 12" fill={tekst}>
                  <path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.1-1.2C13.4 1.6 10.8.5 8 .5S2.6 1.6.7 3.5l1.1 1.2C3.4 3.1 5.6 2.2 8 2.2Z" />
                  <path d="M8 5.6c1.5 0 2.8.5 3.8 1.5l1.1-1.2C11.6 4.6 9.9 3.9 8 3.9s-3.6.7-4.9 2l1.1 1.2c1-1 2.3-1.5 3.8-1.5Z" />
                  <path d="M8 9.1c.6 0 1.1.2 1.5.6L8 11.3 6.5 9.7c.4-.4.9-.6 1.5-.6Z" />
                </svg>
                <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
                  <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={tekst} opacity="0.4" />
                  <rect x="2" y="2" width="17" height="9" rx="2" fill={tekst} />
                  <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill={tekst} opacity="0.45" />
                </svg>
              </span>
            </div>
            {/* Kamerahullet */}
            <div
              style={{
                position: "absolute",
                top: 14,
                left: "50%",
                width: 13,
                height: 13,
                marginLeft: -6.5,
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, #2a3140, #050505 60%)",
                zIndex: 21,
              }}
            />
            {over}
            {/* Hjemstreken */}
            <div
              style={{
                position: "absolute",
                bottom: 9,
                left: "50%",
                width: 136,
                height: 5,
                marginLeft: -68,
                borderRadius: 3,
                background: morkStatus ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.85)",
                zIndex: 22,
              }}
            />
          </div>
        </div>
      </div>
      {/* Glassrefleks over skjermen */}
      <div
        style={{
          position: "absolute",
          inset: KANT,
          borderRadius: 52,
          background: "linear-gradient(125deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 32%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
