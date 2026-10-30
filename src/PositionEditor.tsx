import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { exactDecimal } from "../shared/capture";
import type { Part, PositionPrice } from "../shared/types";
import { Field } from "./Field";
export const emptyPrice = (): PositionPrice => ({
  unit_price: null,
  total_cents: null,
  basis: "unknown",
});
export const emptyPart = (): Part => ({
  description: null,
  part_number: null,
  quantity: null,
  unit: null,
  specification: null,
});
export function amountInput(value: string) {
  if (!value.trim()) return null;
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw Error("Betrag bitte mit höchstens zwei Nachkommastellen eingeben.");
  return Math.round(Number(value.replace(",", ".")) * 100);
}
export function moneyText(value: number | null | undefined) {
  return value == null
    ? ""
    : (value / 100).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      });
}
export function PositionEditor({
  parts,
  prices,
  onChange,
  disabled = false,
  showPrices = true,
}: {
  parts: Part[];
  prices: PositionPrice[];
  onChange: (parts: Part[], prices: PositionPrice[]) => void;
  disabled?: boolean;
  showPrices?: boolean;
}) {
  const filled = parts.map((_, i) => prices[i] ?? emptyPrice());
  function part(index: number, key: keyof Part, value: string) {
    onChange(
      parts.map((p, i) =>
        i === index
          ? {
              ...p,
              [key]:
                value === ""
                  ? null
                  : key === "quantity"
                    ? Number(value)
                    : value,
            }
          : p,
      ),
      filled,
    );
  }
  function price(index: number, key: keyof PositionPrice, value: string) {
    const next =
      key === "unit_price"
        ? exactDecimal(value)
        : key === "total_cents"
          ? amountInput(value)
          : (value as PositionPrice["basis"]);
    onChange(
      parts,
      filled.map((p, i) => (i === index ? { ...p, [key]: next } : p)),
    );
  }
  return (
    <fieldset className="position-editor" disabled={disabled}>
      <legend>
        {showPrices ? "Rechnungspositionen" : "Teile und Material"}
      </legend>
      {parts.map((row, i) => (
        <div className="position-row" key={i}>
          <div className="position-heading">
            <strong>Position {i + 1}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label={"Position " + (i + 1) + " entfernen"}
              onClick={() =>
                onChange(
                  parts.filter((_, j) => j !== i),
                  filled.filter((_, j) => j !== i),
                )
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
          <Field label="Beschreibung">
            <input
              value={row.description ?? ""}
              maxLength={10000}
              placeholder="z. B. Ölfilter"
              onChange={(e) => part(i, "description", e.target.value)}
            />
          </Field>
          <div className="position-grid">
            <Field label="Menge">
              <input
                type="number"
                step="any"
                min="0"
                value={row.quantity ?? ""}
                onChange={(e) => part(i, "quantity", e.target.value)}
              />
            </Field>
            <Field label="Einheit">
              <input
                value={row.unit ?? ""}
                placeholder="z. B. Stück"
                onChange={(e) => part(i, "unit", e.target.value)}
              />
            </Field>
            <Field label="Teilenummer">
              <input
                value={row.part_number ?? ""}
                placeholder="Laut Beleg"
                onChange={(e) => part(i, "part_number", e.target.value)}
              />
            </Field>
            {showPrices && (
              <>
                <DecimalField
                  label="Einzelpreis"
                  value={filled[i].unit_price?.replace(".", ",") ?? ""}
                  onCommit={(value) => price(i, "unit_price", value)}
                />
                <DecimalField
                  label="Positionsbetrag"
                  value={moneyText(filled[i].total_cents)}
                  onCommit={(value) => price(i, "total_cents", value)}
                />
                <Field label="Preisbasis">
                  <select
                    value={filled[i].basis}
                    onChange={(e) => price(i, "basis", e.target.value)}
                  >
                    <option value="unknown">Noch unklar</option>
                    <option value="net">Netto</option>
                    <option value="gross">Brutto</option>
                  </select>
                </Field>
              </>
            )}
          </div>
          <Field label="Bestätigte Freigabe / Spezifikation">
            <input
              value={row.specification ?? ""}
              placeholder="Nur bestätigte Angaben"
              onChange={(e) => part(i, "specification", e.target.value)}
            />
          </Field>
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={parts.length >= 100}
        onClick={() =>
          onChange([...parts, emptyPart()], [...filled, emptyPrice()])
        }
      >
        <Plus size={15} /> Position hinzufügen
      </button>
    </fieldset>
  );
}
export function DecimalField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value),
    [error, setError] = useState("");
  useEffect(() => setText(value), [value]);
  return (
    <Field label={label}>
      <input
        value={text}
        inputMode="decimal"
        placeholder="z. B. 12,90"
        onChange={(e) => {
          setText(e.target.value);
          setError("");
          e.target.setCustomValidity("");
        }}
        onBlur={(e) => {
          try {
            onCommit(text);
            e.target.setCustomValidity("");
            setError("");
          } catch (caught) {
            const message = (caught as Error).message;
            e.target.setCustomValidity(message);
            setError(message);
          }
        }}
        pattern={
          label === "Positionsbetrag"
            ? "-?[0-9]+([,.][0-9]{1,2})?"
            : "-?[0-9]+([,.][0-9]{1,6})?"
        }
      />
      {error && <small role="alert">{error}</small>}
    </Field>
  );
}
