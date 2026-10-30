import { unzipSync, strFromU8 } from "fflate";
import { SaxesParser } from "saxes";
import { createHash } from "node:crypto";
import path from "node:path";

export const normalize = (text) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
const clean = (s) =>
  s
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

function xml(bytes, handlers) {
  if (!bytes) throw Error("Arbeitsmappenbestandteil fehlt.");
  const parser = new SaxesParser();
  parser.on("doctype", () => {
    throw Error("DOCTYPE ist in KBA-Arbeitsmappen nicht erlaubt.");
  });
  for (const [event, handler] of Object.entries(handlers))
    parser.on(event, handler);
  parser.write(strFromU8(bytes)).close();
}

/** Read the named sheet using workbook relationships, not Excel's arbitrary file order. */
export function sheetRows(bytes, sheetName) {
  const files = unzipSync(bytes);
  const strings = [];
  let inString = false,
    inText = false,
    text = "";
  if (files["xl/sharedStrings.xml"])
    xml(files["xl/sharedStrings.xml"], {
      opentag(node) {
        if (node.name === "si") {
          inString = true;
          text = "";
        }
        if (node.name === "t" && inString) inText = true;
      },
      text(value) {
        if (inText) text += value;
      },
      closetag(node) {
        if (node.name === "t") inText = false;
        if (node.name === "si") {
          strings.push(clean(text));
          inString = false;
        }
      },
    });
  let relationship;
  xml(files["xl/workbook.xml"], {
    opentag(node) {
      if (node.name === "sheet" && node.attributes.name === sheetName)
        relationship = node.attributes["r:id"];
    },
  });
  if (!relationship) throw Error("KBA-Tabellenblatt fehlt: " + sheetName);
  let target;
  xml(files["xl/_rels/workbook.xml.rels"], {
    opentag(node) {
      if (
        node.name === "Relationship" &&
        node.attributes.Id === relationship &&
        node.attributes.TargetMode !== "External"
      )
        target = node.attributes.Target;
    },
  });
  if (!target) throw Error("KBA-Tabellenverknüpfung fehlt.");
  const file = target.startsWith("/")
    ? target.slice(1)
    : path.posix.normalize("xl/" + target);
  if (!file.startsWith("xl/worksheets/"))
    throw Error("Ungültiger Tabellenpfad.");
  const rows = [];
  let row,
    cell,
    capture = false;
  xml(files[file], {
    opentag(node) {
      if (node.name === "row") row = {};
      if (node.name === "c")
        cell = {
          column: String(node.attributes.r).replace(/[0-9]/g, ""),
          type: node.attributes.t,
          value: "",
        };
      if (cell && (node.name === "v" || node.name === "t")) capture = true;
    },
    text(value) {
      if (capture && cell) cell.value += value;
    },
    closetag(node) {
      if (node.name === "v" || node.name === "t") capture = false;
      if (node.name === "c" && cell && row) {
        let value = cell.value;
        if (cell.type === "s") {
          const index = Number(value);
          if (!Number.isInteger(index) || strings[index] === undefined)
            throw Error("Ungültiger Textverweis.");
          value = strings[index];
        }
        row[cell.column] = clean(value);
        cell = null;
      }
      if (node.name === "row") {
        rows.push(row);
        row = null;
      }
    },
  });
  return rows;
}

const pretty = new Map(
  Object.entries({
    SKODA: "Škoda",
    VW: "Volkswagen",
    VOLKSWAGEN: "Volkswagen",
    BMW: "BMW",
    AUDI: "Audi",
    MERCEDESBENZ: "Mercedes-Benz",
    CITROEN: "Citroën",
    SEAT: "SEAT",
    FIAT: "Fiat",
    TOYOTA: "Toyota",
    OPEL: "Opel",
    FORD: "Ford",
    RENAULT: "Renault",
    PEUGEOT: "Peugeot",
    VOLVO: "Volvo",
    MINI: "MINI",
    ALFAROMEO: "Alfa Romeo",
    HYUNDAI: "Hyundai",
    KIA: "Kia",
    MAZDA: "Mazda",
    HONDA: "Honda",
    MITSUBISHI: "Mitsubishi",
    NISSAN: "Nissan",
    SUZUKI: "Suzuki",
    TESLA: "Tesla",
    DACIA: "Dacia",
    CUPRA: "CUPRA",
    PORSCHE: "Porsche",
  }),
);
function makeLabel(raw) {
  const name = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return pretty.get(name.replace(/[^A-Z0-9]/g, "")) ?? name;
}
const fuels = {
  B: "Benzin",
  D: "Diesel",
  E: "Elektro",
  G: "Gas",
  "G/B": "Benzin/Gas",
  H: "Hybrid",
};

/** Missing fuel codes are left unknown rather than guessed. */
export function compileCatalog(fz2Rows, fz6Rows, asOf) {
  if (!/^\d{4}-01-01$/.test(asOf)) throw Error("Ungültiger KBA-Datenstand.");
  if (!fz2Rows.some((r) => r.E === "kW" && r.D === "Typ-Schl.-Nr."))
    throw Error("Die Spaltenstruktur von FZ 2.2 hat sich geändert.");
  if (
    !fz6Rows.some(
      (r) =>
        /Herstellerklartext/.test(r.C ?? "") && /Handelsname/.test(r.E ?? ""),
    )
  )
    throw Error("Die Spaltenstruktur von FZ 6.1 hat sich geändert.");
  const keys = new Map();
  for (const r of fz6Rows) {
    if (
      !/^\d{4}$/.test(r.B ?? "") ||
      !/^[A-Z0-9]{3}$/.test(r.D ?? "") ||
      !r.C ||
      !r.E
    )
      continue;
    const key = normalize(r.C) + "|" + r.D + "|" + normalize(r.E);
    const matches = keys.get(key) ?? [];
    matches.push({ hsn: r.B, tsn: r.D });
    keys.set(key, matches);
  }
  let manufacturer = "",
    model = "";
  const makes = new Map();
  let ambiguous = 0,
    unlinked = 0,
    unknownFuel = new Set();
  for (const r of fz2Rows) {
    if (r.B) {
      manufacturer = r.B;
      model = "";
    }
    if (r.C) model = r.C;
    if (
      !manufacturer ||
      !model ||
      /^[-./\s]+$/.test(model) ||
      !/^[A-Z0-9]{3}$/.test(r.D ?? "")
    )
      continue;
    // A statistical row is not a production-year or engine-code source.
    const power =
      /^\d+(?:\.\d+)?$/.test(r.E ?? "") && Number(r.E) > 0 ? Number(r.E) : null;
    const fuel = fuels[r.F] ?? null;
    if (!fuel && r.F && r.F !== "-") unknownFuel.add(r.F);
    const label = makeLabel(manufacturer),
      id = normalize(label);
    if (!id) throw Error("Ungültige KBA-Marke.");
    let make = makes.get(id);
    if (!make) {
      make = { id, label, aliases: new Set(), models: new Map() };
      makes.set(id, make);
    }
    make.aliases.add(manufacturer);
    const modelId = normalize(model);
    // Do not collapse different trade names on punctuation or infer generations.
    let m = make.models.get(model);
    if (!m) {
      m = {
        id: modelId + "-" + sha256(model).slice(0, 8),
        label: model,
        variants: new Map(),
      };
      make.models.set(model, m);
    }
    if (power === null && fuel === null) continue;
    const variantKey = (fuel ?? "") + "|" + power;
    let variant = m.variants.get(variantKey);
    if (!variant) {
      variant = {
        id: sha256(id + "|" + model + "|" + variantKey).slice(0, 16),
        fuel_type: fuel,
        power_kw: power,
        references: [],
      };
      m.variants.set(variantKey, variant);
    }
    const matches =
      keys.get(normalize(manufacturer) + "|" + r.D + "|" + normalize(model)) ??
      [];
    if (matches.length > 1) ambiguous++;
    if (!matches.length) unlinked++;
    // Manufacturer + TSN from FZ 2 is kept; HSN is attached only for one exact FZ 6 match.
    const ref = {
      manufacturer,
      tsn: r.D,
      ...(matches.length === 1 ? { hsn: matches[0].hsn } : {}),
    };
    if (
      !variant.references.some((x) => JSON.stringify(x) === JSON.stringify(ref))
    )
      variant.references.push(ref);
  }
  const compare = (a, b) => a.label.localeCompare(b.label, "de");
  const output = [...makes.values()]
    .map((make) => ({
      id: make.id,
      label: make.label,
      aliases: [...make.aliases].sort(),
      models: [...make.models.values()]
        .map((m) => ({
          id: m.id,
          label: m.label,
          variants: [...m.variants.values()].sort(
            (a, b) =>
              (a.fuel_type ?? "").localeCompare(b.fuel_type ?? "", "de") ||
              (a.power_kw ?? -1) - (b.power_kw ?? -1),
          ),
        }))
        .sort(compare),
    }))
    .sort(compare);
  return {
    makes: output,
    diagnostics: {
      ambiguous,
      unlinked,
      unknownFuelCodes: [...unknownFuel].sort(),
    },
  };
}
