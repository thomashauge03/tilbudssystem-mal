import { Config } from "@remotion/cli/config";

// PNG mellom hvert bilde: JPEG gir synlige trappetrinn i de mørke
// fargeovergangene, og de er det mye av på svart bakgrunn.
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setEntryPoint("./src/index.ts");
// Maskinen har 16 tråder men lite ledig minne, og hvert Chrome-vindu tar sitt.
Config.setConcurrency(6);
Config.setChromiumOpenGlRenderer("angle");
