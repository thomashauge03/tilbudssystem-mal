import React from "react";
import { app } from "../tema";

/**
 * Små byggeklosser som går igjen på alle skjermene: ikoner (tegnet som
 * lucide-ikonene appen bruker), kort, knapper, merkelapper og felt.
 */

const IKONER = {
  dollar: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 18V6" />
    </>
  ),
  sjekk: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  trend: (
    <>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </>
  ),
  utklipp: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M10.4 12.6a2 2 0 0 1 3 3L8 21l-4 1 1-4Z" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5.5" />
      <path d="M4 13.5V6a2 2 0 0 1 2-2h2" />
    </>
  ),
  fil: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </>
  ),
  filNed: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M12 18v-6" />
      <path d="m9 15 3 3 3-3" />
    </>
  ),
  filSjekk: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  klokke: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  varsel: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  pilHoyre: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  pilVenstre: (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  pluss: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  overskrift: (
    <>
      <path d="M6 12h12" />
      <path d="M6 20V4" />
      <path d="M18 20V4" />
    </>
  ),
  grep: (
    <>
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </>
  ),
  soppel: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </>
  ),
  lagre: (
    <>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </>
  ),
  epost: (
    <>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  epostSjekk: (
    <>
      <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      <path d="m16 19 2 2 4-4" />
    </>
  ),
  send: (
    <>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </>
  ),
  penn: (
    <>
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
    </>
  ),
  laas: (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  sok: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  nedover: <path d="m6 9 6 6 6-6" />,
  kalender: (
    <>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </>
  ),
  lenke: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  kontrakt: (
    <>
      <path d="M20 19.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8.5L18 5.5" />
      <path d="M8 18h1" />
      <path d="M18.42 9.61a2.1 2.1 0 1 1 2.97 2.97L16.95 17 13 18l.99-3.95 4.43-4.44Z" />
    </>
  ),
  trofe: (
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </>
  ),
  pare: (
    <>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </>
  ),
} as const;

export type IkonNavn = keyof typeof IKONER;

export const Ikon: React.FC<{ navn: IkonNavn; storrelse?: number; farge?: string; strek?: number; stil?: React.CSSProperties }> = ({
  navn,
  storrelse = 16,
  farge = "currentColor",
  strek = 2,
  stil,
}) => (
  <svg
    width={storrelse}
    height={storrelse}
    viewBox="0 0 24 24"
    fill="none"
    stroke={farge}
    strokeWidth={strek}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, ...stil }}
  >
    {IKONER[navn]}
  </svg>
);

/** rounded-xl border bg-card shadow-sm */
export const Kort: React.FC<{ children: React.ReactNode; stil?: React.CSSProperties; padding?: number | string }> = ({
  children,
  stil,
  padding = 20,
}) => (
  <div
    style={{
      background: app.kort,
      border: `1px solid ${app.kant}`,
      borderRadius: 12,
      boxShadow: app.skygge,
      padding,
      ...stil,
    }}
  >
    {children}
  </div>
);

/** «TILBUDSLINJER» — små store bokstaver over en seksjon */
export const Seksjon: React.FC<{ children: React.ReactNode; stil?: React.CSSProperties }> = ({ children, stil }) => (
  <div
    style={{
      fontSize: 14,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: app.dempetTekst,
      ...stil,
    }}
  >
    {children}
  </div>
);

export const Knapp: React.FC<{
  children: React.ReactNode;
  ikon?: IkonNavn;
  variant?: "primar" | "kant" | "spokelse";
  liten?: boolean;
  trykket?: number;
  stil?: React.CSSProperties;
}> = ({ children, ikon, variant = "kant", liten = false, trykket = 0, stil }) => {
  const primar = variant === "primar";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: liten ? 32 : 36,
        padding: liten ? "0 12px" : "0 16px",
        borderRadius: 7,
        fontSize: 14,
        fontWeight: 500,
        whiteSpace: "nowrap",
        background: primar ? app.primar : variant === "kant" ? "#FFFFFF" : "transparent",
        color: primar ? "#FFFFFF" : app.tekst,
        border: variant === "kant" ? `1px solid ${app.input}` : "1px solid transparent",
        boxShadow: variant === "spokelse" ? "none" : "0 1px 2px rgba(0,0,0,0.05)",
        transform: `scale(${1 - trykket * 0.05})`,
        filter: trykket > 0 ? `brightness(${1 - trykket * 0.12})` : undefined,
        ...stil,
      }}
    >
      {ikon && <Ikon navn={ikon} storrelse={16} />}
      {children}
    </div>
  );
};

type MerkeTone = "gra" | "gul" | "gronn" | "bla" | "rod" | "slate";

const MERKE: Record<MerkeTone, { bg: string; tekst: string; kant: string }> = {
  gra: { bg: "#f3f4f6", tekst: "#374151", kant: "#d1d5db" },
  gul: { bg: "#fef9c3", tekst: "#854d0e", kant: "#fde047" },
  gronn: { bg: "#dcfce7", tekst: "#166534", kant: "#86efac" },
  bla: { bg: "#dbeafe", tekst: "#1e40af", kant: "#93c5fd" },
  rod: { bg: "#fee2e2", tekst: "#b91c1c", kant: "#fca5a5" },
  slate: { bg: "#f1f5f9", tekst: "#334155", kant: "#cbd5e1" },
};

/** Status-merkelappen: rounded-full border px-2 py-0.5 text-xs font-semibold */
export const Merke: React.FC<{ tone: MerkeTone; children: React.ReactNode; stil?: React.CSSProperties }> = ({ tone, children, stil }) => (
  <span
    style={{
      display: "inline-block",
      whiteSpace: "nowrap",
      borderRadius: 999,
      border: `1px solid ${MERKE[tone].kant}`,
      background: MERKE[tone].bg,
      color: MERKE[tone].tekst,
      padding: "2px 9px",
      fontSize: 12,
      fontWeight: 600,
      ...stil,
    }}
  >
    {children}
  </span>
);

export const Etikett: React.FC<{ children: React.ReactNode; stil?: React.CSSProperties }> = ({ children, stil }) => (
  <div style={{ fontSize: 14, fontWeight: 500, color: app.tekst, marginBottom: 7, ...stil }}>{children}</div>
);

/** Et utfylt felt, eventuelt med blinkende skrivemarkør */
export const Felt: React.FC<{
  verdi?: string;
  plassholder?: string;
  markor?: boolean;
  fokus?: boolean;
  hoyde?: number;
  stil?: React.CSSProperties;
  hoyrejustert?: boolean;
}> = ({ verdi, plassholder, markor, fokus, hoyde = 36, stil, hoyrejustert }) => (
  <div
    style={{
      height: hoyde,
      borderRadius: 7,
      border: `1px solid ${fokus ? "oklch(0.49 0.22 27 / 0.7)" : app.input}`,
      boxShadow: fokus ? "0 0 0 3px oklch(0.49 0.22 27 / 0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
      background: "#FFFFFF",
      display: "flex",
      alignItems: "center",
      justifyContent: hoyrejustert ? "flex-end" : "flex-start",
      padding: "0 12px",
      fontSize: 14,
      color: verdi ? app.tekst : app.dempetTekst,
      whiteSpace: "nowrap",
      overflow: "hidden",
      ...stil,
    }}
  >
    {verdi || plassholder}
    {markor && <span style={{ display: "inline-block", width: 1.5, height: "1.15em", background: app.tekst, marginLeft: 1 }} />}
  </div>
);

/** h-1.5 fremdriftsstolpe */
export const Stolpe: React.FC<{ pst: number; farge: string; hoyde?: number; stil?: React.CSSProperties }> = ({
  pst,
  farge,
  hoyde = 6,
  stil,
}) => (
  <div style={{ height: hoyde, width: "100%", borderRadius: 999, background: app.dempet, overflow: "hidden", ...stil }}>
    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, pst))}%`, borderRadius: 999, background: farge }} />
  </div>
);

/** Sideoverskrift: «Dashboard» + undertekst */
export const Sidetittel: React.FC<{ tittel: string; under?: string; hoyre?: React.ReactNode }> = ({ tittel, under, hoyre }) => (
  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
    <div>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.2 }}>{tittel}</div>
      {under && <div style={{ marginTop: 4, fontSize: 14, color: app.dempetTekst }}>{under}</div>}
    </div>
    {hoyre}
  </div>
);
