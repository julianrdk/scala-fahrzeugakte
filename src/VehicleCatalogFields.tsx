import { Info, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  catalogSearch,
  variantLabel,
  type CatalogIndex,
  type CatalogMake,
  type CatalogReference,
} from "../shared/vehicle-catalog";
import type { Vehicle } from "../shared/types";
import { loadCatalog, loadMake } from "./vehicle-catalog";
import { Field } from "./Field";
import "./vehicle-catalog.css";

type Identity = Pick<Vehicle, "manufacturer" | "model" | "fuel_type"> &
  Pick<Partial<Vehicle>, "power_kw" | "catalog_reference">;
const empty: Identity = {
  manufacturer: "",
  model: "",
  fuel_type: "",
  power_kw: null,
  catalog_reference: null,
};

function SearchChoice({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: { id: string; label: string; search?: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const id = useId(),
    [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const selected = options.find((o) => o.id === value);
  const matches = options.filter((o) =>
    catalogSearch(o.label + " " + (o.search ?? "")).includes(
      catalogSearch(query),
    ),
  );
  const shown = matches.slice(0, 50);
  const choose = (key: string) => {
    onChange(key);
    setOpen(false);
    setQuery("");
    setActive(0);
  };
  useEffect(() => {
    if (open)
      document
        .getElementById(id + "-option-" + active)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [active, open, id]);
  return (
    <div
      className="catalog-choice"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + "-list"}
        aria-activedescendant={
          open && shown[active] ? id + "-option-" + active : undefined
        }
        value={open ? query : (selected?.label ?? "")}
        disabled={disabled}
        placeholder={
          disabled
            ? "Zuerst " +
              (label === "Modell" ? "Marke" : "Modell") +
              " auswählen"
            : label + " suchen"
        }
        onFocus={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((a) =>
              Math.max(
                0,
                Math.min(
                  shown.length - 1,
                  open ? a + (e.key === "ArrowDown" ? 1 : -1) : 0,
                ),
              ),
            );
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && shown[active]) choose(shown[active].id);
            else setOpen(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (
        <div
          className="catalog-results"
          id={id + "-list"}
          role="listbox"
          aria-label={label}
        >
          {shown.map((o, i) => (
            <div
              id={id + "-option-" + i}
              role="option"
              aria-selected={o.id === value}
              className={i === active ? "active" : ""}
              key={o.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o.id)}
            >
              {o.label}
            </div>
          ))}
          {!shown.length && <p role="status">Keine Treffer</p>}
          {matches.length > 50 && (
            <p>{matches.length} Treffer – Suche eingrenzen</p>
          )}
        </div>
      )}
    </div>
  );
}

export function identityFromForm(form: FormData) {
  const reference = String(form.get("catalog_reference") ?? "");
  const power = String(form.get("power_kw") ?? "")
    .trim()
    .replace(",", ".");
  return {
    manufacturer: String(form.get("manufacturer") ?? "").trim(),
    model: String(form.get("model") ?? "").trim(),
    fuel_type: String(form.get("fuel_type") ?? "").trim() || null,
    power_kw: power ? Number(power) : null,
    catalog_reference: reference
      ? (JSON.parse(reference) as CatalogReference)
      : null,
  };
}

export function VehicleCatalogFields({
  initial = empty,
  initiallyOpen = false,
  onSelecting,
}: {
  initial?: Identity;
  initiallyOpen?: boolean;
  onSelecting: (open: boolean) => void;
}) {
  const [values, setValues] = useState<Identity>(() => ({ ...initial }));
  const [open, setOpen] = useState(initiallyOpen);
  const [index, setIndex] = useState<CatalogIndex>();
  const [make, setMake] = useState<CatalogMake>();
  const [makeId, setMakeId] = useState(""),
    [modelId, setModelId] = useState(""),
    [variantId, setVariantId] = useState("");
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  const [help, setHelp] = useState(false);
  const helpId = useId();
  const provenanceInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    onSelecting(open);
  }, [open, onSelecting]);
  useEffect(() => {
    if (!open && !help) return;
    const controller = new AbortController(),
      request = ++generation.current;
    setLoading(true);
    setError("");
    (async () => {
      const catalog = await loadCatalog(controller.signal);
      if (request !== generation.current || controller.signal.aborted) return;
      setIndex(catalog);
      const entry = catalog.makes.find((m) => m.id === makeId);
      if (entry) {
        const data = await loadMake(entry, catalog.as_of, controller.signal);
        if (request === generation.current && !controller.signal.aborted)
          setMake(data);
      }
    })()
      .catch((e: unknown) => {
        if (!controller.signal.aborted && request === generation.current)
          setError(
            e instanceof Error ? e.message : "Fahrzeugkatalog nicht verfügbar.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted && request === generation.current)
          setLoading(false);
      });
    return () => {
      controller.abort();
      generation.current++;
    };
  }, [open, help, makeId, retry]);
  const model = make?.models.find((m) => m.id === modelId);
  const variant = model?.variants.find((v) => v.id === variantId);
  const manual = (key: keyof Identity, value: string) =>
    setValues((old) => ({
      ...old,
      [key]: key === "power_kw" ? (value === "" ? null : Number(value)) : value,
      catalog_reference: null,
    }));
  return (
    <div className="vehicle-catalog">
      <div className="catalog-toolbar">
        <button className="button" type="button" onClick={() => setOpen(!open)}>
          {open ? (
            "Manuell eingeben"
          ) : (
            <>
              <Search size={16} /> Fahrzeug auswählen
            </>
          )}
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-label="Informationen zum Fahrzeugkatalog"
          aria-expanded={help}
          aria-controls={helpId}
          onClick={() => setHelp(!help)}
        >
          <Info size={18} />
        </button>
      </div>
      {help && (
        <div id={helpId} className="catalog-info">
          <p>
            Quelle: Kraftfahrt-Bundesamt, Flensburg. Datenstand{" "}
            {index?.as_of
              ? "01.01." + index.as_of.slice(0, 4)
              : values.catalog_reference?.as_of
                ? "01.01." + values.catalog_reference.as_of.slice(0, 4)
                : "siehe Katalog"}
            .
          </p>
          <p>
            FZ 2 und FZ 6, für die Auswahl gruppiert. Herstellergruppen können
            mehrere Marken enthalten, etwa Mercedes-Benz und smart unter
            Daimler. Die Herstellerangabe bleibt bearbeitbar. Keine vollständige
            Modellhistorie; Motorcode, Hubraum und Baujahr werden nicht
            abgeleitet. Hybrid-Leistung kann nur den Verbrennungsmotor
            betreffen.
          </p>
          <a
            href="https://www.govdata.de/dl-de/by-2-0"
            target="_blank"
            rel="noreferrer"
          >
            Datenlizenz Deutschland – Namensnennung 2.0
          </a>
          <p>
            <a
              href="https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz2_b_uebersicht.html"
              target="_blank"
              rel="noreferrer"
            >
              KBA FZ 2
            </a>{" "}
            ·{" "}
            <a
              href="https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz6_b_uebersicht.html"
              target="_blank"
              rel="noreferrer"
            >
              KBA FZ 6
            </a>
          </p>
        </div>
      )}
      {open && (
        <div className="catalog-picker">
          <div className="form-grid">
            <SearchChoice
              label="Marke"
              value={makeId}
              options={(index?.makes ?? []).map((m) => ({
                id: m.id,
                label: m.label,
                search: m.aliases.join(" "),
              }))}
              onChange={(id) => {
                setMakeId(id);
                setMake(undefined);
                setModelId("");
                setVariantId("");
              }}
            />
            <SearchChoice
              label="Modell"
              value={modelId}
              disabled={!make || loading}
              options={make?.models ?? []}
              onChange={(id) => {
                setModelId(id);
                setVariantId("");
              }}
            />
            <SearchChoice
              label="Motorisierung"
              value={variantId}
              disabled={!model}
              options={(model?.variants ?? []).map((v) => ({
                id: v.id,
                label: variantLabel(v),
              }))}
              onChange={setVariantId}
            />
          </div>
          {loading && <p role="status">Katalog wird geladen …</p>}
          {error && (
            <div className="banner warning" role="alert">
              {error}{" "}
              <button
                type="button"
                className="button"
                onClick={() => setRetry((n) => n + 1)}
              >
                Erneut laden
              </button>
            </div>
          )}
          <button
            className="button primary"
            type="button"
            disabled={
              !make ||
              !model ||
              (!!model.variants.length && !variant) ||
              loading ||
              !!error
            }
            onClick={() => {
              if (!make || !model) return;
              setValues({
                manufacturer: make.label,
                model: model.label,
                fuel_type: variant?.fuel_type ?? null,
                power_kw: variant?.power_kw ?? null,
                catalog_reference: {
                  source: "kba",
                  as_of: make.as_of,
                  make: make.id,
                  model: model.label,
                  variant: variant?.id ?? null,
                  types: variant?.references ?? [],
                },
              });
              setOpen(false);
              provenanceInput.current?.dispatchEvent(
                new Event("input", { bubbles: true }),
              );
            }}
          >
            Auswahl übernehmen
          </button>
        </div>
      )}
      <div className="form-grid" hidden={open}>
        <Field label="Hersteller">
          <input
            name="manufacturer"
            maxLength={100}
            required={!open}
            value={values.manufacturer}
            onChange={(e) => manual("manufacturer", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Modell">
          <input
            name="model"
            maxLength={100}
            required={!open}
            value={values.model}
            onChange={(e) => manual("model", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Kraftstoff">
          <input
            name="fuel_type"
            maxLength={100}
            value={values.fuel_type ?? ""}
            onChange={(e) => manual("fuel_type", e.target.value)}
          />
        </Field>
        <Field label="Leistung (kW)">
          <input
            name="power_kw"
            type="number"
            min="0.1"
            max="10000"
            step="any"
            value={values.power_kw ?? ""}
            onChange={(e) => manual("power_kw", e.target.value)}
          />
        </Field>
      </div>
      <input
        type="hidden"
        ref={provenanceInput}
        name="catalog_reference"
        value={
          values.catalog_reference
            ? JSON.stringify(values.catalog_reference)
            : ""
        }
      />
    </div>
  );
}
