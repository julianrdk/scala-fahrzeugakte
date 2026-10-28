import fs from "node:fs";
const config = JSON.parse(
    fs.readFileSync("wrangler.staging.service.jsonc", "utf8"),
  ),
  pages = JSON.parse(fs.readFileSync("wrangler.staging.pages.jsonc", "utf8")),
  production = JSON.parse(fs.readFileSync("wrangler.service.jsonc", "utf8")),
  publicConfig = JSON.parse(fs.readFileSync("public/config.json", "utf8"));
const key = config.vars.CLERK_PUBLISHABLE_KEY ?? "",
  host = Buffer.from(key.slice(8), "base64").toString().replace(/\$$/, "");
if (
  config.name === production.name ||
  pages.name === "scala-fahrzeugakte" ||
  config.workers_dev !== false ||
  config.preview_urls !== false ||
  pages.services[0]?.service !== config.name ||
  config.vars.APP_ORIGIN !== "https://" + pages.name + ".pages.dev" ||
  config.vars.CLERK_ISSUER !== "https://" + host ||
  !/^pk_test_[A-Za-z0-9+/=_-]+$/.test(key) ||
  !/^[a-z0-9.-]+\.accounts\.dev$/.test(host) ||
  publicConfig.clerkPublishableKey !== key ||
  publicConfig.origin !== config.vars.APP_ORIGIN ||
  publicConfig.apiOrigin !== "/api"
)
  throw Error(
    "Getrennte Testdomain und übereinstimmende Clerk-Development-Konfiguration erforderlich.",
  );
for (const db of config.d1_databases)
  if (
    !/^[a-f0-9-]{36}$/.test(db.database_id) ||
    production.d1_databases.some(
      (p) =>
        p.database_id === db.database_id ||
        p.database_name === db.database_name,
    )
  )
    throw Error("Testdatenbank muss getrennt und eingerichtet sein.");
for (const bucket of config.r2_buckets)
  if (production.r2_buckets.some((p) => p.bucket_name === bucket.bucket_name))
    throw Error("Produktiver Bucket ist für Tests gesperrt.");
console.log(
  "Getrennte Staging-Konfiguration geprüft. Noch nichts veröffentlicht.",
);
