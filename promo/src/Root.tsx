import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "./tid";
import { Feed, Hovedfilm, Staaende } from "./versjoner/Hovedfilm";
import { FEED_PLAN, HOVEDFILM_PLAN, STAAENDE_PLAN } from "./versjoner/planer";

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Film">
      {/* Tegnet i 1920 × 1080 og rendret med --scale=2 til 4K */}
      <Composition id="Hovedfilm" component={Hovedfilm} durationInFrames={HOVEDFILM_PLAN.lengde} fps={FPS} width={1920} height={1080} />
      <Composition
        id="Messe"
        component={Hovedfilm}
        defaultProps={{ medLyd: false }}
        durationInFrames={HOVEDFILM_PLAN.lengde}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </Folder>
    <Folder name="Kortversjoner">
      <Composition id="Feed-16x9" component={Feed} durationInFrames={FEED_PLAN.lengde} fps={FPS} width={1920} height={1080} />
      <Composition id="Feed-4x5" component={Feed} durationInFrames={FEED_PLAN.lengde} fps={FPS} width={1080} height={1350} />
      <Composition id="Staaende-9x16" component={Staaende} durationInFrames={STAAENDE_PLAN.lengde} fps={FPS} width={1080} height={1920} />
    </Folder>
  </>
);
