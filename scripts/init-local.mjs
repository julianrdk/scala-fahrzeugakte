import { execFileSync } from "node:child_process";
for (const file of [
  "auth/data-schema.sql",
  "auth/migrations/0003-fleet.sql",
  "auth/migrations/0004-ai.sql",
])
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DATA_DB",
      "--config",
      "wrangler.local.jsonc",
      "--local",
      "--file",
      file,
    ],
    {
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
