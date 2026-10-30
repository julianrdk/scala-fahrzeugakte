import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fuelBody,
  FuelError,
  fuelStatus,
  searchFuel,
  resolveFuelLocation,
  type FuelEnv,
} from "../auth/src/fuel";
import { fuelPrice, matchingStations } from "../shared/fuel";

let sql: DatabaseSync, env: FuelEnv, calls: { url: string; init: any }[];
const fixture = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Testtankstelle <img onerror=alert(1)>",
  brand: "Beispiel",
  street: "Teststraße",
  houseNumber: "1",
  postCode: "10115",
  place: "Testort",
  lat: 52.521,
  lng: 13.401,
  dist: 1.2,
  isOpen: true,
  e5: 1.789,
  e10: 1.729,
  diesel: 1.619,
};
function statement(query: string, values: any[] = []): any {
  return {
    bind(...args: any[]) {
      return statement(query, args);
    },
    async first() {
      return sql.prepare(query).get(...values) ?? null;
    },
    async run() {
      return sql.prepare(query).run(...values);
    },
  };
}
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  sql.exec(fs.readFileSync("auth/migrations/0002-fuel.sql", "utf8"));
  calls = [];
  env = {
    DB: { prepare: statement },
    APP_ORIGIN: "https://car.jurodak.com",
    TANKERKOENIG_API_KEY: "11111111-1111-4111-8111-111111111111",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith("https://nominatim.openstreetmap.org/"))
        return Response.json([{ lat: "52.52", lon: "13.4" }]);
      return Response.json({ ok: true, stations: [fixture] });
    }),
  );
});
afterEach(() => {
  sql.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const position = { lat: 52.52012, lng: 13.40023 };

describe("Tankpreise: Einrichtung, Daten und Anbietergrenzen", () => {
  it("löst eine PLZ ohne Preisanfrage oder Tankerkönig-Schlüssel auf und nutzt den Ortscache", async () => {
    env.TANKERKOENIG_API_KEY = "";
    expect(await resolveFuelLocation(env, { postalCode: "10115" })).toEqual({
      lat: 52.52,
      lng: 13.4,
      label: "PLZ 10115",
    });
    await resolveFuelLocation(env, { postalCode: "10115" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("nominatim.openstreetmap.org");
    expect(sql.prepare("SELECT cache_key FROM fuel_cache").all()).toEqual([
      { cache_key: "postal:10115" },
    ]);
    await expect(resolveFuelLocation(env, position)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      resolveFuelLocation(env, { postalCode: "10115", owner: "other" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(1);
  });
  it("verwendet ohne persönlichen Schlüssel und mit Demo-Key keine angeblichen Livepreise", async () => {
    for (const key of ["", "00000000-0000-0000-0000-000000000002"]) {
      env.TANKERKOENIG_API_KEY = key;
      expect(await fuelStatus(env)).toEqual({ enabled: false, reason: "key" });
      await expect(searchFuel(env, position)).rejects.toMatchObject({
        code: "FUEL_KEY_SETUP",
      });
    }
    expect(calls).toHaveLength(0);
  });
  it("erkennt eine fehlende Migration und lässt die bestehenden Konten beim Nachrüsten unverändert", async () => {
    sql.exec("DROP TABLE fuel_cache; DROP TABLE fuel_limits;");
    sql.exec("CREATE TABLE existing_records(id TEXT PRIMARY KEY,payload TEXT)");
    sql
      .prepare("INSERT INTO existing_records VALUES(?,?)")
      .run("synthetic-account", "preserved");
    expect(await fuelStatus(env)).toEqual({
      enabled: false,
      reason: "database",
    });
    sql.exec(fs.readFileSync("auth/migrations/0002-fuel.sql", "utf8"));
    sql.exec(fs.readFileSync("auth/migrations/0002-fuel.sql", "utf8"));
    expect(await fuelStatus(env)).toEqual({ enabled: true });
    expect(
      sql.prepare("SELECT COUNT(*) AS n FROM existing_records").get(),
    ).toMatchObject({ n: 1 });
  });
  it.each([
    {},
    null,
    { postalCode: "1234" },
    { postalCode: "ABCDE" },
    { lat: NaN, lng: 13 },
    { lat: 38, lng: 13 },
    { lat: 52, lng: 13, url: "https://evil.invalid" },
    { postalCode: "10115", apikey: "OTHER" },
  ])(
    "weist ungültige oder zusätzliche Suchfelder vor dem Netzaufruf ab: %j",
    async (input) => {
      await expect(searchFuel(env, input)).rejects.toMatchObject({
        status: 400,
      });
      expect(calls).toHaveLength(0);
    },
  );
  it("fragt alle Kraftstoffe in maximal 25 km mit grob gerundetem Standort ab und gibt den Schlüssel nicht weiter", async () => {
    const result = await searchFuel(env, position),
      target = new URL(calls[0].url);
    expect(target.origin).toBe("https://creativecommons.tankerkoenig.de");
    expect(target.searchParams.get("lat")).toBe("52.52");
    expect(target.searchParams.get("lng")).toBe("13.4");
    expect(target.searchParams.get("rad")).toBe("25");
    expect(target.searchParams.get("type")).toBe("all");
    expect(calls[0].init.redirect).toBe("manual");
    expect(calls[0].init.headers.Authorization).toBeUndefined();
    expect(result.stations[0].prices).toEqual({
      e5: 1.789,
      e10: 1.729,
      diesel: 1.619,
    });
    expect(JSON.stringify(result)).not.toContain(env.TANKERKOENIG_API_KEY);
    expect(sql.prepare("SELECT cache_key FROM fuel_cache").get()).toMatchObject(
      { cache_key: expect.stringMatching(/^stations:[a-f0-9]{64}$/) },
    );
  });
  it("verwendet regionale Ergebnisse drei Minuten wieder und blockiert parallele neue Regionen global", async () => {
    const first = await searchFuel(env, position),
      second = await searchFuel(env, { lat: 52.52013, lng: 13.40024 });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(calls).toHaveLength(1);
    await expect(
      searchFuel(env, { lat: 52.53, lng: 13.41 }),
    ).rejects.toMatchObject({
      status: 429,
      code: "FUEL_RATE_LIMIT",
      retryAfter: expect.any(Number),
    });
    expect(calls).toHaveLength(1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 62000);
    expect((await searchFuel(env, { lat: 52.53, lng: 13.41 })).cached).toBe(
      false,
    );
    expect(calls).toHaveLength(2);
  });
  it("lässt bei gleichzeitig startenden Suchen verschiedener Regionen nur einen Anbieteraufruf zu", async () => {
    const results = await Promise.allSettled([
      searchFuel(env, position),
      searchFuel(env, { lat: 52.53, lng: 13.41 }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
  it("cached explizite PLZ-Suchen und sendet einen eigenen User-Agent ohne Google-Zugriffsdaten", async () => {
    const result = await searchFuel(env, { postalCode: "10115" });
    expect(result.center.label).toBe("PLZ 10115");
    expect(calls).toHaveLength(2);
    const geocoder = new URL(calls[0].url);
    expect(geocoder.searchParams.get("postalcode")).toBe("10115");
    expect(geocoder.searchParams.get("countrycodes")).toBe("de");
    expect(calls[0].init.headers["User-Agent"]).toContain("Fahrzeugakte");
    await searchFuel(env, { postalCode: "10115" });
    expect(calls).toHaveLength(2);
  });
  it("sichert die maximale Geocoder-Abfragerate der ganzen App", async () => {
    await searchFuel(env, { postalCode: "10115" });
    await expect(
      searchFuel(env, { postalCode: "10117" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(calls).toHaveLength(2);
  });
  it("interpretiert fehlende oder falsche Preise nicht als kostenfreien Kraftstoff", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        ok: true,
        stations: [
          { ...fixture, postCode: 1234, e5: false, e10: "1.729", diesel: 0 },
          { ...fixture, id: "bad", lat: Infinity },
        ],
      }),
    );
    const result = await searchFuel(env, position);
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0].postCode).toBe("01234");
    expect(result.stations[0].prices).toEqual({
      e5: null,
      e10: null,
      diesel: null,
    });
    expect(fuelPrice(result.stations[0].prices.e5)).toBe("–");
  });
  it("folgt Anbieterweiterleitungen nicht und zeigt keine Antwortinhalte oder Schlüssel im Fehler", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("SYNTHETIC_PRIVATE_BODY", {
          status: 302,
          headers: {
            Location: "https://evil.invalid/SYNTHETIC_PRIVATE_LOCATION",
          },
        }),
    );
    let error: any;
    try {
      await searchFuel(env, position);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FuelError);
    expect(error.status).toBe(502);
    expect(error.message).not.toMatch(/SYNTHETIC|evil|11111111/);
    expect(
      sql.prepare("SELECT COUNT(*) AS n FROM fuel_cache").get(),
    ).toMatchObject({ n: 0 });
  });
  it("begrenzt die Anfrage auch ohne Content-Length und verwirft falschen Content-Type", async () => {
    await expect(
      fuelBody(
        new Request("https://auth.example.invalid/fuel/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "x".repeat(1025),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      fuelBody(
        new Request("https://auth.example.invalid/fuel/search", {
          method: "POST",
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("filtert und sortiert dieselben Preise je Kraftstoff und Radius ohne neue Netzabfrage", async () => {
    const result = await searchFuel(env, position),
      all = [
        result.stations[0],
        {
          ...result.stations[0],
          id: "second",
          distance: 8,
          prices: { e5: 1.5, e10: 1.5, diesel: null },
        },
        { ...result.stations[0], id: "closed", isOpen: false },
      ];
    expect(matchingStations(all, "e10", 10, true).map((x) => x.id)).toEqual([
      "second",
      fixture.id,
    ]);
    expect(matchingStations(all, "e10", 5, true)).toHaveLength(1);
    expect(matchingStations(all, "diesel", 10, false)).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(fuelPrice(1.729)).toBe("1,729 €");
  });
});
