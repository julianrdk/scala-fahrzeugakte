import fs from "node:fs";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    "Aufruf: node scripts/prepare-fuel-cache.mjs EXPORT.json ZIEL.sql",
  );
if (fs.statSync(input).size > 50000000)
  throw Error("Cacheexport ist unerwartet groß.");
const exported = JSON.parse(fs.readFileSync(input, "utf8"));
const rows =
  Array.isArray(exported) && exported.every((r) => Array.isArray(r.results))
    ? exported.flatMap((r) => r.results)
    : exported;
if (!Array.isArray(rows) || rows.length > 100000)
  throw Error("Ungültiger Cacheexport.");
const quote = (s) => "'" + s.replaceAll("'", "''") + "'",
  sql = [
    "-- Nur öffentliche Tankstellencaches und gemeinsame Aufrufgrenzen. Keine Konten oder OAuth-Daten.",
  ];
for (const row of rows) {
  if (
    !["cache", "limit"].includes(row.kind) ||
    typeof row.identifier !== "string" ||
    !row.identifier ||
    row.identifier.length > 512 ||
    !Number.isSafeInteger(row.deadline)
  )
    throw Error("Unbekannte Cachezeile.");
  if (row.kind === "cache") {
    if (typeof row.payload !== "string" || row.payload.length > 1000000)
      throw Error("Ungültiger Cacheinhalt.");
    JSON.parse(row.payload);
    if (row.deadline > Date.now())
      sql.push(
        "INSERT INTO fuel_cache(cache_key,payload,expires_at) VALUES(" +
          [quote(row.identifier), quote(row.payload), row.deadline].join(",") +
          ") ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at WHERE excluded.expires_at>fuel_cache.expires_at;",
      );
  } else
    sql.push(
      "INSERT INTO fuel_limits(service,next_at) VALUES(" +
        quote(row.identifier) +
        "," +
        row.deadline +
        ") ON CONFLICT(service) DO UPDATE SET next_at=MAX(fuel_limits.next_at,excluded.next_at);",
    );
}
fs.writeFileSync(output, sql.join("\n") + "\n", { flag: "wx" });
console.log(
  "Cacheübernahme vorbereitet: " +
    (sql.length - 1) +
    " Anweisungen. Noch keine Datenbank verändert.",
);
