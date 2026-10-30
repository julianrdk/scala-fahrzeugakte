import fs from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { compileCatalog, sheetRows, sha256 } from "../scripts/kba-catalog.mjs";
import {
  catalogSearch,
  validCatalogReference,
  type CatalogIndex,
  type CatalogMake,
} from "../shared/vehicle-catalog";
import { addVehicle } from "../shared/vehicle";
import { emptyState, editEntity, validateState } from "../shared/logic";

const header2 = { D: "Typ-Schl.-Nr.", E: "kW" };
const header6 = { C: "Herstellerklartext", E: "Handelsname" };
const reference = {
  source: "kba" as const,
  as_of: "2026-01-01",
  make: "skoda",
  model: "SCALA",
  variant: "0123456789abcdef",
  types: [{ manufacturer: "SKODA (CZ)", tsn: "000", hsn: "8004" }],
};
describe("KBA-Import und ausgelieferter Katalog", () => {
  it("liest das benannte Blatt per Relationship, XML-Entities, Inline- und gemeinsame Texte ohne Verlust führender Nullen", () => {
    const files = {
      "xl/workbook.xml":
        '<workbook xmlns:r="urn:relations"><sheets><sheet name="FZ 6.1" r:id="rId7"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId7" Target="worksheets/unusual.xml"/></Relationships>',
      "xl/sharedStrings.xml":
        "<sst><si><r><t>Ško</t></r><r><t>da &amp; Co</t></r></si><si><t>0005</t></si></sst>",
      "xl/worksheets/unusual.xml":
        '<worksheet><sheetData><row r="8"><c r="B8" t="s"><v>1</v></c><c r="C8" t="s"><v>0</v></c><c r="D8" t="inlineStr"><is><t>001</t></is></c><c r="E8"><v>70</v></c></row></sheetData></worksheet>',
    };
    const bytes = zipSync(
      Object.fromEntries(
        Object.entries(files).map(([k, v]) => [k, strToU8(v)]),
      ),
    );
    expect(sheetRows(bytes, "FZ 6.1")).toEqual([
      { B: "0005", C: "Škoda & Co", D: "001", E: "70" },
    ]);
    expect(() => sheetRows(bytes, "Falsches Blatt")).toThrow(/Tabellenblatt/);
    files["xl/sharedStrings.xml"] = "<!DOCTYPE sst><sst/>";
    expect(() =>
      sheetRows(
        zipSync(
          Object.fromEntries(
            Object.entries(files).map(([k, v]) => [k, strToU8(v)]),
          ),
        ),
        "FZ 6.1",
      ),
    ).toThrow(/DOCTYPE/);
  });
  it("vererbt KBA-Gruppen, gruppiert gleiche Motorisierungen und ergänzt HSN nur eindeutig", () => {
    const data = compileCatalog(
      [
        header2,
        { B: "SKODA (CZ)", C: "SCALA", D: "ATZ", E: "70", F: "B" },
        { D: "ABC", E: "70", F: "B" },
        { D: "AUC", E: "85", F: "D" },
        { B: "ANDERE", C: "SCALA", D: "ATZ", E: "70", F: "B" },
      ],
      [
        header6,
        { B: "8004", C: "SKODA (CZ)", D: "ATZ", E: "SCALA" },
        { B: "1111", C: "SKODA (CZ)", D: "ABC", E: "SCALA" },
        { B: "2222", C: "SKODA (CZ)", D: "ABC", E: "SCALA" },
      ],
      "2026-01-01",
    );
    const skoda = data.makes.find((m) => m.id === "skoda")!;
    expect(skoda.label).toBe("Škoda");
    expect(skoda.models[0].variants).toHaveLength(2);
    const petrol = skoda.models[0].variants.find(
      (v) => v.fuel_type === "Benzin",
    )!;
    expect(petrol.references).toEqual([
      { manufacturer: "SKODA (CZ)", tsn: "ATZ", hsn: "8004" },
      { manufacturer: "SKODA (CZ)", tsn: "ABC" },
    ]);
    expect(data.diagnostics.ambiguous).toBe(1);
    expect(data.makes.find((m) => m.id === "andere")!.models).toHaveLength(1);
  });
  it("erfindet bei Gas, Hybrid, sonstigen Kraftstoffen und fehlender Leistung keine genauen Motordaten", () => {
    const out = compileCatalog(
      [
        header2,
        { B: "MARKE", C: "MODELL", D: "AAA", E: "85", F: "H" },
        { D: "AAB", E: "66", F: "G" },
        { D: "AAC", E: "-", F: "D" },
        { D: "AAD", E: "50", F: "S" },
        { C: "-", D: "ZZZ", E: "35", F: "B" },
      ],
      [header6],
      "2026-01-01",
    );
    const variants = out.makes[0].models[0].variants;
    expect(variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fuel_type: "Hybrid", power_kw: 85 }),
        expect.objectContaining({ fuel_type: "Gas", power_kw: 66 }),
        expect.objectContaining({ fuel_type: "Diesel", power_kw: null }),
        expect.objectContaining({ fuel_type: null, power_kw: 50 }),
      ]),
    );
    expect(out.diagnostics.unknownFuelCodes).toEqual(["S"]);
    expect(() => compileCatalog([], [header6], "2026-01-01")).toThrow(
      /Spaltenstruktur/,
    );
  });
  it("enthält echte Scala-Varianten und liefert jede Marke in einer separaten geprüften Datei aus", () => {
    const index: CatalogIndex = JSON.parse(
      fs.readFileSync("public/vehicle-catalog/index.json", "utf8"),
    );
    expect(index.makes.length).toBeGreaterThan(40);
    expect(index.makes.find((m) => m.id === "daimler")?.aliases).toContain(
      "Mercedes-Benz",
    );
    expect(index.makes.find((m) => m.id === "bmw")?.aliases).toContain("MINI");
    expect(index.licence.url).toBe("https://www.govdata.de/dl-de/by-2-0");
    let models = 0,
      variants = 0;
    for (const entry of index.makes) {
      const bytes = fs.readFileSync("public/vehicle-catalog/" + entry.file);
      expect(sha256(bytes)).toBe(entry.sha256);
      expect(bytes.length).toBeLessThan(25 * 1024 * 1024);
      const make: CatalogMake = JSON.parse(bytes.toString());
      expect(make.models.every((m) => !/^[-./\s]+$/.test(m.label))).toBe(true);
      models += make.models.length;
      variants += make.models.reduce((n, m) => n + m.variants.length, 0);
      if (entry.id === "skoda") {
        const scala = make.models.find((m) => m.label === "SCALA")!;
        expect(
          scala.variants
            .filter((v) => v.fuel_type === "Benzin")
            .map((v) => v.power_kw),
        ).toEqual(expect.arrayContaining([70, 81, 85, 110]));
      }
      for (const model of make.models)
        for (const v of model.variants)
          expect(
            validCatalogReference({
              source: "kba",
              as_of: make.as_of,
              make: make.id,
              model: model.label,
              variant: v.id,
              types: v.references,
            }),
          ).toBe(true);
    }
    expect(index.counts).toEqual({
      makes: index.makes.length,
      models,
      variants,
    });
    expect(catalogSearch("Škoda")).toBe(catalogSearch("skoda"));
  });
});
describe("Optionale Fahrzeugleistung und Herkunft", () => {
  it("übernimmt zusätzliche Angaben beim Anlegen und liest alte Akten ohne neue Felder", () => {
    const old = emptyState();
    expect(() => validateState(old)).not.toThrow();
    const state = addVehicle(
      old,
      {
        manufacturer: "Škoda",
        model: "Scala",
        fuel_type: "Benzin",
        power_kw: 70,
        engine: "Manuell bestätigt",
        catalog_reference: reference,
      },
      "2026-10-30T12:00:00Z",
    );
    expect(state.Vehicles[0]).toMatchObject({
      power_kw: 70,
      catalog_reference: reference,
      engine: "Manuell bestätigt",
      fuel_type: "Benzin",
    });
  });
  it("weist ungültige Leistungen und Quellenreferenzen auch serverseitig ab", () => {
    const state = emptyState(),
      v = state.Vehicles[0];
    for (const patch of [
      { power_kw: -1 },
      { power_kw: "70" },
      { power_kw: NaN },
      { power_kw: Infinity },
      { power_kw: 10001 },
      { catalog_reference: { ...reference, source: "fremd" } },
      {
        catalog_reference: {
          ...reference,
          types: [{ manufacturer: "Škoda", tsn: "../secret" }],
        },
      },
      {
        catalog_reference: {
          ...reference,
          types: [{ manufacturer: "Škoda", tsn: "001", hsn: 8004 }],
        },
      },
    ])
      expect(() =>
        editEntity(
          state,
          "Vehicles",
          v.id,
          v.revision,
          patch,
          "2026-10-30T12:00:00Z",
        ),
      ).toThrow(/Fahrzeugleistung|Quellenreferenz/);
  });
});
