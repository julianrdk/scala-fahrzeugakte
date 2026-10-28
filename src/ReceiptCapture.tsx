import { Check, FileSearch, LoaderCircle, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { blankPackage, MAX_FILE } from "../shared/logic";
import {
  parseReceipt,
  type ReceiptPage,
  type ReceiptSuggestion,
} from "../shared/receipt";
import {
  categories,
  type CaptureMetadata,
  type Category,
  type Doc,
  type ExpenseInput,
  type Part,
  type PositionPrice,
  type State,
  type WorkInput,
} from "../shared/types";
import { prepareFile, type Adapter } from "./adapter";
import "./capture.css";
import { Field } from "./Field";
import { amountInput, moneyText, PositionEditor } from "./PositionEditor";
import { WorkshopSelect } from "./Workshops";
type Fields = {
  title: string;
  date: string;
  invoice_number: string;
  vendor: string;
  currency: string;
  amount: string;
  km: string;
  work_title: string;
  work_date: string;
  notes: string;
};
const blank = (): Fields => ({
  title: "",
  date: "",
  invoice_number: "",
  vendor: "",
  currency: "",
  amount: "",
  km: "",
  work_title: "",
  work_date: "",
  notes: "",
});
type Runner = (
  action: () => Promise<void>,
  success?: string,
) => Promise<boolean>;
export function ReceiptCapture({
  s,
  adapter,
  run,
  onDone,
  busy,
  supported,
}: {
  s: State;
  adapter: Adapter;
  run: Runner;
  onDone: () => Promise<void>;
  busy: boolean;
  supported: boolean;
}) {
  const [category, setCategory] = useState<Category | "">(""),
    [documentType, setDocumentType] = useState<Doc["document_type"]>("invoice"),
    [expense, setExpense] = useState(true),
    [withWork, setWithWork] = useState(false),
    [performed, setPerformed] = useState<WorkInput["performed_by"]>("unknown"),
    [kind, setKind] = useState<WorkInput["kind"]>("maintenance"),
    [workshop, setWorkshop] = useState(""),
    [completed, setCompleted] = useState(false);
  const [fields, setFields] = useState<Fields>(blank),
    [parts, setParts] = useState<Part[]>([]),
    [prices, setPrices] = useState<PositionPrice[]>([]),
    [file, setFile] = useState<File | null>(null),
    [sourceUrl, setSourceUrl] = useState(""),
    [previews, setPreviews] = useState<string[]>([]),
    [page, setPage] = useState(0),
    [rawPages, setRawPages] = useState<ReceiptPage[]>([]),
    [sources, setSources] = useState<Record<string, string>>({}),
    [warnings, setWarnings] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false),
    [progress, setProgress] = useState(""),
    [readError, setReadError] = useState(""),
    [forceOcr, setForceOcr] = useState(false),
    [operation, setOperation] = useState(() => crypto.randomUUID()),
    [frozen, setFrozen] = useState(false);
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    dirty = useRef(new Set<keyof Fields>()),
    itemsDirty = useRef(false),
    previewRef = useRef<string[]>([]);
  const running = busy || frozen;
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      previewRef.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  useEffect(() => {
    if (!file) {
      setSourceUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function update(key: keyof Fields, value: string) {
    dirty.current.add(key);
    setFields((f) => ({ ...f, [key]: value }));
    setOperation(crypto.randomUUID());
  }
  function select(next: File | null) {
    if (!next) return;
    generation.current++;
    controller.current?.abort();
    setProcessing(false);
    setReadError("");
    if (
      next.size > MAX_FILE ||
      !next.size ||
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
        next.type,
      )
    ) {
      setReadError(
        "Bitte PDF, JPG, PNG oder WebP mit maximal 4 MiB auswählen.",
      );
      return;
    }
    previewRef.current.forEach(URL.revokeObjectURL);
    previewRef.current = [];
    setPreviews([]);
    setPage(0);
    setFile(next);
    setFields({ ...blank(), title: next.name.replace(/\.[^.]+$/, "") });
    dirty.current.clear();
    itemsDirty.current = false;
    setParts([]);
    setPrices([]);
    setWarnings([]);
    setSources({});
    setRawPages([]);
    setCompleted(false);
    setOperation(crypto.randomUUID());
  }
  function apply(data: ReceiptSuggestion) {
    const proposed: Partial<Fields> = {
      date: data.date ?? "",
      invoice_number: data.invoice_number ?? "",
      vendor: data.vendor ?? "",
      currency: data.currency ?? "",
      amount: moneyText(data.amount_cents),
    };
    if (data.invoice_number || data.vendor)
      proposed.title = ["Rechnung", data.invoice_number ?? data.vendor].join(
        " · ",
      );
    if (data.items[0]?.description)
      proposed.work_title = data.items[0].description;
    setFields((old) => {
      const next = { ...old };
      for (const [key, value] of Object.entries(proposed))
        if (!dirty.current.has(key as keyof Fields))
          next[key as keyof Fields] = value;
      return next;
    });
    if (!itemsDirty.current) {
      setParts(data.items);
      setPrices(data.prices);
    }
    setWarnings([
      ...data.warnings,
      ...(dirty.current.size || itemsDirty.current
        ? ["Deine bereits bearbeiteten Angaben wurden beibehalten."]
        : []),
    ]);
    setSources(data.sources);
    setOperation(crypto.randomUUID());
  }
  async function read() {
    if (!file) return;
    controller.current?.abort();
    const current = ++generation.current,
      aborter = new AbortController();
    controller.current = aborter;
    setProcessing(true);
    setReadError("");
    setProgress("Beleg wird vorbereitet …");
    try {
      const { readReceipt } = await import("./ocr");
      if (aborter.signal.aborted) return;
      const result = await readReceipt(file, {
        signal: aborter.signal,
        forceOcr,
        onProgress: (message) => {
          if (current === generation.current) setProgress(message);
        },
      });
      if (current !== generation.current) {
        result.previews.forEach(URL.revokeObjectURL);
        return;
      }
      previewRef.current.forEach(URL.revokeObjectURL);
      previewRef.current = result.previews;
      setPreviews(result.previews);
      setPage(0);
      setRawPages(result.pages);
      apply(parseReceipt(result.pages));
    } catch (error) {
      if (current === generation.current && !aborter.signal.aborted)
        setReadError(
          error instanceof Error
            ? error.message
            : "Beleg konnte nicht gelesen werden.",
        );
    } finally {
      if (current === generation.current) {
        setProcessing(false);
        setProgress("");
      }
    }
  }
  function cancel() {
    generation.current++;
    controller.current?.abort();
    setProcessing(false);
    setProgress("");
    setReadError(
      "Texterkennung abgebrochen. Du kannst die Angaben manuell ergänzen.",
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supported || processing) return;
    await run(async () => {
      if (!expense && !withWork && !file)
        throw Error(
          "Bitte eine Ausgabe, eine Arbeit oder einen Beleg auswählen.",
        );
      const p = blankPackage(),
        capture: CaptureMetadata = {},
        docRefs = file ? ["receipt1"] : [],
        km = fields.km.trim() ? Number(fields.km.replace(",", ".")) : null;
      if (km !== null && (!Number.isFinite(km) || km < 0))
        throw Error("Kilometerstand ungültig.");
      if (file)
        p.documents.push({
          ref: "receipt1",
          source_filename: file.name,
          title: fields.title.trim() || file.name,
          document_type: documentType,
        });
      if (expense) {
        const item: ExpenseInput = {
          ref: "expense1",
          title: fields.title.trim(),
          category: category || null,
          date: fields.date || null,
          odometer_km: km,
          amount_cents: amountInput(fields.amount),
          currency: fields.currency || null,
          vendor: fields.vendor || null,
          invoice_number: fields.invoice_number || null,
          document_refs: docRefs,
          notes: fields.notes || null,
          cashflow_type: "expense",
          ...(parts.length ? { items: parts } : {}),
        };
        p.expenses.push(item);
        if (parts.length) capture.prices_by_expense_ref = { expense1: prices };
      }
      if (withWork) {
        p.work.push({
          ref: "work1",
          title: fields.work_title.trim() || fields.title.trim(),
          kind,
          status: completed ? "completed" : "planned",
          date: fields.work_date || null,
          odometer_km: km,
          performed_by: performed,
          description: fields.notes || null,
          expense_refs: expense ? ["expense1"] : [],
          document_refs: docRefs,
          ...(parts.length ? { parts } : {}),
        });
        if (workshop) capture.workshops_by_work_ref = { work1: workshop };
      }
      setFrozen(true);
      try {
        const documents: Record<string, string> = {};
        if (file) {
          setProgress("Original wird hochgeladen …");
          const prepared = await prepareFile(file),
            upload = await adapter.call("upload", {
              operation_id: operation,
              file: prepared,
            });
          documents.receipt1 = upload.id;
        }
        setProgress("Einträge werden gemeinsam gespeichert …");
        await adapter.call("commit", {
          operation_id: operation,
          package: p,
          documents,
          allow_missing: false,
          confirm_reminders: false,
          duplicate_override_reason: null,
          links: {},
          ...(Object.keys(capture).length ? { capture } : {}),
        });
        await onDone();
      } finally {
        setFrozen(false);
        setProgress("");
      }
    }, "Beleg und geprüfte Angaben gespeichert.");
  }
  const evidence = (name: string) =>
    sources[name] &&
    !dirty.current.has(
      (name === "amount_cents" ? "amount" : name) as keyof Fields,
    ) ? (
      <small className="receipt-evidence">{sources[name]}</small>
    ) : null;
  return (
    <form className="receipt-capture" onSubmit={save}>
      <h2>Beleg einlesen</h2>
      <p className="muted">
        Kategorie wählen, Beleg auslesen und die Vorschläge vor dem Speichern
        prüfen.
      </p>
      {!supported && (
        <p className="banner warning">
          Das Auslesen funktioniert bereits lokal. Zum Speichern von
          Werkstattangaben und Positionspreisen ist die neue Apps-Script-Version
          erforderlich.
        </p>
      )}
      <fieldset disabled={running}>
        <legend>1 · Einordnung</legend>
        <div className="form-grid">
          <Field label="Belegart">
            <select
              value={documentType}
              onChange={(e) => {
                setDocumentType(e.target.value as Doc["document_type"]);
                setOperation(crypto.randomUUID());
              }}
            >
              <option value="invoice">Rechnung</option>
              <option value="receipt">Kassenbeleg</option>
              <option value="inspection">Prüfbericht</option>
              <option value="service_history">Serviceheft</option>
              <option value="contract">Vertrag</option>
              <option value="other">Sonstiges Dokument</option>
            </select>
          </Field>
          <Field label="Kategorie">
            <select
              value={category}
              required
              onChange={(e) => {
                const value = e.target.value as Category;
                setCategory(value);
                setOperation(crypto.randomUUID());
                setWithWork(
                  value === "Wartung & Reparatur" ||
                    value === "Umbauten & Zubehör",
                );
                setKind(
                  value === "Umbauten & Zubehör"
                    ? "modification"
                    : "maintenance",
                );
              }}
            >
              <option value="">Bitte auswählen</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="receipt-entry-options">
          <label className="check">
            <input
              type="checkbox"
              checked={expense}
              onChange={(e) => {
                setExpense(e.target.checked);
                setOperation(crypto.randomUUID());
              }}
            />{" "}
            Ausgabe anlegen
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={withWork}
              onChange={(e) => {
                setWithWork(e.target.checked);
                setOperation(crypto.randomUUID());
              }}
            />{" "}
            Verknüpfte Arbeit anlegen
          </label>
        </div>
        {withWork && (
          <div className="form-grid">
            <Field label="Durchführung">
              <select
                value={performed}
                onChange={(e) => {
                  const value = e.target.value as WorkInput["performed_by"];
                  setPerformed(value);
                  setWorkshop(
                    value === "self"
                      ? (s.Settings[0].self_workshop_id ?? "")
                      : "",
                  );
                  setOperation(crypto.randomUUID());
                }}
              >
                <option value="unknown">Noch offen</option>
                <option value="self">Selbst gemacht / repariert</option>
                <option value="workshop">Externe Werkstatt</option>
              </select>
            </Field>
            <WorkshopSelect
              settings={s.Settings[0]}
              value={workshop}
              onChange={(value) => {
                setWorkshop(value);
                setOperation(crypto.randomUUID());
              }}
            />
          </div>
        )}
      </fieldset>
      <fieldset disabled={running}>
        <legend>2 · Beleg auswählen</legend>
        <label className="field">
          <span>PDF oder Belegfoto · maximal 4 MiB</span>
          <input
            type="file"
            aria-label="Beleg für Texterkennung auswählen"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            disabled={!category || processing}
            onChange={(e) => select(e.target.files?.[0] ?? null)}
          />
        </label>
        {!category && <p className="muted">Wähle zuerst eine Kategorie.</p>}
        <div className="receipt-read-actions">
          {processing ? (
            <button type="button" className="button" onClick={cancel}>
              <Square size={15} /> Erkennung abbrechen
            </button>
          ) : (
            <button
              type="button"
              className="button primary"
              disabled={!file}
              onClick={read}
            >
              <FileSearch size={18} />{" "}
              {rawPages.length ? "Erneut auslesen" : "Beleg auslesen"}
            </button>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={forceOcr}
              disabled={processing}
              onChange={(e) => setForceOcr(e.target.checked)}
            />{" "}
            Auch vorhandenen PDF-Text per OCR neu lesen
          </label>
        </div>
        <p className="muted">
          Erkennung auf diesem Gerät. Das Original wird erst beim bestätigten
          Speichern hochgeladen.
        </p>
      </fieldset>
      {processing && (
        <p role="status" className="receipt-progress">
          <LoaderCircle size={17} />
          {progress}
        </p>
      )}
      {readError && (
        <p className="banner warning" role="alert">
          {readError} Die Felder bleiben manuell bearbeitbar.
        </p>
      )}
      {warnings.length > 0 && (
        <details className="receipt-warnings" open>
          <summary>Hinweise zur Erkennung</summary>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="receipt-review-layout">
        <div className="receipt-fields">
          <fieldset disabled={running}>
            <legend>3 · Angaben prüfen</legend>
            <Field label="Titel">
              <input
                required
                value={fields.title}
                maxLength={500}
                placeholder="z. B. Rechnung Ölfilter"
                onChange={(e) => update("title", e.target.value)}
              />
            </Field>
            {expense && (
              <>
                <div className="form-grid">
                  <Field label="Rechnungsdatum">
                    <input
                      type="date"
                      value={fields.date}
                      onChange={(e) => update("date", e.target.value)}
                    />
                    {evidence("date")}
                  </Field>
                  <Field label="Rechnungsnummer">
                    <input
                      value={fields.invoice_number}
                      onChange={(e) => update("invoice_number", e.target.value)}
                    />
                    {evidence("invoice_number")}
                  </Field>
                  <Field label="Verkäufer / Rechnungsaussteller">
                    <input
                      value={fields.vendor}
                      placeholder="Name laut Rechnung"
                      onChange={(e) => update("vendor", e.target.value)}
                    />
                    {evidence("vendor")}
                  </Field>
                  <Field label="Rechnungsbetrag">
                    <input
                      value={fields.amount}
                      placeholder="Leer = unbekannt"
                      inputMode="decimal"
                      pattern="-?[0-9]+([,.][0-9]{1,2})?"
                      onChange={(e) => update("amount", e.target.value)}
                    />
                    {evidence("amount_cents")}
                  </Field>
                  <Field label="Währung">
                    <input
                      value={fields.currency}
                      maxLength={3}
                      pattern="[A-Z]{3}"
                      placeholder="z. B. EUR"
                      onChange={(e) =>
                        update("currency", e.target.value.toUpperCase())
                      }
                    />
                  </Field>
                  <Field label="Kilometerstand (optional)">
                    <input
                      value={fields.km}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="z. B. 58000"
                      onChange={(e) => update("km", e.target.value)}
                    />
                  </Field>
                </div>
              </>
            )}
            {withWork && (
              <>
                <h3>Verknüpfte Arbeit</h3>
                <Field label="Titel der Arbeit">
                  <input
                    value={fields.work_title}
                    required
                    placeholder="z. B. Ölfilter gewechselt"
                    onChange={(e) => update("work_title", e.target.value)}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Art der Arbeit">
                    <select
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value as WorkInput["kind"]);
                        setOperation(crypto.randomUUID());
                      }}
                    >
                      <option value="maintenance">Wartung</option>
                      <option value="repair">Reparatur</option>
                      <option value="inspection">HU / Prüfung</option>
                      <option value="modification">Umbau</option>
                      <option value="other">Andere Arbeit</option>
                    </select>
                  </Field>
                  <Field label="Datum der Arbeit (optional)">
                    <input
                      type="date"
                      value={fields.work_date}
                      onChange={(e) => update("work_date", e.target.value)}
                    />
                  </Field>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={completed}
                    onChange={(e) => {
                      setCompleted(e.target.checked);
                      setOperation(crypto.randomUUID());
                    }}
                  />{" "}
                  Arbeit wurde tatsächlich erledigt
                </label>
                <p className="muted">
                  {completed
                    ? "Wird als bestätigte Arbeit gespeichert."
                    : "Wird als geplante Arbeit gespeichert."}{" "}
                  Das Rechnungsdatum wird nicht als Arbeitsdatum übernommen.
                </p>
              </>
            )}
            <Field label="Notizen">
              <textarea
                value={fields.notes}
                rows={3}
                placeholder="Zusätzliche bestätigte Angaben"
                onChange={(e) => update("notes", e.target.value)}
              />
            </Field>
          </fieldset>
          {expense && (
            <PositionEditor
              parts={parts}
              prices={prices}
              disabled={running}
              onChange={(next, nextPrices) => {
                itemsDirty.current = true;
                setParts(next);
                setPrices(nextPrices);
                setOperation(crypto.randomUUID());
              }}
            />
          )}
        </div>
        <aside className="receipt-preview">
          <h3>Original zum Vergleichen</h3>
          {previews.length ? (
            <>
              <label className="field">
                <span>Seite</span>
                <select
                  aria-label="Belegseite"
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value))}
                >
                  {previews.map((_, i) => (
                    <option value={i} key={i}>
                      Seite {i + 1} ·{" "}
                      {rawPages[i]?.method === "ocr" ? "OCR" : "PDF-Text"}
                    </option>
                  ))}
                </select>
              </label>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                Original öffnen
              </a>
              <img
                src={previews[page]}
                alt={"Belegvorschau Seite " + (page + 1)}
              />
            </>
          ) : file && sourceUrl ? (
            <>
              <p>{file.name}</p>
              {file.type.startsWith("image/") ? (
                <img src={sourceUrl} alt="Ausgewählter Beleg" />
              ) : (
                <>
                  <p className="muted">
                    Die Seitenvorschau erscheint nach dem Auslesen.
                  </p>
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                    PDF öffnen
                  </a>
                </>
              )}
            </>
          ) : (
            <p className="muted">Noch kein Beleg ausgewählt.</p>
          )}
          {rawPages.length > 0 && (
            <details>
              <summary>Erkannten Text ansehen</summary>
              <pre>
                {rawPages
                  .map((p) => "Seite " + p.page + "\n" + p.text)
                  .join("\n\n")}
              </pre>
            </details>
          )}
        </aside>
      </div>
      <div className="receipt-save">
        <button
          className="button primary"
          disabled={running || processing || !supported || !category}
        >
          <Check size={18} />
          {running ? (
            <>{progress || "Wird gespeichert …"}</>
          ) : (
            "Geprüft speichern"
          )}
        </button>
        <span className="muted">
          {expense && withWork
            ? "Für die Kosten zählt nur der Rechnungsbetrag."
            : file
              ? "Original und bestätigte Angaben speichern."
              : "Bestätigte Angaben speichern."}
        </span>
      </div>
    </form>
  );
}
