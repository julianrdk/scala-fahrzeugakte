import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = process.cwd(),
  out = path.join(root, "public", "ocr");
const tesseract = path.dirname(require.resolve("tesseract.js/package.json"));
const localRequire = createRequire(path.join(tesseract, "package.json")),
  core = path.dirname(localRequire.resolve("tesseract.js-core/package.json"));
fs.mkdirSync(path.join(out, "core"), { recursive: true });
fs.mkdirSync(path.join(out, "lang"), { recursive: true });
fs.copyFileSync(
  path.join(tesseract, "dist", "worker.min.js"),
  path.join(out, "worker.min.js"),
);
for (const name of fs.readdirSync(core))
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name))
    fs.copyFileSync(path.join(core, name), path.join(out, "core", name));
for (const language of ["deu", "eng"]) {
  const source = path.dirname(
    require.resolve("@tesseract.js-data/" + language + "/package.json"),
  );
  fs.copyFileSync(
    path.join(source, "4.0.0_best_int", language + ".traineddata.gz"),
    path.join(out, "lang", language + ".traineddata.gz"),
  );
}
const pdf = path.dirname(require.resolve("pdfjs-dist/package.json"));
for (const folder of ["standard_fonts", "cmaps", "wasm"])
  fs.cpSync(path.join(pdf, folder), path.join(out, "pdf", folder), {
    recursive: true,
  });
for (const [name, folder] of [
  ["tesseract", tesseract],
  ["tesseract-core", core],
  ["pdfjs", pdf],
])
  for (const file of fs
    .readdirSync(folder)
    .filter((n) => /^(?:license|notice)(?:\..*)?$/i.test(n)))
    fs.copyFileSync(path.join(folder, file), path.join(out, name + "-" + file));
fs.writeFileSync(
  path.join(out, "NOTICE.txt"),
  "Tesseract.js, Tesseract.js-core, language data and PDF.js: Apache-2.0. Sources: https://github.com/naptha/tesseract.js, https://github.com/naptha/tessdata and https://github.com/mozilla/pdf.js. Original license texts and bundled font licenses are included alongside these assets.\n",
);
console.log(
  "OCR-Worker, WebAssembly und deutsche/englische Sprachdaten lokal vorbereitet.",
);
