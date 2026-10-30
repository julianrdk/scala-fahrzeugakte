import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileCatalog,
  sheetRows,
  sha256,
  normalize,
} from "./kba-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const year = process.argv[2] ?? "2026";
if (!/^20\d{2}$/.test(year)) throw Error("Aufruf: pnpm catalog:import 2026");
const cache = path.join(root, ".cache/kba");
await fs.mkdir(cache, { recursive: true });
async function source(product) {
  const url =
    "https://www.kba.de/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/" +
    product +
    "/" +
    product.toLowerCase() +
    "_" +
    year +
    ".xlsx?__blob=publicationFile&v=2";
  const local = path.join(cache, product + "-" + year + ".xlsx");
  let bytes;
  try {
    if (process.argv.includes("--refresh")) throw Error("Neu abrufen");
    bytes = await fs.readFile(local);
  } catch {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60000),
      headers: { "User-Agent": "Mozilla/5.0 Fahrzeugakte KBA-Import" },
    });
    if (!response.ok)
      throw Error(
        "KBA-Download fehlgeschlagen: " + product + " HTTP " + response.status,
      );
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 32 * 1024 * 1024 || bytes[0] !== 80 || bytes[1] !== 75)
      throw Error("Keine gültige KBA-Arbeitsmappe: " + product);
    await fs.writeFile(local, bytes);
  }
  return { bytes, info: { name: product, url, sha256: sha256(bytes) } };
}
const [fz2, fz6] = await Promise.all([source("FZ2"), source("FZ6")]);
for (const source of [fz2, fz6])
  if (
    !sheetRows(source.bytes, "Impressum").some((r) =>
      Object.values(r).some((v) =>
        normalize(v).includes("datenlizenzdeutschlandnamensnennungversion20"),
      ),
    )
  )
    throw Error("Die erwartete offene KBA-Lizenz wurde nicht bestätigt.");
const asOf = year + "-01-01";
const fz2Rows = sheetRows(fz2.bytes, "FZ 2.2"),
  fz6Rows = sheetRows(fz6.bytes, "FZ 6.1");
for (const rows of [fz2Rows, fz6Rows])
  if (
    !rows
      .slice(0, 10)
      .some((r) =>
        Object.values(r).some((v) => v.includes("1. Januar " + year)),
      )
  )
    throw Error(
      "Der Datenstand der KBA-Arbeitsmappe passt nicht zum angeforderten Jahr.",
    );
const data = compileCatalog(fz2Rows, fz6Rows, asOf);
if (
  data.makes.length < 40 ||
  !data.makes.some(
    (m) => m.id === "skoda" && m.models.some((x) => x.label === "SCALA"),
  )
)
  throw Error("Katalog ist unvollständig; bestehende Ausgabe bleibt erhalten.");
const index = {
  version: 1,
  as_of: asOf,
  source: [fz2.info, fz6.info],
  licence: {
    label: "Datenlizenz Deutschland – Namensnennung – Version 2.0",
    url: "https://www.govdata.de/dl-de/by-2-0",
  },
  attribution:
    "Quelle: Kraftfahrt-Bundesamt, Flensburg. Für die Fahrzeugauswahl aufbereitet und gruppiert.",
  diagnostics: data.diagnostics,
  makes: [],
};
const output = path.join(root, "public/vehicle-catalog");
await fs.mkdir(output, { recursive: true });
let models = 0,
  variants = 0;
// Search aliases identify a manufacturer's group; they never assign a brand to a model.
const groups = {
  daimler: ["Mercedes-Benz", "smart", "Maybach"],
  bmw: ["MINI"],
  toyota: ["Lexus"],
  fca: ["Fiat", "Alfa Romeo", "Lancia", "Jeep", "Chrysler", "Dodge"],
  stellantis: ["Peugeot", "Citroën", "DS", "Opel", "Fiat"],
  generalmotors: ["Opel", "Chevrolet", "Cadillac"],
  saic: ["MG"],
  jaguarlandrover: ["Jaguar", "Land Rover"],
};
for (const make of data.makes) {
  const bytes = JSON.stringify({ version: 1, as_of: asOf, ...make }) + "\n";
  const hash = sha256(bytes),
    file = make.id + "." + hash.slice(0, 12) + ".json";
  await fs.writeFile(path.join(output, file), bytes);
  index.makes.push({
    id: make.id,
    label:
      make.label +
      (groups[make.id] ? " (" + groups[make.id].join(", ") + ")" : ""),
    aliases: [...make.aliases, ...(groups[make.id] ?? [])],
    file,
    sha256: hash,
  });
  models += make.models.length;
  variants += make.models.reduce((n, m) => n + m.variants.length, 0);
}
index.counts = { makes: data.makes.length, models, variants };
// Write the index last. Downloads/parsing failures never replace the existing catalogue.
await fs.writeFile(
  path.join(output, "index.json"),
  JSON.stringify(index) + "\n",
);
const keep = new Set(["index.json", ...index.makes.map((m) => m.file)]);
for (const file of await fs.readdir(output))
  if (!keep.has(file) && /^[a-z0-9]+\.[a-f0-9]{12}\.json$/.test(file))
    await fs.unlink(path.join(output, file));
console.log(JSON.stringify({ asOf, ...index.counts, ...data.diagnostics }));
