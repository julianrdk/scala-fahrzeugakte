// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { FuelMap } from "../src/FuelMap";
const fixture = vi.hoisted(() => ({
  events: {} as Record<string, () => void>,
  mapEvents: {} as Record<string, () => void>,
  options: null as any,
  redraw: vi.fn(),
  center: { lat: 51, lng: 10 },
  setView: vi.fn(),
  groups: [] as any[],
}));
vi.mock("leaflet", () => ({
  map: () => {
    const view = {
      setView: fixture.setView,
      on: (name: string, fn: () => void) => {
        fixture.mapEvents[name] = fn;
      },
      getCenter: () => fixture.center,
      remove: vi.fn(),
      panTo: vi.fn(),
    };
    fixture.setView.mockImplementation(() => view);
    return view;
  },
  tileLayer: (_url: string, options: any) => {
    fixture.options = options;
    const layer = {
      on: (name: string, fn: () => void) => {
        fixture.events[name] = fn;
      },
      addTo: () => layer,
      redraw: fixture.redraw,
    };
    return layer;
  },
  layerGroup: () => {
    const group = { clearLayers: vi.fn(), addTo: () => group };
    fixture.groups.push(group);
    return group;
  },
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  fixture.events = {};
  fixture.mapEvents = {};
  fixture.setView.mockClear();
  fixture.redraw.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("Kartenkacheln und Wiederherstellung", () => {
  it("setzt den Herkunftsheader nur für Kartenbilder, toleriert einzelne Fehler und wiederholt nur die Karte", async () => {
    const moved = vi.fn();
    await act(async () =>
      root.render(
        <FuelMap
          center={{ lat: 51, lng: 10, label: "Deutschland" }}
          position={null}
          stations={[]}
          selected={null}
          onSelect={vi.fn()}
          onViewChange={moved}
        />,
      ),
    );
    expect(fixture.options.referrerPolicy).toBe(
      "strict-origin-when-cross-origin",
    );
    await act(async () => {
      fixture.events.loading();
      fixture.events.tileerror();
      fixture.events.tileload();
      fixture.events.load();
    });
    expect(host.textContent).not.toContain("Karte nicht verfügbar");
    await act(async () => {
      fixture.events.loading();
      fixture.events.tileerror();
      fixture.events.tileerror();
      fixture.events.load();
    });
    expect(host.textContent).toContain("Karte nicht verfügbar");
    const views = fixture.setView.mock.calls.length;
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(fixture.redraw).toHaveBeenCalledOnce();
    expect(fixture.setView).toHaveBeenCalledTimes(views);
    await act(async () => {
      fixture.events.loading();
      fixture.events.tileload();
      fixture.events.load();
    });
    expect(host.textContent).not.toContain("Karte nicht verfügbar");
    await act(async () => fixture.mapEvents.moveend());
    expect(moved).toHaveBeenLastCalledWith(
      { lat: 51, lng: 10, label: "Suchbereich" },
      true,
    );
  });
});
