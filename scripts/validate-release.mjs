import fs from "node:fs";
const c = JSON.parse(fs.readFileSync("public/config.json", "utf8"));
if (
  Object.keys(c).some(
    (k) =>
      !["backend", "origin", "apiOrigin", "clerkPublishableKey"].includes(k),
  )
)
  throw Error("Veraltete oder unbekannte Konfiguration.");
const key = c.clerkPublishableKey ?? "",
  host = Buffer.from(key.slice(8), "base64").toString();
if (
  c.backend !== "cloudflare" ||
  c.apiOrigin !== "/api" ||
  !/^https:\/\/[a-z0-9.-]+$/.test(c.origin) ||
  !/^pk_live_[A-Za-z0-9+/=_-]+$/.test(key) ||
  !/^([a-z0-9-]+\.)+[a-z]{2,63}\$$/.test(host)
)
  throw Error(
    "Produktive Domain und produktiver Clerk-Schlüssel erforderlich.",
  );
console.log("Release-Konfiguration geprüft.");
