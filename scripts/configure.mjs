import fs from "node:fs";
import { csp } from "./security.mjs";
const ci = process.argv.includes("--ci"),
  domain = process.env.PAGES_DOMAIN || "car.jurodak.com",
  key = process.env.CLERK_PUBLISHABLE_KEY || "CLERK_TEST_KEY_EINTRAGEN";
if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(domain))
  throw Error("Ungültige Domain.");
const c = {
  backend: "cloudflare",
  origin: ci ? "https://" + domain : "http://127.0.0.1:5173",
  apiOrigin: "/api",
  clerkPublishableKey: key,
};
fs.writeFileSync("public/config.json", JSON.stringify(c, null, 2) + "\n");
const host = /^pk_(live|test)_/.test(key)
  ? Buffer.from(key.slice(8), "base64").toString().replace(/\$$/, "")
  : "clerk.jurodak.com";
fs.writeFileSync(
  "public/_headers",
  "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(self), geolocation=(self)\n  Content-Security-Policy: " +
    csp(host) +
    "\n/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/ocr/*\n  Cache-Control: public, max-age=86400\n/config.json\n  Cache-Control: no-store\n",
);
console.log(
  "Öffentliche Konfiguration vorbereitet; keine Secrets und kein Produktivzugriff.",
);
