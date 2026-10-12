import { useVideoConfig } from "remotion";

/**
 * Samme scener brukes i liggende film, 4:5 til feeden og 9:16 til Reels.
 * Scenene spør hvilket format de står i og legger seg etter det.
 */
export type Format = "liggende" | "feed" | "staaende";

export const useFormat = () => {
  const { width, height } = useVideoConfig();
  const forhold = width / height;
  const type: Format = forhold > 1.2 ? "liggende" : forhold > 0.7 ? "feed" : "staaende";
  // Mål i filmen er tegnet for 1920 punkter i bredden (liggende) og 1080
  // (stående formater). «px» skalerer et mål derfra til faktisk bredde.
  const grunn = type === "liggende" ? 1920 : 1080;
  const px = (n: number) => (n * width) / grunn;
  return { type, width, height, px, liggende: type === "liggende" };
};
