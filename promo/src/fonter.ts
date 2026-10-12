import { loadFont } from "@remotion/google-fonts/Inter";

// Inter er fonten appen bruker, og den bærer også overskriftene i filmen.
// Lastes én gang her, så alle komponenter kan importere navnet.
const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin", "latin-ext"],
});

export const inter = fontFamily;
