import { unstable_dev } from "wrangler";
import fs from "node:fs";
import path from "node:path";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
process.env.WRANGLER_SEND_METRICS = "false";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 }),
  fixture = randomUUID(),
  issuer = "https://synthetic.clerk.accounts.dev";
const vars = {
  APP_ORIGIN: "https://car.jurodak.com",
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
  if (current.trim()) throw Error("Unvollständiges SQL im Test.");
  return out;
}
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
const results = [];
function token(owner = "user_a") {
  const at = Math.floor(Date.now() / 1000),
    h = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT", kid: "synthetic" }),
    ).toString("base64url"),
    p = Buffer.from(
      JSON.stringify({
        iss: issuer,
        sub: owner,
        sid: "sess_synthetic",
        azp: vars.APP_ORIGIN,
        iat: at,
        nbf: at - 2,
        exp: at + 600,
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
async function seed(input) {
  const r = await runtime.fetch("/__fixture", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Secret": fixture },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw Error("Runtime-Fixture fehlgeschlagen: " + (await r.text()));
  return r.json();
}
async function call(path, body, owner = "user_a") {
  const started = performance.now(),
    r = await runtime.fetch("/api/v3/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: vars.APP_ORIGIN,
        Authorization: "Bearer " + token(owner),
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const text = await r.text();
  if (!r.ok)
    throw Error("Runtime-Aufruf fehlgeschlagen " + r.status + ": " + text);
  return {
    value: JSON.parse(text),
    ms: performance.now() - started,
    bytes: Buffer.byteLength(text),
  };
}
try {
  for (const file of ["auth/data-schema.sql", "auth/migrations/0003-fleet.sql"])
    await seed({ schema: statements(fs.readFileSync(file, "utf8")) });
  for (const n of [100, 1000, 3000]) {
    const { vehicle } = await seed({ expenses: n, linked: true }),
      boot = await call("bootstrap?year=2026"),
      view = boot.value.view;
    if (view.dashboard.total.expenses !== n * 5000)
      throw Error("SQL-Kostensumme falsch.");
    if (n === 100) {
      const all = await call("vehicles/" + vehicle + "/export");
      if (
        all.value.Work.length !== 100 ||
        all.value.DocumentLinks.length !== 200
      )
        throw Error("Verknüpfte Testdaten fehlen.");
    }
    const edit = await call("vehicles/" + vehicle + "/actions/edit", {
      table: "Vehicles",
      id: vehicle,
      revision: view.state.Vehicles[0].revision,
      expected_revision: view.revision,
      patch: { plate: "TEST-" + n },
    });
    if (edit.bytes > 5000 || boot.bytes > 100000)
      throw Error("Antwort wächst mit vollständiger Historie.");
    const other = await call("bootstrap?year=2026", undefined, "user_b");
    if (other.value.view.dashboard.total.expenses !== 0)
      throw Error("Kontentrennung verletzt.");
    results.push({
      expenses: n,
      linked_work: n,
      documents: n,
      document_links: 2 * n,
      bootstrap_ms: Math.round(boot.ms),
      bootstrap_bytes: boot.bytes,
      edit_ms: Math.round(edit.ms),
      edit_bytes: edit.bytes,
    });
  }
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(
    "test-results/runtime.json",
    JSON.stringify(
      {
        runtime: "Cloudflare workerd lokal",
        note: "Lokale Antwortzeiten einschließlich D1. Keine Messung des produktiven CPU-Kontingents.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await runtime.stop();
}
