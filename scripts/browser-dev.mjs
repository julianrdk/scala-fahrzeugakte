// Local synthetic acceptance environment. Never used by production builds.
import { unstable_dev } from "wrangler";
import { createServer } from "vite";
import fs from "node:fs";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { csp } from "./security.mjs";
process.env.WRANGLER_SEND_METRICS = "false";
const origin = "https://car.jurodak.com",
  issuer = "https://synthetic.clerk.accounts.dev",
  pair = generateKeyPairSync("rsa", { modulusLength: 2048 }),
  fixture = randomUUID(),
  vars = {
    APP_ORIGIN: origin,
    BROWSER_TEST_ORIGIN: "http://127.0.0.1:5198",
    CLERK_ISSUER: issuer,
    CLERK_PUBLISHABLE_KEY:
      "pk_test_" +
      Buffer.from("synthetic.clerk.accounts.dev$").toString("base64"),
    CLERK_SECRET_KEY: "sk_test_SYNTHETIC",
    CLERK_JWT_KEY: pair.publicKey
      .export({ format: "pem", type: "spki" })
      .toString(),
    FIXTURE_TOKEN: fixture,
    AUTOMATION_ENABLED: "false",
  };
const runtime = await unstable_dev("tests/runtime-worker.ts", {
  local: true,
  config: "wrangler.local.jsonc",
  ip: "127.0.0.1",
  port: 0,
  persist: false,
  vars,
  logLevel: "error",
  experimental: {
    disableExperimentalWarning: true,
    disableDevRegistry: true,
    watch: false,
  },
});
function statements(sql) {
  const out = [];
  let current = "";
  for (const line of sql.split(/\r?\n/)) {
    if (line.trim().startsWith("--")) continue;
    current += line + "\n";
    if (
      line.trim().endsWith(";") &&
      (!/^\s*CREATE TRIGGER/i.test(current) ||
        /^\s*(?:END;|BEGIN .*END;)\s*$/.test(line))
    ) {
      out.push(current.trim());
      current = "";
    }
  }
  return out;
}
async function seed(input) {
  const r = await runtime.fetch("/__fixture", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Secret": fixture },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
for (const file of [
  "auth/data-schema.sql",
  "auth/migrations/0003-fleet.sql",
  "auth/migrations/0004-ai.sql",
])
  await seed({ schema: statements(fs.readFileSync(file, "utf8")) });
await seed({ expenses: 123 });
function token(owner) {
  const at = Math.floor(Date.now() / 1000),
    h = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT", kid: "synthetic" }),
    ).toString("base64url"),
    p = Buffer.from(
      JSON.stringify({
        iss: issuer,
        sub: owner,
        sid: "sess_synthetic",
        azp: origin,
        iat: at,
        nbf: at - 2,
        exp: at + 3600,
        v: 2,
        sts: "active",
      }),
    ).toString("base64url"),
    data = h + "." + p;
  return (
    data +
    "." +
    sign("RSA-SHA256", Buffer.from(data), pair.privateKey).toString("base64url")
  );
}
const server = await createServer({
  configFile: false,
  server: {
    host: "127.0.0.1",
    port: 5198,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://" + runtime.address + ":" + runtime.port,
        changeOrigin: false,
      },
    },
  },
  plugins: [
    {
      name: "synthetic-fixture",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader(
            "Content-Security-Policy",
            csp("synthetic.clerk.accounts.dev")
              .replace("frame-src ", "frame-src 'self' ")
              .replace("frame-ancestors 'none'", "frame-ancestors 'self'")
              .replace(
                "connect-src 'self'",
                "connect-src 'self' ws://127.0.0.1:5198",
              ),
          );
          res.setHeader("Referrer-Policy", "no-referrer");
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader(
            "Permissions-Policy",
            "camera=(), microphone=(self), geolocation=(self)",
          );
          if (req.url?.startsWith("/__fixture-token")) {
            const owner =
              new URL(req.url, "http://127.0.0.1").searchParams.get("owner") ===
              "user_b"
                ? "user_b"
                : "user_a";
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify({ owner, token: token(owner) }));
          } else next();
        });
      },
    },
  ],
});
await server.listen();
console.log(
  "Lokale Abnahme: http://127.0.0.1:5198/tests/browser/index.html (nur synthetische Daten)",
);
async function close() {
  await server.close();
  await runtime.stop();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
