import { build } from "esbuild";
import fs from "node:fs";
fs.mkdirSync("auth/dist", { recursive: true });
fs.mkdirSync("dist", { recursive: true });
await build({
  entryPoints: ["auth/src/worker.ts"],
  bundle: true,
  outfile: "auth/dist/service.js",
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: false,
});
fs.writeFileSync(
  "dist/_routes.json",
  JSON.stringify({ version: 1, include: ["/api/*"], exclude: [] }) + "\n",
);
