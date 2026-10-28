import fs from "node:fs";
const config = JSON.parse(fs.readFileSync("wrangler.service.jsonc", "utf8"));
config.vars.CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;
config.vars.AUTOMATION_ENABLED =
  process.env.AUTOMATION_ENABLED === "true" ? "true" : "false";
if (!config.vars.CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_"))
  throw Error("Produktiver Clerk-Schlüssel fehlt.");
// Keep the generated file next to the root config so relative paths retain their meaning.
fs.writeFileSync("wrangler.deploy.json", JSON.stringify(config, null, 2));
