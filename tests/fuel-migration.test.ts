import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "fahrzeugakte-fuel-transfer-"),
  ),
  script = path.resolve("scripts/prepare-fuel-cache.mjs");
afterAll(() => {
  if (
    path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) &&
    path.basename(directory).startsWith("fahrzeugakte-fuel-transfer-")
  )
    fs.rmSync(directory, { recursive: true });
});
describe("Übernahme öffentlicher Tankstellen-Caches", () => {
  it("erhält öffentliche Nutzdaten und setzt globale Aufrufgrenzen niemals zurück", () => {
    const input = path.join(directory, "cache.json"),
      output = path.join(directory, "cache.sql"),
      deadline = Date.now() + 3600000,
      key = "public'); DROP TABLE fuel_cache; --",
      payload = JSON.stringify({ name: "Öl's Tankstelle" });
    fs.writeFileSync(
      input,
      JSON.stringify([
        {
          results: [
            { kind: "cache", identifier: key, payload, deadline },
            { kind: "limit", identifier: "tankerkoenig", deadline },
          ],
        },
      ]),
    );
    execFileSync(process.execPath, [script, input, output], { stdio: "pipe" });
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(
        "CREATE TABLE fuel_cache(cache_key TEXT PRIMARY KEY,payload TEXT,expires_at INTEGER);CREATE TABLE fuel_limits(service TEXT PRIMARY KEY,next_at INTEGER)",
      );
      db.prepare("INSERT INTO fuel_limits VALUES(?,?)").run(
        "tankerkoenig",
        deadline + 1000,
      );
      db.exec(fs.readFileSync(output, "utf8"));
      expect(
        db.prepare("SELECT payload FROM fuel_cache WHERE cache_key=?").get(key),
      ).toMatchObject({ payload });
      expect(db.prepare("SELECT next_at FROM fuel_limits").get()).toMatchObject(
        { next_at: deadline + 1000 },
      );
      expect(() =>
        execFileSync(process.execPath, [script, input, output], {
          stdio: "pipe",
        }),
      ).toThrow();
    } finally {
      db.close();
    }
  });
  it("verweigert Anmeldedaten und unbekannte Quelltabellen", () => {
    const input = path.join(directory, "credentials.json"),
      output = path.join(directory, "refused.sql");
    fs.writeFileSync(
      input,
      JSON.stringify([
        {
          kind: "credentials",
          identifier: "owner",
          payload: "private",
          deadline: 1,
        },
      ]),
    );
    expect(() =>
      execFileSync(process.execPath, [script, input, output], {
        stdio: "pipe",
      }),
    ).toThrow();
    expect(fs.existsSync(output)).toBe(false);
  });
});
