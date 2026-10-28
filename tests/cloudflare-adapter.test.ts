import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyState } from "../shared/logic";
import { SignInRequired } from "../src/adapter";
import { CloudflareAdapter } from "../src/CloudflareAdapter";
vi.mock("../src/thumbnail", () => ({
  clearThumbnailCache: vi.fn(async () => {}),
  cachedThumbnail: vi.fn(async (_owner, _hash, load, valid) => {
    const b = await load();
    if (!valid()) throw Error("beendet");
    return b;
  }),
  makeThumbnail: vi.fn(),
}));
const config = {
  origin: "https://car.jurodak.com",
  apiOrigin: "/api",
  clerkPublishableKey: "pk_test_SYNTHETIC",
  backend: "cloudflare" as const,
};
function snapshot() {
  const state = emptyState();
  state.Vehicles[0].manufacturer = "Test";
  state.Vehicles[0].model = "Auto";
  return {
    state,
    status: { account_email: "a@example.invalid" },
    revision: 1,
    settingsRevision: 1,
    pages: [],
  };
}
function boot() {
  const view = snapshot();
  return {
    vehicles: [
      {
        id: "vehicle-1",
        vehicle: view.state.Vehicles[0],
        revision: 1,
        generation: "one",
      },
      {
        id: "vehicle-2",
        vehicle: { ...view.state.Vehicles[0], id: "vehicle-2" },
        revision: 1,
        generation: "two",
      },
    ],
    settings: view.state.Settings[0],
    settingsRevision: 1,
    status: view.status,
    selectedVehicle: "vehicle-1",
    view,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("Fahrzeugadapter, kleine Antworten und private Sitzungen", () => {
  it("wechselt von einem oft bearbeiteten zu einem neuen Fahrzeug mit eigener Revision", async () => {
    const b = boot();
    b.view.revision = 80;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/bootstrap")) return Response.json(b);
        const view = snapshot();
        view.state.Vehicles[0].id = "vehicle-2";
        return Response.json(view);
      }),
    );
    const a = new CloudflareAdapter(config, "user_a", async () => "SYNTHETIC");
    await a.bootstrap();
    await a.selectVehicle("vehicle-2");
    expect(a.snapshot().revision).toBe(1);
    expect(a.snapshot().state.Vehicles[0].id).toBe("vehicle-2");
  });
  it("verwirft verspätete Ansichten auch innerhalb desselben Fahrzeugs", async () => {
    let finish!: (v: any) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/bootstrap")) return Response.json(boot());
        if (String(url).includes(encodeURIComponent("/historie")))
          return {
            ok: true,
            status: 200,
            json: () =>
              new Promise((resolve) => {
                finish = resolve;
              }),
          };
        const v = snapshot();
        v.state.Vehicles[0].model = "Neue Ansicht";
        return Response.json(v);
      }),
    );
    const a = new CloudflareAdapter(config, "user_a", async () => "SYNTHETIC");
    await a.bootstrap();
    const old = a.loadView("/historie");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await a.loadView("/fahrzeug");
    finish(snapshot());
    await expect(old).rejects.toThrow(/Ansicht/);
    expect(a.snapshot().state.Vehicles[0].model).toBe("Neue Ansicht");
  });
  it("lädt Konto und ausgewähltes Fahrzeug gemeinsam ohne Originale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(boot())),
    );
    const a = new CloudflareAdapter(config, "user_a", async () => "SYNTHETIC");
    await a.bootstrap();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "/v3/bootstrap?",
    );
    expect(
      new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get(
        "Authorization",
      ),
    ).toBe("Bearer SYNTHETIC");
  });
  it("verwirft eine nach Abmeldung fertig gelesene Antwort", async () => {
    let finish!: (v: any) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      })),
    );
    const a = new CloudflareAdapter(config, "user_a", async () => "SYNTHETIC"),
      pending = a.bootstrap();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    a.dispose();
    finish(boot());
    await expect(pending).rejects.toBeInstanceOf(SignInRequired);
    expect(a.accountEmail).toBe("");
  });
  it("beendet die Sitzung bei fehlendem Token ohne Netzaufruf", async () => {
    const failed = vi.fn();
    vi.stubGlobal("fetch", vi.fn());
    const a = new CloudflareAdapter(config, "user_a", async () => null, failed);
    await expect(a.bootstrap()).rejects.toBeInstanceOf(SignInRequired);
    expect(failed).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("wendet bestätigte Änderungen ohne vollständiges Nachladen an", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        Response.json(
          String(url).includes("/bootstrap")
            ? boot()
            : {
                result: { ok: true },
                revision: 2,
                settingsRevision: 1,
                changes: { Odometer: [{ id: "odo", km: 42 }] },
              },
        ),
      ),
    );
    const a = new CloudflareAdapter(config, "user_a", async () => "SYNTHETIC");
    await a.bootstrap();
    await a.call("odometer", { id: "odo", date: "2026-10-28", km: 42 });
    expect((await a.call("read")).state.Odometer[0].km).toBe(42);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("behält Kennung und ursprüngliche Revision nach verlorener Antwort", async () => {
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/bootstrap")) return Response.json(boot());
        if (fail) throw Error("network");
        return Response.json({
          result: { ok: true },
          revision: 2,
          settingsRevision: 1,
          changes: {},
        });
      }),
    );
    const a = new CloudflareAdapter(config, "user_a", async () => "SYNTHETIC");
    await a.bootstrap();
    await expect(a.call("smoke", {})).rejects.toThrow(
      /Keine Serverbestätigung/,
    );
    fail = false;
    await a.call("smoke", {});
    const calls = vi.mocked(fetch).mock.calls.slice(1);
    expect(new Headers(calls[0][1]?.headers).get("Idempotency-Key")).toBe(
      new Headers(calls[1][1]?.headers).get("Idempotency-Key"),
    );
    expect(calls[0][1]?.body).toBe(calls[1][1]?.body);
  });
  it("fragt für Pinnwand und Galerie nur Vorschauen an", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).includes("/bootstrap")
          ? Response.json(boot())
          : new Response("image", {
              headers: { "Content-Type": "image/webp" },
            }),
      ),
    );
    const a = new CloudflareAdapter(config, "user_a", async () => "SYNTHETIC");
    await a.bootstrap();
    await a.thumbnail({ id: "photo", sha256: "abc" } as any);
    expect(String(vi.mocked(fetch).mock.calls.at(-1)![0])).toContain(
      "/vehicles/vehicle-1/documents/photo/thumbnail",
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some((c) => String(c[0]).includes("/original")),
    ).toBe(false);
  });
  it("verwirft eine verspätete Fahrzeugansicht nach dem Fahrzeugwechsel", async () => {
    let finish!: (v: any) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/bootstrap")) return Response.json(boot());
        if (String(url).includes("vehicle-1"))
          return {
            ok: true,
            status: 200,
            json: () =>
              new Promise((resolve) => {
                finish = resolve;
              }),
          };
        const out = snapshot();
        out.state.Vehicles[0].id = "vehicle-2";
        return Response.json(out);
      }),
    );
    const a = new CloudflareAdapter(config, "user_a", async () => "SYNTHETIC");
    await a.bootstrap();
    const old = a.loadView("/historie");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await a.selectVehicle("vehicle-2");
    finish(snapshot());
    await expect(old).rejects.toThrow(/gewechselt/);
    expect((await a.call("read")).state.Vehicles[0].id).toBe("vehicle-2");
  });
  it("beendet abgelaufene Anmeldungen", async () => {
    const failed = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "expired" }, { status: 401 })),
    );
    const a = new CloudflareAdapter(
      config,
      "user_a",
      async () => "SYNTHETIC",
      failed,
    );
    await expect(a.bootstrap()).rejects.toBeInstanceOf(SignInRequired);
    expect(failed).toHaveBeenCalledOnce();
  });
});
