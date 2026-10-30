// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FuelView } from "../src/FuelView";
import type { FuelMap } from "../src/FuelMap";
import {
  FuelSearchError,
  type FuelResult,
  type FuelService,
} from "../shared/fuel";
const map = vi.hoisted(() => ({
  current: null as ComponentProps<typeof FuelMap> | null,
}));
vi.mock("../src/FuelMap", () => ({
  FuelMap: (props: ComponentProps<typeof FuelMap>) => {
    map.current = props;
    return <div aria-label="Karte der Tankstellen">{props.center.label}</div>;
  },
}));
let root: Root,
  host: HTMLDivElement,
  success: PositionCallback,
  failure: PositionErrorCallback;
let service: FuelService & {
  searchFuel: ReturnType<typeof vi.fn<FuelService["searchFuel"]>>;
  resolveFuelLocation: ReturnType<
    typeof vi.fn<FuelService["resolveFuelLocation"]>
  >;
};
const berlin = { lat: 52.52, lng: 13.4, label: "PLZ 10115" };
const result: FuelResult = {
  center: berlin,
  stations: [
    {
      id: "far",
      name: "Weiter",
      brand: "",
      street: "Straße",
      houseNumber: "1",
      postCode: "10115",
      place: "Berlin",
      lat: 52.53,
      lng: 13.4,
      distance: 9,
      isOpen: true,
      prices: { e5: 1.6, e10: 1.5, diesel: 1.4 },
    },
    {
      id: "near",
      name: "Näher",
      brand: "",
      street: "Weg",
      houseNumber: "2",
      postCode: "10115",
      place: "Berlin",
      lat: 52.52,
      lng: 13.4,
      distance: 1,
      isOpen: false,
      prices: { e5: 1.7, e10: 1.6, diesel: 1.5 },
    },
  ],
  fetchedAt: "2026-10-30T12:00:00Z",
  cached: true,
};
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  service = {
    fuelStatus: vi.fn(async () => ({ enabled: true })),
    resolveFuelLocation: vi.fn(async () => berlin),
    searchFuel: vi.fn(async () => result),
  };
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(
        (s: PositionCallback, e: PositionErrorCallback) => {
          success = s;
          failure = e;
        },
      ),
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function render() {
  await act(async () =>
    root.render(
      <FuelView service={service} externalUrl="https://example.invalid" />,
    ),
  );
}
async function click(label: string) {
  const el = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) =>
      b.getAttribute("aria-label") === label || b.textContent?.trim() === label,
  );
  if (!el) throw Error(label);
  await act(async () => el.click());
}
async function postal(value: string) {
  const el = host.querySelector<HTMLInputElement>('input[aria-label="PLZ"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function denied() {
  await act(async () =>
    failure({ code: 1, message: "denied" } as GeolocationPositionError),
  );
}
describe("Tankpreise ausschließlich nach Suchen", () => {
  it("zeigt die Karte vor Freigabe und fragt bei GPS, PLZ, Verschieben, Zoom und Filtern keine Preise ab", async () => {
    await render();
    expect(host.textContent).toContain("Deutschland");
    expect(service.searchFuel).not.toHaveBeenCalled();
    await act(async () =>
      success({
        coords: { latitude: 51.5, longitude: 7.4 },
      } as GeolocationPosition),
    );
    expect(map.current!.position).toMatchObject({ lat: 51.5, lng: 7.4 });
    expect(service.searchFuel).not.toHaveBeenCalled();
    await postal("10115");
    await click("Ort anzeigen");
    expect(map.current!.center).toEqual(berlin);
    await act(async () =>
      map.current!.onViewChange(
        { lat: 52.55, lng: 13.5, label: "Kartenmitte" },
        true,
      ),
    );
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "25";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });
    expect(service.searchFuel).not.toHaveBeenCalled();
    expect(select.querySelectorAll("option")).toHaveLength(3);
    await click("Suchen");
    expect(service.searchFuel).toHaveBeenCalledExactlyOnceWith(
      { lat: 52.55, lng: 13.5 },
      expect.any(AbortSignal),
    );
    expect(map.current!.position).toMatchObject({ lat: 51.5, lng: 7.4 });
  });
  it("positioniert mit Enter nur die Karte und löst eine noch nicht angewendete PLZ vor Suchen auf", async () => {
    await render();
    await denied();
    await postal("10115");
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(service.resolveFuelLocation).toHaveBeenCalledOnce();
    expect(service.searchFuel).not.toHaveBeenCalled();
    await postal("10117");
    await click("Suchen");
    expect(service.resolveFuelLocation).toHaveBeenLastCalledWith(
      "10117",
      expect.any(AbortSignal),
    );
    expect(service.searchFuel).toHaveBeenCalledWith(
      { lat: 52.52, lng: 13.4 },
      expect.any(AbortSignal),
    );
  });
  it("zeigt immer alle drei Kraftstoffe nach Entfernung und behält Cache-Angaben", async () => {
    await render();
    await denied();
    await click("Suchen");
    const names = [...host.querySelectorAll(".fuel-station-name strong")].map(
      (n) => n.textContent,
    );
    expect(names).toEqual(["Näher", "Weiter"]);
    for (const station of host.querySelectorAll(".fuel-station"))
      expect(station.textContent).toMatch(/Super E5.*Super E10.*Diesel/);
    expect(host.textContent).toContain("Cache");
    expect(host.textContent).not.toContain("Kraftstoffart");
  });
  it("verschiebt die Karte durch eine verspätete Preisantwort nicht und sperrt Doppelklicks", async () => {
    let finish!: (r: FuelResult) => void;
    service.searchFuel.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await denied();
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Suchen",
    )!;
    await act(async () => {
      button.click();
      button.click();
    });
    expect(service.searchFuel).toHaveBeenCalledOnce();
    await postal("10115");
    await click("Ort anzeigen");
    const target = map.current!.center;
    await act(async () => finish(result));
    expect(map.current!.center).toBe(target);
    expect(map.current!.center).toEqual(berlin);
  });
  it("übernimmt veraltete PLZ-Antworten nach einer Korrektur nicht", async () => {
    let finish!: (p: typeof berlin) => void;
    service.resolveFuelLocation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await denied();
    await postal("10115");
    await click("Ort anzeigen");
    const signal = service.resolveFuelLocation.mock.calls[0][1]!;
    await postal("50667");
    expect(signal.aborted).toBe(true);
    await act(async () => finish(berlin));
    expect(map.current!.center.label).toBe("Deutschland");
    expect(service.searchFuel).not.toHaveBeenCalled();
  });
  it("respektiert die Anbieterwartezeit und startet nach Ablauf nicht automatisch", async () => {
    vi.useFakeTimers();
    service.searchFuel.mockRejectedValueOnce(
      new FuelSearchError("Bitte warten", 2),
    );
    await render();
    await denied();
    await click("Suchen");
    expect(host.textContent).toContain("Suchen (2s)");
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(service.searchFuel).toHaveBeenCalledOnce();
    await click("Suchen");
    expect(service.searchFuel).toHaveBeenCalledTimes(2);
  });
  it("bricht ausstehende Preisabfragen beim Verlassen ab", async () => {
    service.searchFuel.mockImplementation(() => new Promise(() => {}));
    await render();
    await denied();
    await click("Suchen");
    const signal = service.searchFuel.mock.calls[0][1]!;
    await act(async () => root.render(<div />));
    expect(signal.aborted).toBe(true);
  });
});
