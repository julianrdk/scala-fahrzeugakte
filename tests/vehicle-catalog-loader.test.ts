import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let catalog: typeof import("../src/vehicle-catalog");
const entry = {
  id: "skoda",
  label: "Škoda",
  aliases: ["SKODA"],
  file: "skoda.123456789abc.json",
  sha256: "",
};
const index = { version: 1, as_of: "2026-01-01", makes: [entry] };
const make = { version: 1, as_of: "2026-01-01", id: "skoda", models: [] };
beforeEach(async () => {
  vi.resetModules();
  catalog = await import("../src/vehicle-catalog");
});
afterEach(() => vi.unstubAllGlobals());
describe("Öffentlicher statischer Fahrzeugkatalog", () => {
  it("holt nach einem Veröffentlichungswechsel ein neues Manifest und weist beschädigte JSON-Daten verständlich ab", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(index))
      .mockResolvedValueOnce(new Response("nicht gefunden", { status: 404 }))
      .mockResolvedValueOnce(Response.json(index))
      .mockResolvedValueOnce(
        Response.json({
          ...make,
          models: [{ id: "scala", label: "SCALA", variants: null }],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await catalog.loadCatalog(signal);
    await expect(catalog.loadMake(entry, index.as_of, signal)).rejects.toThrow(
      "Fahrzeugkatalog nicht verfügbar.",
    );
    await catalog.loadCatalog(signal);
    expect(fetch.mock.calls[2][0]).toBe("/vehicle-catalog/index.json");
    await expect(catalog.loadMake(entry, index.as_of, signal)).rejects.toThrow(
      "Fahrzeugkatalog nicht verfügbar.",
    );
  });
  it("lädt Index und nur die gewählte Marke ohne Cookies oder API und verwendet den Sitzungscache", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(index))
      .mockResolvedValueOnce(Response.json(make));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect(await catalog.loadCatalog(signal)).toEqual(index);
    expect(await catalog.loadMake(entry, index.as_of, signal)).toEqual(make);
    await catalog.loadCatalog(signal);
    await catalog.loadMake(entry, index.as_of, signal);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]).toEqual([
      "/vehicle-catalog/index.json",
      { signal, credentials: "omit", cache: "no-cache" },
    ]);
    expect(fetch.mock.calls[1][0]).toBe("/vehicle-catalog/" + entry.file);
  });
  it("erkennt HTML-Fallbacks und falsche Marken/Datenstände, ohne fehlgeschlagene Abrufe zu cachen", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<html/>", { headers: { "Content-Type": "text/html" } }),
      )
      .mockResolvedValueOnce(Response.json(index))
      .mockResolvedValueOnce(Response.json({ ...make, id: "fremd" }))
      .mockResolvedValueOnce(Response.json(make));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await expect(catalog.loadCatalog(signal)).rejects.toThrow(
      /nicht verfügbar/,
    );
    await catalog.loadCatalog(signal);
    await expect(catalog.loadMake(entry, index.as_of, signal)).rejects.toThrow(
      /nicht verfügbar/,
    );
    await catalog.loadMake(entry, index.as_of, signal);
    await expect(
      catalog.loadMake(
        { ...entry, file: "../api/privat" },
        index.as_of,
        signal,
      ),
    ).rejects.toThrow(/Katalogdatei/);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
