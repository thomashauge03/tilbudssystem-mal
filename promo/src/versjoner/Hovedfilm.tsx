import React from "react";
import { Klipp } from "./Klipp";
import { FEED_PLAN, HOVEDFILM_PLAN, STAAENDE_PLAN } from "./planer";

/** Hovedfilmen, 16:9, med musikk og lydeffekter. «medLyd: false» er messeversjonen. */
export const Hovedfilm: React.FC<{ medLyd?: boolean }> = ({ medLyd = true }) => <Klipp plan={HOVEDFILM_PLAN} medLyd={medLyd} />;

/** Kortversjonen til feeden. Samme komposisjon i 16:9 og 4:5 — scenene legger seg etter formatet. */
export const Feed: React.FC = () => <Klipp plan={FEED_PLAN} />;

/** Stående kortversjon til Reels, TikTok og Shorts. */
export const Staaende: React.FC = () => <Klipp plan={STAAENDE_PLAN} />;
