import React from "react";
import { interpolate } from "remotion";
import { useBilde } from "./Tempo";
import { ease } from "../tema";

type Punkt = { f: number; x: number; y: number };

/**
 * Posisjonen langs en rute av punkter (bilde, x, y), med myk bevegelse mellom
 * hvert punkt — slik en hånd flytter en mus: fort i midten, rolig inn mot målet.
 */
export const langsRute = (frame: number, rute: Punkt[]) => {
  if (frame <= rute[0].f) return { x: rute[0].x, y: rute[0].y };
  for (let i = 0; i < rute.length - 1; i++) {
    const a = rute[i];
    const b = rute[i + 1];
    if (frame <= b.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { easing: ease.myk });
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  const s = rute[rute.length - 1];
  return { x: s.x, y: s.y };
};

/** Musepeker med klikk: den trykkes litt inn, og en ring brer seg ut. */
export const Musepeker: React.FC<{
  rute: Punkt[];
  klikk?: number[];
  synligFra?: number;
  synligTil?: number;
  storrelse?: number;
}> = ({ rute, klikk = [], synligFra = -Infinity, synligTil = Infinity, storrelse = 1 }) => {
  const frame = useBilde();
  const { x, y } = langsRute(frame, rute);
  const inn = interpolate(frame, [synligFra, synligFra + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ut = interpolate(frame, [synligTil - 8, synligTil], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  let trykk = 1;
  for (const k of klikk) {
    const d = frame - k;
    if (d >= -2 && d <= 6) trykk = Math.min(trykk, interpolate(d, [-2, 1, 6], [1, 0.82, 1]));
  }
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50 }}>
      {klikk.map((k) => {
        const d = frame - k;
        if (d < 0 || d > 18) return null;
        const p = interpolate(d, [0, 18], [0, 1], { easing: ease.inn });
        const pos = langsRute(k, rute);
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: pos.x - 26 * storrelse,
              top: pos.y - 26 * storrelse,
              width: 52 * storrelse,
              height: 52 * storrelse,
              borderRadius: "50%",
              border: `${2 * storrelse}px solid rgba(20,20,18,0.35)`,
              transform: `scale(${0.3 + p * 0.9})`,
              opacity: (1 - p) * 0.9,
            }}
          />
        );
      })}
      <svg
        width={26 * storrelse}
        height={34 * storrelse}
        viewBox="0 0 26 34"
        style={{
          position: "absolute",
          left: x - 3 * storrelse,
          top: y - 2 * storrelse,
          opacity: Math.min(inn, ut),
          transform: `scale(${trykk})`,
          transformOrigin: "3px 2px",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.3))",
        }}
      >
        <path d="M3 2 L3 26 L9.2 20.4 L13.4 30.2 L17.6 28.4 L13.5 18.9 L21.8 18.9 Z" fill="#111" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** Slik en finger vises på skjermen: grå skive med lys ring, synlig også på hvitt. */
export const FINGER = {
  bakgrunn: "rgba(60,60,67,0.30)",
  kant: "2px solid rgba(255,255,255,0.95)",
  skygge: "0 0 0 1px rgba(0,0,0,0.18), 0 6px 16px rgba(0,0,0,0.28)",
} as const;

/** Et fingertrykk på telefonen: en myk sirkel som trykkes inn og slippes. */
export const Fingertrykk: React.FC<{ x: number; y: number; ved: number; holdt?: number }> = ({ x, y, ved, holdt = 6 }) => {
  const frame = useBilde();
  const d = frame - ved;
  if (d < -6 || d > holdt + 16) return null;
  const inn = interpolate(d, [-6, 0], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.inn });
  const ut = interpolate(d, [holdt, holdt + 16], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const trykk = interpolate(d, [-6, 0, holdt, holdt + 10], [1.25, 0.92, 0.92, 1.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: x - 24,
        top: y - 24,
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: FINGER.bakgrunn,
        border: FINGER.kant,
        boxShadow: FINGER.skygge,
        transform: `scale(${trykk})`,
        opacity: Math.min(inn, ut),
        zIndex: 40,
        pointerEvents: "none",
      }}
    />
  );
};
