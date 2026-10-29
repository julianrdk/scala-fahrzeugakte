import type { ExpenseInput, PositionPrice, WorkInput } from "../shared/types";
import { categories } from "../shared/types";
import { Field } from "./Field";
import {
  amountInput,
  DecimalField,
  moneyText,
  PositionEditor,
} from "./PositionEditor";
import { workKinds } from "./view-support";

export function ExpenseFields({
  value: e,
  onChange,
  prices,
  onPrices,
}: {
  value: ExpenseInput;
  onChange: (next: ExpenseInput) => void;
  prices: PositionPrice[];
  onPrices: (
    parts: NonNullable<ExpenseInput["items"]>,
    prices: PositionPrice[],
  ) => void;
}) {
  const field = <K extends keyof ExpenseInput>(
    key: K,
    value: ExpenseInput[K],
  ) => onChange({ ...e, [key]: value });
  return (
    <>
      <div className="form-grid">
        <Field label="Titel">
          <input
            value={e.title}
            onChange={(x) => field("title", x.target.value)}
          />
        </Field>
        <Field label="Kategorie">
          <select
            value={e.category ?? ""}
            onChange={(x) =>
              field(
                "category",
                (x.target.value || null) as ExpenseInput["category"],
              )
            }
          >
            <option value="">Noch ungeklärt</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Datum">
          <input
            type="date"
            value={e.date ?? ""}
            onChange={(x) => field("date", x.target.value || null)}
          />
        </Field>
        <DecimalField
          label="Rechnungsbetrag"
          value={moneyText(e.amount_cents)}
          onCommit={(x) => field("amount_cents", amountInput(x))}
        />
        <Field label="Währung">
          <input
            value={e.currency ?? ""}
            placeholder="z. B. EUR"
            maxLength={3}
            onChange={(x) =>
              field("currency", x.target.value.toUpperCase() || null)
            }
          />
        </Field>
        <Field label="Kilometerstand">
          <input
            type="number"
            min="0"
            step="1"
            value={e.odometer_km ?? ""}
            onChange={(x) =>
              field(
                "odometer_km",
                x.target.value === "" ? null : Number(x.target.value),
              )
            }
          />
        </Field>
        <Field label="Verkäufer">
          <input
            value={e.vendor ?? ""}
            onChange={(x) => field("vendor", x.target.value || null)}
          />
        </Field>
        <Field label="Rechnungsnummer">
          <input
            value={e.invoice_number ?? ""}
            onChange={(x) => field("invoice_number", x.target.value || null)}
          />
        </Field>
        <Field label="Zahlungsrichtung">
          <select
            value={e.cashflow_type ?? "expense"}
            onChange={(x) =>
              field("cashflow_type", x.target.value as "expense" | "income")
            }
          >
            <option value="expense">Ausgabe</option>
            <option value="income">Einnahme</option>
          </select>
        </Field>
      </div>
      <Field label="Notizen">
        <textarea
          rows={2}
          value={e.notes ?? ""}
          onChange={(x) => field("notes", x.target.value || null)}
        />
      </Field>
      {e.fuel && (
        <details open>
          <summary>Tankangaben</summary>
          <div className="form-grid">
            <Field label="Liter">
              <input
                type="number"
                min="0"
                step="any"
                value={e.fuel.liters ?? ""}
                onChange={(x) =>
                  field("fuel", {
                    ...e.fuel!,
                    liters:
                      x.target.value === "" ? null : Number(x.target.value),
                  })
                }
              />
            </Field>
            <Field label="Kraftstoff">
              <input
                value={e.fuel.fuel_type ?? ""}
                onChange={(x) =>
                  field("fuel", {
                    ...e.fuel!,
                    fuel_type: x.target.value || null,
                  })
                }
              />
            </Field>
            <Field label="Tankstelle">
              <input
                value={e.fuel.station_name ?? ""}
                onChange={(x) =>
                  field("fuel", {
                    ...e.fuel!,
                    station_name: x.target.value || null,
                  })
                }
              />
            </Field>
            <Field label="Vollgetankt">
              <select
                value={e.fuel.full_tank == null ? "" : String(e.fuel.full_tank)}
                onChange={(x) =>
                  field("fuel", {
                    ...e.fuel!,
                    full_tank:
                      x.target.value === "" ? null : x.target.value === "true",
                  })
                }
              >
                <option value="">Unbekannt</option>
                <option value="true">Ja</option>
                <option value="false">Nein</option>
              </select>
            </Field>
            <Field label="Vorherigen Tankvorgang ausgelassen">
              <select
                value={
                  e.fuel.missed_previous_fillup == null
                    ? ""
                    : String(e.fuel.missed_previous_fillup)
                }
                onChange={(x) =>
                  field("fuel", {
                    ...e.fuel!,
                    missed_previous_fillup:
                      x.target.value === "" ? null : x.target.value === "true",
                  })
                }
              >
                <option value="">Unbekannt</option>
                <option value="true">Ja</option>
                <option value="false">Nein</option>
              </select>
            </Field>
          </div>
        </details>
      )}
      <details open={!!e.items?.length}>
        <summary>Positionen</summary>
        <PositionEditor
          parts={e.items ?? []}
          prices={prices}
          onChange={onPrices}
        />
      </details>
    </>
  );
}
export function WorkFields({
  value: w,
  onChange,
}: {
  value: WorkInput;
  onChange: (next: WorkInput) => void;
}) {
  const field = <K extends keyof WorkInput>(key: K, value: WorkInput[K]) =>
    onChange({ ...w, [key]: value });
  return (
    <>
      <div className="form-grid">
        <Field label="Titel">
          <input
            value={w.title}
            onChange={(x) => field("title", x.target.value)}
          />
        </Field>
        <Field label="Art der Arbeit">
          <select
            value={w.kind}
            onChange={(x) => field("kind", x.target.value as WorkInput["kind"])}
          >
            {Object.entries(workKinds).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={w.status}
            onChange={(x) =>
              field("status", x.target.value as WorkInput["status"])
            }
          >
            <option value="planned">Geplant</option>
            <option value="completed">Durchgeführt</option>
          </select>
        </Field>
        <Field
          label={
            w.status === "planned"
              ? "Geplanter Termin"
              : "Tatsächliches Arbeitsdatum"
          }
        >
          <input
            type="date"
            value={w.date ?? ""}
            onChange={(x) => field("date", x.target.value || null)}
          />
        </Field>
        <Field label="Kilometerstand">
          <input
            type="number"
            min="0"
            step="1"
            value={w.odometer_km ?? ""}
            onChange={(x) =>
              field(
                "odometer_km",
                x.target.value === "" ? null : Number(x.target.value),
              )
            }
          />
        </Field>
        <Field label="Durchführung">
          <select
            value={w.performed_by}
            onChange={(x) =>
              field("performed_by", x.target.value as WorkInput["performed_by"])
            }
          >
            <option value="unknown">Noch offen</option>
            <option value="self">Selbst gemacht</option>
            <option value="workshop">Werkstatt</option>
          </select>
        </Field>
        <DecimalField
          label="Kostenschätzung (keine Ausgabe)"
          value={moneyText(w.estimated_cost_cents)}
          onCommit={(x) => field("estimated_cost_cents", amountInput(x))}
        />
      </div>
      <Field label="Beschreibung">
        <textarea
          rows={3}
          value={w.description ?? ""}
          onChange={(x) => field("description", x.target.value || null)}
        />
      </Field>
      <details open={!!w.parts?.length}>
        <summary>Teile und Material</summary>
        <PositionEditor
          parts={w.parts ?? []}
          prices={[]}
          showPrices={false}
          onChange={(parts) => field("parts", parts)}
        />
      </details>
      {w.modification_details && (
        <details open>
          <summary>Umbauangaben</summary>
          <div className="form-grid">
            {(
              [
                ["manufacturer", "Hersteller"],
                ["part_number", "Teilenummer"],
                ["approval_number", "Freigabenummer"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  value={w.modification_details![key] ?? ""}
                  onChange={(x) =>
                    field("modification_details", {
                      ...w.modification_details!,
                      [key]: x.target.value || null,
                    })
                  }
                />
              </Field>
            ))}
            <Field label="Umbauzustand">
              <select
                value={w.modification_details.status}
                onChange={(x) =>
                  field("modification_details", {
                    ...w.modification_details!,
                    status: x.target.value as
                      "planned" | "installed" | "removed",
                  })
                }
              >
                <option value="planned">Geplant</option>
                <option value="installed">Eingebaut</option>
                <option value="removed">Ausgebaut</option>
              </select>
            </Field>
          </div>
        </details>
      )}
    </>
  );
}
