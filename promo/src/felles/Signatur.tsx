import React from "react";
import { getLength, getPointAtLength } from "@remotion/paths";
import { interpolate } from "remotion";

type P = [number, number];

/** Glatt kurve gjennom punktene (Catmull-Rom), som en penn ville tegnet dem. */
const glatt = (pts: P[]) => {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
};

/**
 * «Kari Nordmann», skrevet fort, slik folk skriver under på en skjerm.
 * Koordinatene er i signaturfeltets egne mål i appen (600 × 200).
 */
const STREKER: { pts: P[]; vekt: number }[] = [
  { pts: [[60, 56], [57, 92], [53, 128], [50, 152]], vekt: 0.7 },
  {
    pts: [
      [106, 50], [88, 72], [66, 98], [70, 104], [88, 118], [104, 136], [118, 150], [127, 141], [132, 122],
      [125, 110], [113, 113], [112, 128], [124, 134], [138, 121], [142, 110], [144, 131], [151, 134], [160, 118],
      [166, 108], [170, 119], [172, 133], [179, 120], [189, 110], [197, 112], [198, 127], [205, 134], [216, 124],
    ],
    vekt: 2.2,
  },
  { pts: [[196, 92], [199, 89], [201, 92]], vekt: 0.25 },
  {
    pts: [
      [240, 150], [246, 110], [252, 68], [259, 62], [272, 108], [287, 150], [294, 145], [300, 100], [306, 62],
      [313, 70], [321, 100], [331, 118], [344, 112], [354, 103], [362, 112], [370, 122], [382, 108], [392, 103],
      [399, 116], [408, 124], [418, 108], [428, 103], [436, 118], [446, 123], [458, 106], [470, 103], [478, 118],
      [490, 121], [504, 111], [522, 105],
    ],
    vekt: 2.6,
  },
  { pts: [[150, 168], [262, 161], [382, 156], [500, 150], [566, 138]], vekt: 0.9 },
];

const STIER = STREKER.map((s) => {
  const d = glatt(s.pts);
  return { d, lengde: getLength(d), vekt: s.vekt };
});
const TOTAL_VEKT = STIER.reduce((s, x) => s + x.vekt, 0);

/**
 * Signaturen tegnet fram til `p` (0–1). Returnerer også hvor pennespissen er,
 * så en finger kan følge den.
 */
export const signaturTilstand = (p: number) => {
  let igjen = p * TOTAL_VEKT;
  const deler = STIER.map((s) => {
    const andel = Math.max(0, Math.min(1, igjen / s.vekt));
    igjen -= s.vekt;
    return andel;
  });
  let spiss: { x: number; y: number } | null = null;
  deler.forEach((andel, i) => {
    if (andel > 0 && andel < 1) spiss = getPointAtLength(STIER[i].d, STIER[i].lengde * andel);
  });
  return { deler, spiss: spiss as { x: number; y: number } | null };
};

export const Signatur: React.FC<{ p: number; bredde: number; farge?: string }> = ({ p, bredde, farge = "#111827" }) => {
  const { deler } = signaturTilstand(p);
  return (
    <svg width={bredde} height={bredde / 3} viewBox="0 0 600 200" style={{ display: "block" }}>
      {STIER.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill="none"
          stroke={farge}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={s.lengde}
          strokeDashoffset={s.lengde * (1 - deler[i])}
          opacity={deler[i] > 0 ? 1 : 0}
        />
      ))}
    </svg>
  );
};

/** Grønn hake i sirkel (CheckCircle2 i appen), som tegner seg selv. */
export const Hake: React.FC<{ p: number; storrelse: number; farge?: string }> = ({ p, storrelse, farge = "#22c55e" }) => {
  const sirkel = interpolate(p, [0, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hake = interpolate(p, [0.45, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const omkrets = 2 * Math.PI * 10;
  const hakeLengde = 8.6;
  return (
    <svg width={storrelse} height={storrelse} viewBox="0 0 24 24" fill="none" stroke={farge} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle
        cx="12"
        cy="12"
        r="10"
        strokeDasharray={omkrets}
        strokeDashoffset={omkrets * (1 - sirkel)}
        transform="rotate(-90 12 12)"
      />
      <path d="m9 12 2 2 4-4" strokeDasharray={hakeLengde} strokeDashoffset={hakeLengde * (1 - hake)} />
    </svg>
  );
};
