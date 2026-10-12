import React, { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";

const TempoKontekst = createContext(1);

/**
 * Kortversjonene bruker de samme scenene som hovedfilmen, bare fortere. En
 * scene skrevet for 216 bilder kan spilles på 144 med tempo 1,5: alt inni —
 * tekst, pekere, tellere — går like mye fortere, så ingenting kommer ut av
 * takt med hverandre.
 */
export const Tempo: React.FC<{ tempo: number; children: React.ReactNode }> = ({ tempo, children }) => (
  <TempoKontekst.Provider value={tempo}>{children}</TempoKontekst.Provider>
);

/** Bildet i scenen, justert for tempoet. Brukes i stedet for useCurrentFrame. */
export const useBilde = () => useCurrentFrame() * useContext(TempoKontekst);
