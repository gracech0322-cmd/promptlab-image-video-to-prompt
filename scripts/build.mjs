import { resolve } from "node:path";
import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";

const root = process.cwd();

await viteBuild({
  configFile: resolve(root, "vite.config.ts")
});

await Promise.all([
  esbuild({
    entryPoints: [resolve(root, "src/background/background.ts")],
    outfile: resolve(root, "dist/assets/background.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome114"
  })
]);
