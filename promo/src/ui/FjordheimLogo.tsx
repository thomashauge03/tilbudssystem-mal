import React from "react";

/**
 * Logoen til det oppdiktede firmaet i filmen. Den står der kundens egen logo
 * står i appen — i toppen, på PDF-ene og på signeringssiden — og viser at
 * appen bærer firmaets navn, ikke vårt.
 */
export const FjordheimMerke: React.FC<{ storrelse: number }> = ({ storrelse }) => (
  <svg width={storrelse} height={storrelse} viewBox="0 0 40 40">
    <rect x="0" y="0" width="40" height="40" rx="9" fill="#0F2A44" />
    <path d="M5 29 L15 12.5 L21 21.5 L25.5 15.5 L35 29 Z" fill="#FFFFFF" />
    <path d="M15 12.5 L17.6 16.8 L15.9 16 L14.2 17.4 L12.6 16.5 Z" fill="#C9D6E3" />
    <path d="M5 33.2 Q10.8 30.4 16.6 33.2 T28.2 33.2 T35 32.4" stroke="#F2B705" strokeWidth="2.6" fill="none" strokeLinecap="round" />
  </svg>
);

export const FjordheimLogo: React.FC<{ hoyde: number; mork?: boolean }> = ({ hoyde, mork = false }) => (
  <div style={{ display: "flex", alignItems: "center", gap: hoyde * 0.28 }}>
    <FjordheimMerke storrelse={hoyde} />
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1, fontFamily: "inherit" }}>
      <span
        style={{
          fontSize: hoyde * 0.46,
          fontWeight: 800,
          letterSpacing: "0.02em",
          color: mork ? "#FFFFFF" : "#0F2A44",
        }}
      >
        FJORDHEIM
      </span>
      <span
        style={{
          fontSize: hoyde * 0.25,
          fontWeight: 600,
          letterSpacing: "0.3em",
          color: mork ? "#C9D6E3" : "#5B6B7F",
          marginTop: hoyde * 0.07,
        }}
      >
        MASKIN AS
      </span>
    </div>
  </div>
);
