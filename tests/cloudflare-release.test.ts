import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "fahrzeugakte-release-"),
  ),
  configure = path.resolve("scripts/configure.mjs"),
  validate = path.resolve("scripts/validate-release.mjs"),
  prepare = path.resolve("scripts/prepare-deploy.mjs");
afterAll(() => {
  if (
    path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(temporary).startsWith("fahrzeugakte-release-")
  )
    fs.rmSync(temporary, { recursive: true });
});
function build(key: string) {
  fs.mkdirSync(path.join(temporary, "public"), { recursive: true });
  fs.writeFileSync(
    path.join(temporary, "public/config.json"),
    JSON.stringify({
      origin: "https://car.jurodak.com",
      clientId: "GOOGLE_EINTRAGEN",
      deploymentId: "GOOGLE_EINTRAGEN",
    }),
  );
  const env = {
    ...process.env,
    APP_BACKEND: "cloudflare",
    PAGES_DOMAIN: "car.jurodak.com",
    API_ORIGIN: "https://auth.jurodak.com",
    CLERK_PUBLISHABLE_KEY: key,
    GOOGLE_CLIENT_ID: "",
    GOOGLE_DEPLOYMENT_ID: "",
    AUTH_ORIGIN: "",
  };
  execFileSync(process.execPath, [configure, "--ci"], {
    cwd: temporary,
    env,
    stdio: "pipe",
  });
  return JSON.parse(
    fs.readFileSync(path.join(temporary, "public/config.json"), "utf8"),
  );
}
describe("Veröffentlichung mit eigenen Konten", () => {
  it("verweigert produktive Datenbindungen in der getrennten Testumgebung", () => {
    const production = JSON.parse(
        fs.readFileSync("wrangler.service.jsonc", "utf8"),
      ),
      config = JSON.parse(
        fs.readFileSync("wrangler.staging.service.jsonc", "utf8"),
      ),
      key =
        "pk_test_" +
        Buffer.from("synthetic.clerk.accounts.dev$").toString("base64");
    config.vars.CLERK_PUBLISHABLE_KEY = key;
    config.vars.CLERK_ISSUER = "https://synthetic.clerk.accounts.dev";
    config.d1_databases[0].database_id = "11111111-1111-4111-8111-111111111111";
    fs.writeFileSync(
      path.join(temporary, "wrangler.service.jsonc"),
      JSON.stringify(production),
    );
    fs.copyFileSync(
      "wrangler.staging.pages.jsonc",
      path.join(temporary, "wrangler.staging.pages.jsonc"),
    );
    fs.mkdirSync(path.join(temporary, "public"), { recursive: true });
    fs.writeFileSync(
      path.join(temporary, "public/config.json"),
      JSON.stringify({
        origin: config.vars.APP_ORIGIN,
        clerkPublishableKey: key,
        apiOrigin: "/api",
      }),
    );
    const script = path.resolve("scripts/validate-staging.mjs"),
      run = () =>
        execFileSync(process.execPath, [script], {
          cwd: temporary,
          stdio: "pipe",
        });
    fs.writeFileSync(
      path.join(temporary, "wrangler.staging.service.jsonc"),
      JSON.stringify(config),
    );
    expect(run).not.toThrow();
    config.d1_databases[0].database_id = production.d1_databases[0].database_id;
    fs.writeFileSync(
      path.join(temporary, "wrangler.staging.service.jsonc"),
      JSON.stringify(config),
    );
    expect(run).toThrow();
  });
  it("bereitet den privaten Worker mit dem bereits geprüften Artefakt vor", () => {
    const source = fs.readFileSync("wrangler.service.jsonc", "utf8");
    fs.writeFileSync(path.join(temporary, "wrangler.service.jsonc"), source);
    const key =
      "pk_live_" + Buffer.from("clerk.synthetic.invalid$").toString("base64");
    execFileSync(process.execPath, [prepare], {
      cwd: temporary,
      env: {
        ...process.env,
        CLERK_PUBLISHABLE_KEY: key,
        AUTOMATION_ENABLED: "false",
      },
      stdio: "pipe",
    });
    const out = JSON.parse(
      fs.readFileSync(path.join(temporary, "wrangler.deploy.json"), "utf8"),
    );
    expect(out).toMatchObject({
      main: "auth/dist/service.js",
      no_bundle: true,
      workers_dev: false,
      preview_urls: false,
    });
    expect(out.vars.CLERK_PUBLISHABLE_KEY).toBe(key);
    expect(out.vars).not.toHaveProperty("CLERK_SECRET_KEY");
  });
  it("erzeugt und prüft Cloudflare-Konfiguration ohne Google-Werte oder Secrets", () => {
    const key =
        "pk_live_" + Buffer.from("clerk.synthetic.invalid$").toString("base64"),
      config = build(key);
    expect(config).toEqual({
      backend: "cloudflare",
      origin: "https://car.jurodak.com",
      apiOrigin: "/api",
      clerkPublishableKey: key,
    });
    expect(() =>
      execFileSync(process.execPath, [validate], {
        cwd: temporary,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
  it("verweigert Development-Schlüssel und Platzhalter für die Veröffentlichung", () => {
    for (const key of [
      "pk_live_EINTRAGEN",
      "pk_test_" +
        Buffer.from("synthetic.clerk.accounts.dev$").toString("base64"),
    ]) {
      build(key);
      expect(() =>
        execFileSync(process.execPath, [validate], {
          cwd: temporary,
          stdio: "pipe",
        }),
      ).toThrow();
    }
  });
});
