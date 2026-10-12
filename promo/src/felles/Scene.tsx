import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { useBilde } from "./Tempo";
import { farge } from "../tema";

/**
 * Svart scene med et svakt lys bak det som står i midten. Lyset puster så vidt
 * — nok til at bildet aldri står helt stille, lite nok til at ingen legger
 * merke til det.
 */
export const Bakgrunn: React.FC<{
  /** Styrken på lyset bak, 0–1 */
  lys?: number;
  /** Rødt eller nøytralt lys */
  rodt?: boolean;
  x?: number;
  y?: number;
  children?: React.ReactNode;
}> = ({ lys = 0.6, rodt = false, x = 50, y = 50, children }) => {
  const frame = useBilde();
  const pust = 1 + Math.sin(frame / 38) * 0.04;
  const glod = rodt ? "rgba(227, 2, 19, 0.20)" : "rgba(120, 130, 150, 0.14)";
  return (
    <AbsoluteFill style={{ background: farge.svart, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse ${46 * pust}% ${52 * pust}% at ${x}% ${y}%, ${glod}, rgba(0,0,0,0) 70%)`,
          opacity: lys,
        }}
      />
      {children}
      {/* Vignett: kantene trekkes ned mot svart, så blikket holder seg i midten */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 85% 80% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

/** Perspektivet alt 3D i en scene står i. */
export const Rom: React.FC<{ avstand?: number; children: React.ReactNode; opprinnelse?: string }> = ({
  avstand = 2400,
  opprinnelse = "50% 50%",
  children,
}) => (
  <AbsoluteFill style={{ perspective: avstand, perspectiveOrigin: opprinnelse, transformStyle: "preserve-3d" }}>
    {children}
  </AbsoluteFill>
);

/**
 * Plasserer og vrir et element i rommet. Midtpunktet er (0, 0) midt i bildet,
 * så x og y er forskyvning derfra.
 */
export const Plassering: React.FC<{
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  skala?: number;
  opacity?: number;
  blur?: number;
  children: React.ReactNode;
  stil?: React.CSSProperties;
}> = ({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, skala = 1, opacity = 1, blur = 0, children, stil }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transformStyle: "preserve-3d", pointerEvents: "none" }}>
    <div
      style={{
        transform: `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${skala})`,
        transformStyle: "preserve-3d",
        opacity,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
        ...stil,
      }}
    >
      {children}
    </div>
  </AbsoluteFill>
);

/** Hjelper: verdien mellom to bilder, låst i endene. */
export const mellom = (
  frame: number,
  inn: readonly number[],
  ut: readonly number[],
  easing?: (t: number) => number,
) => interpolate(frame, inn, ut, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/**
 * Toner en hel scene inn og ut i kantene av sekvensen. Brukes der klippet
 * ikke skal være hardt.
 */
export const Tone: React.FC<{ inn?: number; ut?: number; varighet: number; children: React.ReactNode }> = ({
  inn = 0,
  ut = 0,
  varighet,
  children,
}) => {
  const frame = useBilde();
  const a = inn > 0 ? interpolate(frame, [0, inn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const b = ut > 0 ? interpolate(frame, [varighet - ut, varighet], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return <AbsoluteFill style={{ opacity: Math.min(a, b) }}>{children}</AbsoluteFill>;
};
