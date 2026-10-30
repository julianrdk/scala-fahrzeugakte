import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
function publicFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(directory, e.name);
    return e.isDirectory() ? publicFiles(file) : [file];
  });
}
const published = publicFiles("dist");
if (
  published.length > 20000 ||
  published.some((f) => fs.statSync(f).size > 25 * 1024 * 1024)
)
  throw Error(
    "Die Dateigrenzen von Cloudflare Pages Free werden überschritten.",
  );
const catalog = JSON.parse(
  fs.readFileSync("dist/vehicle-catalog/index.json", "utf8"),
);
for (const entry of catalog.makes) {
  if (!/^[a-z0-9]+\.[a-f0-9]{12}\.json$/.test(entry.file))
    throw Error("Ungültiger Katalogpfad.");
  const bytes = fs.readFileSync("dist/vehicle-catalog/" + entry.file);
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
    throw Error("Prüfsumme der Katalogdatei stimmt nicht: " + entry.file);
}
for (const file of [
  "worker.min.js",
  "core/tesseract-core-lstm.wasm.js",
  "core/tesseract-core-simd-lstm.wasm.js",
  "lang/deu.traineddata.gz",
  "lang/eng.traineddata.gz",
  "pdfjs-LICENSE",
  "tesseract-LICENSE.md",
])
  if (
    !fs.existsSync("dist/ocr/" + file) ||
    !fs.statSync("dist/ocr/" + file).size
  )
    throw Error("OCR-Datei fehlt: " + file);
const files = fs.readdirSync("dist/assets").filter((f) => /\.m?js$/.test(f));
const forbidden = [
  "accounts.google.com/gsi",
  "script.googleapis.com",
  "GOOGLE_CLIENT_SECRET",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_KEY",
  "RESEND_API_KEY",
  "TANKERKOENIG_API_KEY",
  "AI_CREDENTIALS_KEY",
  "new Function(",
  'require("ajv/',
];
for (const file of files) {
  const code = fs.readFileSync("dist/assets/" + file, "utf8");
  for (const text of forbidden)
    if (
      code.includes(text) &&
      !(text === "new Function(" && file.startsWith("pdf.worker"))
    )
      throw Error("Unzulässiger Inhalt im öffentlichen Bundle: " + text);
}
const routes = JSON.parse(fs.readFileSync("dist/_routes.json", "utf8"));
const headers = fs.readFileSync("dist/_headers", "utf8");
if (
  !headers.includes("Content-Security-Policy:") ||
  headers.includes("'unsafe-eval'") ||
  !headers.includes("object-src 'none'")
)
  throw Error("Browser-Sicherheitsrichtlinie fehlt oder ist zu weit geöffnet.");
const service = fs.readFileSync("auth/dist/service.js", "utf8");
for (const value of ["/__fixture", "FIXTURE_TOKEN", "BROWSER_TEST_ORIGIN"])
  if (service.includes(value)) throw Error("Testzugang im Produktions-Worker.");
if (JSON.stringify(routes.include) !== '["/api/*"]')
  throw Error("Nur API-Anfragen dürfen Functions ausführen.");
console.log("Öffentliche Artefakte, OCR und API-Routing geprüft.");
