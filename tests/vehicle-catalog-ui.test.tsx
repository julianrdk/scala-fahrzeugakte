// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VehicleSetup } from "../src/VehicleSetup";
import { VehicleForm } from "../src/views/Vehicle";
import { VehicleCatalogFields } from "../src/VehicleCatalogFields";
import { loadCatalog, loadMake } from "../src/vehicle-catalog";
import { emptyState } from "../shared/logic";
import type { CatalogIndex, CatalogMake } from "../shared/vehicle-catalog";
vi.mock("../src/vehicle-catalog", () => ({
  loadCatalog: vi.fn(),
  loadMake: vi.fn(),
}));

const reference = { manufacturer: "SKODA (CZ)", tsn: "ATZ", hsn: "8004" };
const skoda: CatalogMake = {
  version: 1,
  as_of: "2026-01-01",
  id: "skoda",
  label: "Škoda",
  aliases: ["SKODA (CZ)"],
  models: [
    {
      id: "scala",
      label: "SCALA",
      variants: [
        {
          id: "0123456789abcdef",
          fuel_type: "Benzin",
          power_kw: 70,
          references: [reference],
        },
      ],
    },
  ],
};
const vw: CatalogMake = {
  version: 1,
  as_of: "2026-01-01",
  id: "volkswagen",
  label: "Volkswagen",
  aliases: ["VW"],
  models: [
    {
      id: "golf",
      label: "Golf",
      variants: [
        {
          id: "1111111111111111",
          fuel_type: "Elektro",
          power_kw: 100,
          references: [],
        },
      ],
    },
  ],
};
const index: CatalogIndex = {
  version: 1,
  as_of: "2026-01-01",
  source: [],
  licence: {
    label: "DL-DE/BY 2.0",
    url: "https://www.govdata.de/dl-de/by-2-0",
  },
  attribution: "KBA",
  counts: { makes: 2, models: 2, variants: 2 },
  makes: [skoda, vw].map((m) => ({
    id: m.id,
    label: m.label,
    aliases: m.aliases,
    file: m.id + ".123456789abc.json",
    sha256: "",
  })),
};
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(loadCatalog).mockResolvedValue(index);
  vi.mocked(loadMake).mockImplementation(async (entry) =>
    entry.id === "skoda" ? skoda : vw,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.resetAllMocks();
});
const input = (name: string) =>
  host.querySelector<HTMLInputElement>('input[name="' + name + '"]')!;
const combo = (label: string) => {
  const node = [...host.querySelectorAll<HTMLLabelElement>("label[for]")].find(
    (l) => l.textContent === label,
  )!;
  return host.querySelector<HTMLInputElement>('[id="' + node.htmlFor + '"]')!;
};
async function type(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(node: HTMLInputElement, key: string) {
  await act(async () =>
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    ),
  );
}
async function choose(label: string, search: string) {
  await act(async () => combo(label).focus());
  await type(combo(label), search);
  await key(combo(label), "Enter");
}
async function click(label: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === label,
  );
  if (!node) throw Error("Button fehlt: " + label);
  await act(async () => node.click());
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
describe("Fahrzeugauswahl in bestehenden Formularen", () => {
  it("findet Škoda ohne Akzent, bedient die Kaskade per Tastatur und speichert erst nach Übernahme und Absenden", async () => {
    const save = vi.fn();
    await act(async () =>
      root.render(<VehicleSetup busy={false} error="" onSave={save} />),
    );
    await type(input("year"), "2020");
    await type(input("engine"), "Manuell bestätigter Code");
    await choose("Marke", "skoda");
    expect(loadMake).toHaveBeenCalledWith(
      expect.objectContaining({ id: "skoda" }),
      "2026-01-01",
      expect.any(AbortSignal),
    );
    await choose("Modell", "scala");
    await choose("Motorisierung", "70");
    expect(save).not.toHaveBeenCalled();
    expect(input("manufacturer").value).toBe("");
    await click("Auswahl übernehmen");
    expect(input("manufacturer").value).toBe("Škoda");
    expect(input("model").value).toBe("SCALA");
    expect(input("fuel_type").value).toBe("Benzin");
    expect(input("power_kw").value).toBe("70");
    expect(save).not.toHaveBeenCalled();
    await submit();
    expect(save).toHaveBeenCalledExactlyOnceWith({
      manufacturer: "Škoda",
      model: "SCALA",
      year: "2020",
      engine: "Manuell bestätigter Code",
      fuel_type: "Benzin",
      power_kw: 70,
      catalog_reference: {
        source: "kba",
        as_of: "2026-01-01",
        make: "skoda",
        model: "SCALA",
        variant: "0123456789abcdef",
        types: [reference],
      },
    });
  });
  it("verändert gespeicherte Daten nicht beim Nachschlagen und erhält Baujahr, Motorcode und weitere manuelle Angaben", async () => {
    const state = emptyState(),
      edit = vi.fn(async () => true);
    Object.assign(state.Vehicles[0], {
      manufacturer: "Volkswagen",
      model: "Alt",
      year: "2018",
      engine: "Mein Motorcode",
      plate: "B-AA 1",
      fuel_type: "Diesel",
    });
    await act(async () =>
      root.render(
        <VehicleForm
          s={state}
          edit={edit}
          run={async () => true}
          mutate={async () => {}}
          openDocument={async () => {}}
          onPreview={() => {}}
        />,
      ),
    );
    await type(input("year"), "2019");
    await click("Fahrzeug auswählen");
    await choose("Marke", "skoda");
    await choose("Modell", "scala");
    await choose("Motorisierung", "70");
    expect(input("manufacturer").value).toBe("Volkswagen");
    expect(edit).not.toHaveBeenCalled();
    await click("Auswahl übernehmen");
    expect(input("year").value).toBe("2019");
    expect(input("engine").value).toBe("Mein Motorcode");
    expect(input("plate").value).toBe("B-AA 1");
    expect(edit).not.toHaveBeenCalled();
    await submit();
    expect(edit).toHaveBeenCalledWith(
      "Vehicles",
      state.Vehicles[0],
      expect.objectContaining({
        manufacturer: "Škoda",
        power_kw: 70,
        engine: "Mein Motorcode",
        year: "2019",
      }),
    );
  });
  it("behält manuelle Eingaben beim Abbrechen und verwirft die Herkunft nach einer manuellen Korrektur", async () => {
    await act(async () =>
      root.render(
        <VehicleCatalogFields
          initial={{
            manufacturer: "Alt",
            model: "Modell",
            fuel_type: "Diesel",
          }}
          onSelecting={() => {}}
        />,
      ),
    );
    await click("Fahrzeug auswählen");
    await choose("Marke", "skoda");
    await choose("Modell", "scala");
    await choose("Motorisierung", "70");
    await click("Auswahl übernehmen");
    expect(input("catalog_reference").value).toContain("kba");
    await type(input("fuel_type"), "Super E10");
    expect(input("catalog_reference").value).toBe("");
    await click("Fahrzeug auswählen");
    await choose("Marke", "volkswagen");
    await click("Manuell eingeben");
    expect(input("manufacturer").value).toBe("Škoda");
    expect(input("fuel_type").value).toBe("Super E10");
  });
  it("erlaubt bei Ladefehlern weiterhin manuelle Erfassung und einen gezielten erneuten Katalogabruf", async () => {
    vi.mocked(loadCatalog).mockRejectedValueOnce(
      Error("Fahrzeugkatalog nicht verfügbar."),
    );
    const save = vi.fn();
    await act(async () =>
      root.render(<VehicleSetup busy={false} error="" onSave={save} />),
    );
    expect(host.textContent).toContain("nicht verfügbar");
    await click("Erneut laden");
    await choose("Marke", "skoda");
    await click("Manuell eingeben");
    await type(input("manufacturer"), "Eigene Marke");
    await type(input("model"), "Importfahrzeug");
    await submit();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        manufacturer: "Eigene Marke",
        model: "Importfahrzeug",
        power_kw: null,
        catalog_reference: null,
      }),
    );
  });
  it("verhindert verspätete Markenantworten und setzt abhängige Auswahlen zurück", async () => {
    let old!: (make: CatalogMake) => void;
    vi.mocked(loadMake).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          old = resolve;
        }),
    );
    await act(async () =>
      root.render(
        <VehicleCatalogFields initiallyOpen onSelecting={() => {}} />,
      ),
    );
    await choose("Marke", "skoda");
    await choose("Marke", "volkswagen");
    await act(async () => old(skoda));
    await choose("Modell", "golf");
    await choose("Motorisierung", "elektro");
    await click("Auswahl übernehmen");
    expect(input("manufacturer").value).toBe("Volkswagen");
    expect(input("power_kw").value).toBe("100");
    await click("Fahrzeug auswählen");
    await choose("Marke", "skoda");
    expect(combo("Modell").value).toBe("");
    expect(combo("Motorisierung").disabled).toBe(true);
  });
  it("verwirft einen offenen Katalogentwurf beim Fahrzeugwechsel und zeigt Quellen nur auf Wunsch", async () => {
    const selecting = vi.fn();
    await act(async () =>
      root.render(
        <VehicleCatalogFields
          key="first"
          initiallyOpen
          onSelecting={selecting}
        />,
      ),
    );
    await choose("Marke", "skoda");
    await choose("Modell", "scala");
    await key(combo("Motorisierung"), "Escape");
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    await act(async () =>
      root.render(
        <VehicleCatalogFields
          key="second"
          initial={{
            manufacturer: "Zweite Marke",
            model: "Zweites Fahrzeug",
            fuel_type: "Diesel",
          }}
          onSelecting={selecting}
        />,
      ),
    );
    expect(input("manufacturer").value).toBe("Zweite Marke");
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    expect(host.textContent).not.toContain("Datenlizenz");
    await click("Informationen zum Fahrzeugkatalog");
    expect(host.textContent).toContain("Datenlizenz Deutschland");
    expect(host.textContent).toContain("Motorcode");
    expect(host.textContent).toContain("01.01.2026");
  });
  it("meldet auch eine ausschließlich per Maus übernommene Auswahl an die vorhandene Warnung für ungespeicherte Änderungen", async () => {
    const changed = vi.fn();
    await act(async () =>
      root.render(
        <div onInputCapture={changed}>
          <VehicleCatalogFields initiallyOpen onSelecting={() => {}} />
        </div>,
      ),
    );
    for (const label of ["Marke", "Modell", "Motorisierung"]) {
      await act(async () => combo(label).focus());
      await act(async () =>
        host.querySelector<HTMLElement>('[role="option"]')!.click(),
      );
    }
    expect(changed).not.toHaveBeenCalled();
    await click("Auswahl übernehmen");
    expect(changed).toHaveBeenCalledOnce();
  });
});
