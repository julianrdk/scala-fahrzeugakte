import type { Part, PositionPrice } from "./types";
export type ReceiptPage = {
  page: number;
  text: string;
  method: "text" | "ocr";
};
export type ReceiptSuggestion = {
  date: string | null;
  invoice_number: string | null;
  vendor: string | null;
  currency: string | null;
  amount_cents: number | null;
  items: Part[];
  prices: PositionPrice[];
  warnings: string[];
  sources: Record<string, string>;
};
const amountToken =
  /(?<![\p{L}\p{N}_/-])-?(?:\d{1,3}(?:[.\u00a0 ]\d{3})+|\d+)[,.]\d{2}(?!\d)/gu;
export function receiptMoney(value: string): number | null {
  let text = value.replace(/[€\s]/g, "").replace(/EUR/gi, "");
  if (!/^-?[\d.,]+$/.test(text)) return null;
  if (text.includes(",")) {
    if (!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(text)) return null;
    text = text.replaceAll(".", "").replace(",", ".");
  } else if (!/^-?\d+\.\d{2}$/.test(text)) return null;
  const result = Math.round(Number(text) * 100);
  return Number.isSafeInteger(result) && Math.abs(result) <= 1e10
    ? result
    : null;
}
function dateValue(raw: string) {
  const match =
    raw.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/) ??
    raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (!match) return null;
  const iso =
      match[1].length === 4
        ? match[1] + "-" + match[2] + "-" + match[3]
        : match[3] +
          "-" +
          match[2].padStart(2, "0") +
          "-" +
          match[1].padStart(2, "0"),
    date = new Date(iso + "T12:00:00Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
function numbers(line: string) {
  return [...line.matchAll(amountToken)]
    .map((m) => ({
      value: receiptMoney(m[0]),
      index: m.index!,
      text: m[0].trim(),
    }))
    .filter((x) => x.value !== null);
}
const stop =
  /^(?:zwischen|gesamt|end|rechnungs|zahl|netto|brutto|mehrwert|umsatz|mwst|ust|summe|rabatt|steuer|zahlungs|bank|iban|bic|liefer|vielen dank|seite\s*\d)/i;
function headerType(cell: string) {
  const s = cell.toLowerCase().replace(/[.:-]/g, "");
  if (/^(pos|position|nr)$/.test(s)) return "position";
  if (/bezeichnung|beschreibung|artikel(?!nummer)|leistung/.test(s))
    return "description";
  if (/menge|anzahl/.test(s)) return "quantity";
  if (/^einheit$|^eh$/.test(s)) return "unit";
  if (/teilenummer|artikelnr|artikelnummer|artnr/.test(s)) return "part_number";
  if (/einzel|stückpreis|^ep$/.test(s)) return "unit_price";
  if (/gesamt|betrag|^gp$/.test(s)) return "total";
  return "";
}
function decimal(value: string) {
  const text = value.trim().replace(",", ".");
  return /^-?\d+(?:\.\d{1,6})?$/.test(text) ? text : null;
}
export function parseReceipt(pages: ReceiptPage[]): ReceiptSuggestion {
  const result: ReceiptSuggestion = {
    date: null,
    invoice_number: null,
    vendor: null,
    currency: null,
    amount_cents: null,
    items: [],
    prices: [],
    warnings: [],
    sources: {},
  };
  const lines = pages.flatMap((page) =>
    page.text
      .split(/\r?\n/)
      .map((text) => ({ text: text.trim(), page: page.page }))
      .filter((x) => x.text),
  );
  const source = (key: string, row: { text: string; page: number }) => {
    result.sources[key] = "Seite " + row.page + ": " + row.text;
  };
  if (lines.some((l) => /€|\bEUR\b/i.test(l.text))) result.currency = "EUR";
  const dates = lines
    .filter((l) =>
      /rechnungsdatum|belegdatum|(?<!liefer)(?<!leistungs)\bdatum\b/i.test(
        l.text,
      ),
    )
    .map((row) => ({ row, value: dateValue(row.text) }))
    .filter((x) => x.value);
  const uniqueDates = [...new Set(dates.map((x) => x.value))];
  if (uniqueDates.length === 1) {
    result.date = uniqueDates[0];
    source("date", dates[0].row);
  } else if (uniqueDates.length > 1)
    result.warnings.push(
      "Mehrere mögliche Rechnungsdaten gefunden. Datum bitte selbst auswählen.",
    );
  const invoices = lines
    .map((row) => ({
      row,
      match: row.text.match(
        /(?:rechnungs(?:nummer|[-\s]*nr\.?)|beleg(?:nummer|[-\s]*nr\.?))\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9/_\-.]{1,79})/i,
      ),
    }))
    .filter((x) => x.match);
  if (new Set(invoices.map((x) => x.match![1])).size === 1) {
    result.invoice_number = invoices[0].match![1];
    source("invoice_number", invoices[0].row);
  }
  const vendors = lines
    .slice(0, 12)
    .filter(
      (l) =>
        /\b(?:GmbH|KG|OHG|AG|e\.\s*K\.|Autohaus|Werkstatt|Tankstelle|Autoteile|Servicebetrieb)\b/i.test(
          l.text,
        ) && !/^kunde|rechnungsadresse|lieferadresse|empfänger/i.test(l.text),
    );
  if (vendors.length) {
    result.vendor = vendors[0].text.slice(0, 500);
    source("vendor", vendors[0]);
    result.warnings.push("Verkäufer bitte am Rechnungskopf prüfen.");
  }
  const totals = lines
    .filter(
      (l) =>
        /rechnungsbetrag|gesamtbetrag|gesamtsumme|endbetrag|zahlbetrag|zu\s+zahlen|summe\s*brutto|bruttobetrag|^gesamt\s*[:€\d]/i.test(
          l.text,
        ) && !/zwischensumme|netto|übertrag/i.test(l.text),
    )
    .flatMap((row) => {
      const found = numbers(row.text);
      return found.length ? [{ row, value: found.at(-1)!.value! }] : [];
    });
  const uniqueTotals = [...new Set(totals.map((x) => x.value))];
  if (uniqueTotals.length === 1) {
    result.amount_cents = uniqueTotals[0];
    source("amount_cents", totals[0].row);
  } else if (uniqueTotals.length > 1)
    result.warnings.push(
      "Mehrere unterschiedliche Gesamtbeträge gefunden. Rechnungsbetrag bitte prüfen.",
    );
  let columns: string[] | null = null,
    inTable = false,
    basis: PositionPrice["basis"] = "unknown";
  for (const row of lines) {
    const line = row.text,
      cells = line
        .split(/\t+|\s{2,}/)
        .map((x) => x.trim())
        .filter(Boolean),
      tokens = [
        ...line.matchAll(
          /\b(?:Position|Pos\.?|Nr\.?|Artikelnummer|Teilenummer|Beschreibung|Bezeichnung|Artikel|Leistung|Menge|Anzahl|Einheit|EH|Einzelpreis(?:\s+(?:netto|brutto))?|Stückpreis(?:\s+(?:netto|brutto))?|EP|Gesamt(?:preis|betrag)?(?:\s+(?:netto|brutto))?|Betrag|GP)\b/gi,
        ),
      ].map((m) => headerType(m[0])),
      types = tokens.includes("description") ? tokens : cells.map(headerType);
    if (
      types.includes("description") &&
      (types.includes("total") ||
        types.includes("unit_price") ||
        types.includes("quantity"))
    ) {
      columns = types;
      inTable = true;
      basis = /brutto/i.test(line)
        ? "gross"
        : /netto/i.test(line)
          ? "net"
          : "unknown";
      continue;
    }
    if (
      /bezeichnung|beschreibung|artikel/.test(line.toLowerCase()) &&
      /menge|anzahl|einzelpreis|gesamt/.test(line.toLowerCase())
    ) {
      inTable = true;
      columns = null;
      continue;
    }
    if (!inTable || stop.test(line)) {
      if (inTable && stop.test(line)) inTable = false;
      continue;
    }
    if (result.items.length >= 100) {
      result.warnings.push(
        "Mehr als 100 mögliche Positionen. Weitere Zeilen bitte prüfen.",
      );
      break;
    }
    let description = "",
      quantity: number | null = null,
      unit: string | null = null,
      partNumber: string | null = null,
      unitPrice: string | null = null,
      total: number | null = null;
    if (columns && cells.length === columns.length) {
      for (const [i, key] of columns.entries()) {
        const value = cells[i];
        if (key === "description") description = value;
        if (key === "quantity") {
          const m = value.match(/^(\d+(?:[,.]\d+)?)(?:\s+(.+))?$/);
          if (m) {
            quantity = Number(m[1].replace(",", "."));
            unit = m[2] ?? null;
          }
        }
        if (key === "unit") unit = value === "|" ? null : value;
        if (key === "part_number") partNumber = value;
        if (key === "unit_price")
          unitPrice = decimal(value.replace(/\s*(€|EUR)\s*/gi, ""));
        if (key === "total") total = receiptMoney(value);
      }
    } else {
      const found = numbers(line);
      if (!found.length) continue;
      total = found.at(-1)!.value;
      let prefix = line.slice(0, found[0].index).trim();
      if (found.length >= 2)
        unitPrice = decimal(found.at(-2)!.text.replaceAll(" ", ""));
      const qty = prefix.match(
        /^(?:\d{1,3}[.)]?\s+)?(\d+(?:[,.]\d+)?)\s+(Stk\.?|Stück|St|l|Liter|ml|kg|g|Std\.?|h|Satz|Paar)\s+(.+)$/i,
      );
      if (qty) {
        quantity = Number(qty[1].replace(",", "."));
        unit = qty[2];
        prefix = qty[3];
      } else prefix = prefix.replace(/^\d{1,3}[.)]?\s+/, "");
      description = prefix.split(/\s{2,}/)[0];
    }
    if (!description || description.length > 500 || total === null) continue;
    const part = description.match(
      /(?:Art\.?[-\s]*Nr\.?|Teile[-\s]*Nr\.?|Teilenummer)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9./_-]{1,70})/i,
    );
    if (part) partNumber = part[1];
    result.items.push({
      description,
      part_number: partNumber,
      quantity,
      unit,
      specification: null,
    });
    result.prices.push({ unit_price: unitPrice, total_cents: total, basis });
  }
  if (result.items.length)
    result.warnings.push(
      "Rechnungspositionen, Mengen, Preise und Netto-/Bruttobasis bitte mit dem Original vergleichen.",
    );
  else
    result.warnings.push(
      "Keine ausreichend eindeutige Positionstabelle erkannt. Positionen kannst du manuell ergänzen.",
    );
  if (!result.amount_cents && result.amount_cents !== 0)
    result.warnings.push(
      "Kein eindeutiger Rechnungsbetrag erkannt. Betrag bleibt offen.",
    );
  if (pages.some((p) => p.method === "ocr"))
    result.warnings.push(
      "Dieser Beleg wurde zumindest teilweise per OCR gelesen. Erkennungsfehler sind möglich.",
    );
  return result;
}
