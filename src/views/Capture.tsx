import { ChevronRight, Download } from "lucide-react";
import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { AssistantDraft, AssistantSeed } from "../../shared/assistant";
import { validateCapture } from "../../shared/capture";
import {
  autoMatch,
  blankPackage,
  clone,
  duplicates,
  parseImport,
  validatePackage,
} from "../../shared/logic";
import type {
  CaptureMetadata,
  ExpenseInput,
  ImportPackage,
  State,
  WorkInput,
} from "../../shared/types";
import { categories } from "../../shared/types";
import { vehicleName } from "../../shared/vehicle";
import { prepareFile, type Adapter } from "../adapter";
import { download } from "../backup";
import "../cloudflare.css";
import { Field, captureExample } from "../Field";
import { ExpenseFields, WorkFields } from "../DraftFields";
import "../login.css";
import {
  Btn,
  cents,
  date,
  docTypes,
  money,
  number,
  workKinds,
  type Runner,
} from "../view-support";
import { WorkshopSelect } from "../Workshops";
const ReceiptCapture = lazy(() =>
  import("../ReceiptCapture").then((m) => ({ default: m.ReceiptCapture })),
);
export function Capture({
  s,
  adapter,
  onPreview,
  run,
  busy,
  supported,
  onReceiptDone,
  onAssistant,
  onAssistantContext,
}: {
  s: State;
  adapter: Adapter;
  onPreview: (p: ImportPackage, capture?: CaptureMetadata) => void;
  run: Runner;
  busy: boolean;
  supported: boolean;
  onReceiptDone: () => Promise<void>;
  onAssistant?: (seed?: AssistantSeed) => void;
  onAssistantContext?: (factory: (() => AssistantSeed) | null) => void;
}) {
  const [mode, setMode] = useState<"manual" | "json" | "ai" | "receipt">(
      "receipt",
    ),
    [text, setText] = useState(""),
    [kind, setKind] = useState("expense"),
    [cat, setCat] = useState<string>(categories[0]),
    [manualPerformed, setManualPerformed] =
      useState<WorkInput["performed_by"]>("unknown"),
    [manualWorkshop, setManualWorkshop] = useState("");
  const manualForm = useRef<HTMLFormElement>(null),
    touched = useRef(new Set<string>());
  const buildManual = (f: FormData): AssistantDraft => {
    const p = blankPackage(),
      title =
        String(f.get("title") ?? "").trim() ||
        (kind === "work" ? "Neue Arbeit" : "Neue Ausgabe"),
      d = String(f.get("date") ?? "") || null,
      km = number(String(f.get("km") ?? ""));
    p.vehicle_label = vehicleName(s.Vehicles[0]) || null;
    if (kind === "expense") {
      const expense: ExpenseInput = {
        ref: "expense1",
        title,
        category: cat as any,
        date: d,
        odometer_km: km,
        amount_cents: cents(String(f.get("amount"))),
        currency: String(f.get("currency")) || null,
        vendor: String(f.get("vendor")) || null,
        invoice_number: String(f.get("invoice")) || null,
        document_refs: [],
        notes: String(f.get("notes")) || null,
        cashflow_type: f.get("income") ? "income" : "expense",
      };
      if (cat === "Tanken")
        expense.fuel = {
          liters: number(String(f.get("liters"))),
          fuel_type: String(f.get("fuel_type")) || null,
          full_tank:
            f.get("tank") === "unknown" ? null : f.get("tank") === "full",
          missed_previous_fillup:
            f.get("missed") === "unknown" ? null : f.get("missed") === "yes",
          station_name: String(f.get("station")) || null,
        };
      if (f.get("part_description"))
        expense.items = [
          {
            description: String(f.get("part_description")),
            part_number: String(f.get("part_number")) || null,
            quantity: number(String(f.get("quantity"))),
            unit: String(f.get("unit")) || null,
            specification: String(f.get("spec")) || null,
          },
        ];
      p.expenses.push(expense);
    } else if (kind === "work") {
      const w: WorkInput = {
        ref: "work1",
        title,
        kind: String(f.get("work_kind")) as any,
        status: String(f.get("status")) as any,
        date: d,
        odometer_km: km,
        performed_by: String(f.get("performed")) as any,
        description: String(f.get("notes")) || null,
        expense_refs: [],
        document_refs: [],
        estimated_cost_cents: cents(String(f.get("estimate") ?? "")),
      };
      if (f.get("part_description"))
        w.parts = [
          {
            description: String(f.get("part_description")),
            part_number: String(f.get("part_number")) || null,
            quantity: number(String(f.get("quantity"))),
            unit: String(f.get("unit")) || null,
            specification: String(f.get("spec")) || null,
          },
        ];
      if (w.kind === "modification")
        w.modification_details = {
          manufacturer: String(f.get("manufacturer")) || null,
          part_number: String(f.get("part_number")) || null,
          approval_number: String(f.get("approval")) || null,
          status: String(f.get("mod_status")) as any,
        };
      p.work.push(w);
    } else {
      p.documents.push({
        ref: "doc1",
        title,
        source_filename: null,
        document_type: String(f.get("doctype")) as any,
      });
    }
    return {
      package: p,
      capture:
        kind === "work" && manualWorkshop
          ? { workshops_by_work_ref: { work1: manualWorkshop } }
          : {},
    };
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    run(async () => {
      const draft = buildManual(data);
      onPreview(draft.package, draft.capture);
    });
  };
  function manualSeed(): AssistantSeed {
    if (!manualForm.current)
      throw Error("Bitte zuerst das manuelle Formular öffnen.");
    const data = new FormData(manualForm.current);
    const draft = buildManual(data),
      table = kind === "work" ? "work" : "expenses",
      ref = kind === "work" ? "work1" : "expense1";
    const fields: Record<string, string> = {
      title: "title",
      date: "date",
      km: "odometer_km",
      amount: "amount_cents",
      currency: "currency",
      vendor: "vendor",
      invoice: "invoice_number",
      notes: kind === "work" ? "description" : "notes",
      income: "cashflow_type",
      work_kind: "kind",
      status: "status",
      performed: "performed_by",
      estimate: "estimated_cost_cents",
      category: "category",
      liters: "fuel",
      fuel_type: "fuel",
      tank: "fuel",
      missed: "fuel",
      station: "fuel",
      part_description: kind === "work" ? "parts" : "items",
      part_number: kind === "work" ? "parts" : "items",
      quantity: kind === "work" ? "parts" : "items",
      unit: kind === "work" ? "parts" : "items",
      spec: kind === "work" ? "parts" : "items",
      manufacturer: "modification_details",
      approval: "modification_details",
      mod_status: "modification_details",
    };
    return {
      draft,
      protectedFields: Array.from(touched.current).flatMap((name) =>
        fields[name] ? [`${table}.${ref}.${fields[name]}`] : [],
      ),
    };
  }
  function assistManual() {
    void run(async () => onAssistant?.(manualSeed()));
  }
  useEffect(() => {
    onAssistantContext?.(
      mode === "manual" && kind !== "document" ? manualSeed : null,
    );
    return () => onAssistantContext?.(null);
  });
  return (
    <section
      className={"panel capture" + (mode === "receipt" ? " capture-wide" : "")}
    >
      <div className="segmented">
        <button
          className={mode === "receipt" ? "selected" : ""}
          onClick={() => setMode("receipt")}
        >
          Beleg einlesen
        </button>
        <button
          className={mode === "manual" ? "selected" : ""}
          onClick={() => setMode("manual")}
        >
          Manuell
        </button>
        <button
          className={mode === "ai" ? "selected" : ""}
          onClick={() => {
            if (mode === "manual" && kind !== "document") {
              assistManual();
              return;
            }
            setMode("ai");
            onAssistant?.();
          }}
        >
          Mit KI
        </button>
      </div>
      {mode === "receipt" ? (
        <Suspense fallback={<p role="status">Belegerfassung wird geladen …</p>}>
          <ReceiptCapture
            s={s}
            adapter={adapter}
            run={run}
            onDone={onReceiptDone}
            busy={busy}
            supported={supported}
          />
        </Suspense>
      ) : mode === "ai" ? (
        <>
          <h2>Beschreiben oder diktieren</h2>
          <p>
            Arbeit, Vorhaben oder Ausgabe als Entwurf vorbereiten und
            anschließend prüfen.
          </p>
          <button
            className="button primary"
            type="button"
            onClick={() => onAssistant?.()}
          >
            Assistent öffnen
          </button>
        </>
      ) : mode === "json" ? (
        <>
          <h2>JSON importieren</h2>
          <p className="muted">
            Füge ein Paket im JSON-Vertrag v1 ein. Im nächsten Schritt prüfst du
            Einträge und ordnest Originaldateien zu.
          </p>
          <Field label="JSON-Paket">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={13}
              placeholder="JSON hier einfügen …"
              spellCheck={false}
            />
          </Field>
          <div className="button-group">
            <Btn
              primary
              onClick={() => run(async () => onPreview(parseImport(text)))}
            >
              Vorschau öffnen
            </Btn>
            <Field label="Oder JSON-Datei auswählen">
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    run(async () => {
                      if (file.size > 1024 * 1024)
                        throw Error("JSON-Datei größer als 1 MiB.");
                      setText(await file.text());
                    });
                }}
              />
            </Field>
            <Btn
              onClick={() =>
                download(text, "Fahrzeugakte-Entwurf.json", "application/json")
              }
            >
              <Download size={16} /> Entwurf herunterladen
            </Btn>
          </div>
        </>
      ) : (
        <>
          <h2>Was möchtest du erfassen?</h2>
          <form
            onSubmit={submit}
            ref={manualForm}
            onChangeCapture={(e) => {
              const el = e.target as HTMLInputElement;
              if (el.name) touched.current.add(el.name);
            }}
          >
            {kind !== "document" && (
              <button type="button" className="button" onClick={assistManual}>
                Mit KI ergänzen
              </button>
            )}
            <Field label="Eintragsart">
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="expense">Ausgabe / Einnahme</option>
                <option value="work">Arbeit / Vorhaben</option>
                <option value="document">Nur Dokument</option>
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Titel">
                <input
                  name="title"
                  required
                  maxLength={500}
                  placeholder={captureExample(kind, cat)}
                />
              </Field>
              {kind === "expense" && (
                <Field label="Kategorie">
                  <select
                    name="category"
                    value={cat}
                    onChange={(e) => setCat(e.target.value)}
                  >
                    {categories.slice(0, 3).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                    <optgroup label="Weitere Kategorien">
                      {categories.slice(3).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </optgroup>
                  </select>
                </Field>
              )}
              {kind !== "document" && (
                <>
                  <Field
                    label={
                      kind === "work"
                        ? "Tatsächliches Arbeitsdatum (optional)"
                        : "Datum (optional)"
                    }
                    hint="Unbekannte historische Angaben leer lassen."
                  >
                    <input type="date" name="date" />
                  </Field>
                  <Field label="Kilometerstand (optional)">
                    <input
                      name="km"
                      inputMode="decimal"
                      placeholder="Unbekannt"
                    />
                  </Field>
                </>
              )}
              {kind === "expense" && (
                <>
                  <Field
                    label="Betrag (optional)"
                    hint="Leer = unbekannt. 0 = ausdrücklich kostenfrei. Erstattungen negativ."
                  >
                    <input
                      name="amount"
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Währung">
                    <input
                      name="currency"
                      defaultValue="EUR"
                      maxLength={3}
                      pattern="[A-Z]{3}"
                    />
                  </Field>
                </>
              )}
              {kind === "work" && (
                <>
                  <Field label="Art der Arbeit">
                    <select name="work_kind">
                      {Object.entries(workKinds).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select name="status">
                      <option value="completed">Bestätigt durchgeführt</option>
                      <option value="planned">Geplant</option>
                    </select>
                  </Field>
                  <Field label="Durchgeführt von">
                    <select
                      name="performed"
                      value={manualPerformed}
                      onChange={(e) => {
                        const value = e.target
                          .value as WorkInput["performed_by"];
                        setManualPerformed(value);
                        setManualWorkshop(
                          value === "self"
                            ? (s.Settings[0].self_workshop_id ?? "")
                            : "",
                        );
                      }}
                    >
                      <option value="unknown">Noch offen</option>
                      <option value="self">Eigenleistung</option>
                      <option value="workshop">Werkstatt</option>
                    </select>
                  </Field>
                  <WorkshopSelect
                    settings={s.Settings[0]}
                    value={manualWorkshop}
                    onChange={setManualWorkshop}
                    disabled={!supported}
                  />
                </>
              )}
              {kind === "document" && (
                <Field label="Dokumenttyp">
                  <select name="doctype">
                    {Object.entries(docTypes).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {kind === "expense" && cat === "Tanken" && (
              <fieldset>
                <legend>Tankvorgang</legend>
                <div className="form-grid">
                  <Field label="Liter">
                    <input name="liters" inputMode="decimal" />
                  </Field>
                  <Field label="Kraftstoff">
                    <select name="fuel_type">
                      <option value="">Unbekannt</option>
                      {["E5", "E10", "Diesel", "Andere"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Betankung">
                    <select name="tank">
                      <option value="unknown">Unbekannt</option>
                      <option value="full">Vollgetankt</option>
                      <option value="partial">Teilbetankung</option>
                    </select>
                  </Field>
                  <Field label="Vorheriger Tankvorgang ausgelassen?">
                    <select name="missed">
                      <option value="unknown">Unbekannt</option>
                      <option value="no">Nein, alle erfasst</option>
                      <option value="yes">Ja, Lücke vorhanden</option>
                    </select>
                  </Field>
                  <Field label="Tankstelle (optional)">
                    <input name="station" />
                  </Field>
                </div>
              </fieldset>
            )}
            {kind !== "document" && (
              <details>
                <summary>Weitere Details</summary>
                <div className="form-grid">
                  {kind === "expense" ? (
                    <>
                      <Field label="Händler / Werkstatt">
                        <input name="vendor" />
                      </Field>
                      <Field label="Rechnungsnummer">
                        <input name="invoice" />
                      </Field>
                      <label className="check">
                        <input type="checkbox" name="income" /> Einnahme, z. B.
                        Fahrzeugverkauf
                      </label>
                    </>
                  ) : (
                    <>
                      <Field label="Geschätzte Kosten (nur Planung)">
                        <input name="estimate" inputMode="decimal" />
                      </Field>
                      <Field label="Hersteller (Umbau)">
                        <input name="manufacturer" />
                      </Field>
                      <Field label="Genehmigungsnummer (Umbau)">
                        <input name="approval" />
                      </Field>
                      <Field label="Bestätigter Ein-/Ausbaustatus">
                        <select name="mod_status">
                          <option value="planned">Geplant</option>
                          <option value="installed">Eingebaut</option>
                          <option value="removed">Ausgebaut</option>
                        </select>
                      </Field>
                    </>
                  )}
                  <Field label="Teil / Betriebsstoff">
                    <input name="part_description" />
                  </Field>
                  <Field label="Teilenummer">
                    <input name="part_number" />
                  </Field>
                  <Field label="Menge">
                    <input name="quantity" inputMode="decimal" />
                  </Field>
                  <Field label="Einheit">
                    <input name="unit" />
                  </Field>
                  <Field label="Bestätigte Freigabe / Spezifikation">
                    <input name="spec" />
                  </Field>
                  <Field label="Notizen">
                    <textarea name="notes" rows={3} />
                  </Field>
                </div>
              </details>
            )}
            <p className="muted">
              Originale und bereits bezahlte Rechnungen verknüpfst du in der
              Vorschau. Eine Arbeit erzeugt keine zusätzliche Ausgabe.
            </p>
            <Btn type="submit" primary>
              Weiter zur Vorschau <ChevronRight size={16} />
            </Btn>
          </form>
        </>
      )}
      <details className="capture-advanced">
        <summary>Weitere Importmöglichkeiten</summary>
        <button
          className="button"
          type="button"
          onClick={() => setMode("json")}
        >
          JSON importieren
        </button>
      </details>
    </section>
  );
}
export function ImportPreview({
  initial,
  initialCapture,
  initialLinks,
  captureSupported,
  s,
  adapter,
  run,
  busy,
  onDone,
  onBack,
  setProgress,
  onAssistant,
  onAssistantContext,
}: {
  initial: ImportPackage;
  initialCapture?: CaptureMetadata;
  initialLinks?: Record<string, string[]>;
  captureSupported: boolean;
  s: State;
  adapter: Adapter | null;
  run: Runner;
  busy: boolean;
  onDone: (reused?: boolean) => Promise<void>;
  onBack: () => void;
  setProgress: (x: string) => void;
  onAssistant?: (seed?: AssistantSeed) => void;
  onAssistantContext?: (factory: (() => AssistantSeed) | null) => void;
}) {
  const [capture, setCapture] = useState<CaptureMetadata>(initialCapture ?? {});
  const [p, setP] = useState(clone(initial)),
    [raw, setRaw] = useState(JSON.stringify(initial, null, 2)),
    [files, setFiles] = useState<File[]>([]),
    [mapping, setMapping] = useState<Record<string, number | null>>({}),
    [existingDocs, setExistingDocs] = useState<Record<string, string>>({}),
    [allowMissing, setAllowMissing] = useState(false),
    [confirmRules, setConfirmRules] = useState(false),
    [reason, setReason] = useState(""),
    [links, setLinks] = useState<Record<string, string[]>>(
      clone(initialLinks ?? {}),
    ),
    [operation, setOperation] = useState(crypto.randomUUID()),
    [frozen, setFrozen] = useState(false),
    [hashes, setHashes] = useState<Record<string, string>>({});
  useEffect(() => {
    onAssistantContext?.(
      !p.documents.length && !p.reminders.length
        ? () => {
            if (frozen)
              throw Error(
                "Bitte den unbestätigten Speichervorgang zuerst prüfen.",
              );
            return { draft: { package: p, capture }, links };
          }
        : null,
    );
    return () => onAssistantContext?.(null);
  });
  function change(next: ImportPackage) {
    if (frozen) return;
    setP(next);
    setRaw(JSON.stringify(next, null, 2));
    setOperation(crypto.randomUUID());
  }
  async function selectFiles(input: File[]) {
    const prepared = await Promise.all(input.map(prepareFile));
    setFiles(input);
    setMapping(autoMatch(p.documents, input));
    setHashes(
      Object.fromEntries(prepared.map((f, i) => [String(i), f.sha256])),
    );
    setOperation(crypto.randomUUID());
  }
  const conflicts = duplicates(
    s,
    p,
    Object.fromEntries(
      p.documents.flatMap((d) =>
        mapping[d.ref] != null ? [[d.ref, hashes[String(mapping[d.ref])]]] : [],
      ),
    ),
  );
  const save = () =>
    run(async () => {
      if (!adapter) throw Error("Bitte anmelden.");
      validatePackage(p);
      validateCapture(capture, p, s);
      if (Object.keys(capture).length && !captureSupported)
        throw Error("Die benötigte Serverfunktion fehlt.");
      if (p.reminders.length && !confirmRules)
        throw Error("Bitte die neuen Erinnerungsregeln bestätigen.");
      const missing = p.documents.filter(
        (d) => mapping[d.ref] == null && !existingDocs[d.ref],
      );
      if (missing.length && !allowMissing)
        throw Error(
          "Noch fehlende Originale bitte zuordnen oder bewusst als fehlend bestätigen.",
        );
      setFrozen(true);
      const docs: Record<string, string | null> = {};
      let i = 0;
      for (const d of p.documents) {
        const index = mapping[d.ref];
        if (existingDocs[d.ref]) {
          docs[d.ref] = existingDocs[d.ref];
          continue;
        }
        if (index == null) {
          docs[d.ref] = null;
          continue;
        }
        setProgress(
          `Originale prüfen und hochladen: ${++i} von ${p.documents.length}`,
        );
        const f = await prepareFile(files[index]);
        const u = await adapter.call("upload", {
          operation_id: operation,
          file: f,
        });
        docs[d.ref] = u.id;
      }
      setProgress("Einträge gemeinsam speichern und bestätigen …");
      const result = await adapter.call("commit", {
        operation_id: operation,
        package: p,
        documents: docs,
        allow_missing: allowMissing,
        confirm_reminders: confirmRules,
        duplicate_override_reason: reason || null,
        links,
        ...(Object.keys(capture).length ? { capture } : {}),
      });
      await onDone(result.reused === true);
    });
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Entwurf prüfen</h2>
        {onAssistant && !p.documents.length && !p.reminders.length && (
          <button
            className="button"
            type="button"
            disabled={frozen || busy}
            onClick={() =>
              onAssistant({ draft: { package: p, capture }, links })
            }
          >
            Mit KI ergänzen
          </button>
        )}
        <Btn onClick={onBack} disabled={frozen}>
          Zurück
        </Btn>
      </div>
      <p>
        {p.expenses.length} Ausgaben · {p.work.length} Arbeiten ·{" "}
        {p.documents.length} Dokumente · {p.reminders.length} Regeln
      </p>
      {p.warnings.length > 0 && (
        <div className="banner warning">
          <ul>
            {p.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <fieldset disabled={frozen}>
        <legend>Einträge vor dem Speichern bearbeiten</legend>
        {p.expenses.map((e, i) => (
          <div className="review-entry" key={e.ref}>
            <div className="section-heading">
              <strong>Ausgabe {i + 1}</strong>
              <Btn
                onClick={() => {
                  const q = clone(p);
                  q.expenses.splice(i, 1);
                  q.work.forEach(
                    (w) =>
                      (w.expense_refs = w.expense_refs.filter(
                        (r) => r !== e.ref,
                      )),
                  );
                  change(q);
                  setCapture((c) => {
                    const next = clone(c);
                    delete next.prices_by_expense_ref?.[e.ref];
                    return next;
                  });
                }}
              >
                Ausgabe aus Entwurf entfernen
              </Btn>
            </div>
            <ExpenseFields
              value={e}
              onChange={(next) => {
                const q = clone(p);
                q.expenses[i] = next;
                change(q);
              }}
              prices={capture.prices_by_expense_ref?.[e.ref] ?? []}
              onPrices={(parts, prices) => {
                const q = clone(p);
                q.expenses[i].items = parts;
                change(q);
                setCapture((c) => ({
                  ...c,
                  prices_by_expense_ref: {
                    ...c.prices_by_expense_ref,
                    [e.ref]: prices,
                  },
                }));
              }}
            />
          </div>
        ))}
        {p.work.map((w, i) => (
          <div className="review-entry" key={w.ref}>
            <div className="section-heading">
              <strong>Arbeit {i + 1}</strong>
              <Btn
                onClick={() => {
                  const q = clone(p);
                  q.work.splice(i, 1);
                  q.reminders.forEach((r) => {
                    if (r.basis_work_ref === w.ref) r.basis_work_ref = null;
                  });
                  change(q);
                  setCapture((c) => {
                    const next = clone(c);
                    delete next.workshops_by_work_ref?.[w.ref];
                    return next;
                  });
                  setLinks((c) => {
                    const next = { ...c };
                    delete next[w.ref];
                    return next;
                  });
                }}
              >
                Arbeit aus Entwurf entfernen
              </Btn>
            </div>
            <WorkFields
              value={w}
              onChange={(next) => {
                const q = clone(p);
                q.work[i] = next;
                change(q);
                if (next.performed_by === "self" && w.performed_by !== "self")
                  setCapture((c) => ({
                    ...c,
                    workshops_by_work_ref: {
                      ...c.workshops_by_work_ref,
                      [w.ref]: s.Settings[0].self_workshop_id ?? null,
                    },
                  }));
              }}
            />
            <div className="form-grid">
              <Field label="Ausgaben aus diesem Entwurf verknüpfen">
                <select
                  multiple
                  value={w.expense_refs}
                  onChange={(x) => {
                    const q = clone(p);
                    q.work[i].expense_refs = Array.from(
                      x.target.selectedOptions,
                      (o) => o.value,
                    );
                    change(q);
                  }}
                >
                  {p.expenses.map((e) => (
                    <option key={e.ref} value={e.ref}>
                      {e.title} · {money(e.amount_cents, e.currency)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bereits bezahlte Ausgabe verknüpfen">
                <select
                  multiple
                  value={links[w.ref] ?? []}
                  onChange={(x) => {
                    setLinks({
                      ...links,
                      [w.ref]: Array.from(
                        x.target.selectedOptions,
                        (o) => o.value,
                      ),
                    });
                    setOperation(crypto.randomUUID());
                  }}
                >
                  {s.Expenses.filter((e) => !e.voided).map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.title} · {money(e.amount_cents, e.currency)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <WorkshopSelect
              settings={s.Settings[0]}
              value={capture.workshops_by_work_ref?.[w.ref] ?? ""}
              disabled={!captureSupported}
              onChange={(value) => {
                setCapture({
                  ...capture,
                  workshops_by_work_ref: {
                    ...capture.workshops_by_work_ref,
                    [w.ref]: value || null,
                  },
                });
                setOperation(crypto.randomUUID());
              }}
            />
            <small>
              {w.status === "planned" ? "Geplant" : "Bestätigt durchgeführt"} ·{" "}
              {w.expense_refs.length} Rechnungen aus diesem Paket. Bestehende
              Rechnung auswählen, wenn nur der Einbau nachgetragen wird.
            </small>
          </div>
        ))}
        <details>
          <summary>Alle importierten Angaben bearbeiten</summary>
          <p className="muted">
            Erweiterte JSON-Ansicht für Positionen, Material und Regeln.
            Änderungen mit „Übernehmen“ prüfen.
          </p>
          <textarea
            aria-label="Importpaket als JSON"
            placeholder="Vollständiges JSON-Paket nach Vertrag v1"
            rows={16}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
          />
          <Btn onClick={() => run(async () => change(parseImport(raw)))}>
            Änderungen übernehmen
          </Btn>
        </details>
        <h3>Originaldateien zuordnen</h3>
        <p className="muted">
          PDF, JPEG, PNG oder WebP · maximal 4 MiB je Datei, höchstens 100
          Dateien im Paket. Originale bleiben unverändert. Gleiche Inhalte
          werden wiederverwendet.
        </p>
        <input
          aria-label="Originaldateien auswählen"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            run(async () => {
              if (list.length > 100)
                throw Error("Bitte höchstens 100 Dateien auswählen.");
              await selectFiles(list);
            });
          }}
        />
        {p.documents.map((d) => (
          <div className="document-map" key={d.ref}>
            <strong>{d.title}</strong>
            <small>
              Beobachteter Name: {d.source_filename ?? "unbekannt"}
              {d.page_numbers ? " · Seiten " + d.page_numbers.join(", ") : ""}
            </small>
            <div className="form-grid">
              <Field label="Ausgewählte Originaldatei">
                <select
                  value={mapping[d.ref] ?? ""}
                  onChange={(e) => {
                    setMapping({
                      ...mapping,
                      [d.ref]:
                        e.target.value === "" ? null : Number(e.target.value),
                    });
                    setExistingDocs({ ...existingDocs, [d.ref]: "" });
                    setOperation(crypto.randomUUID());
                  }}
                >
                  <option value="">Nicht zugeordnet · Beleg fehlt</option>
                  {files.map((f, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {f.name} · {(f.size / 1024).toFixed(0)} KB ·{" "}
                      {hashes[i]?.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Oder vorhandenes Original">
                <select
                  value={existingDocs[d.ref] ?? ""}
                  onChange={(e) => {
                    setExistingDocs({
                      ...existingDocs,
                      [d.ref]: e.target.value,
                    });
                    setMapping({ ...mapping, [d.ref]: null });
                    setOperation(crypto.randomUUID());
                  }}
                >
                  <option value="">Keines</option>
                  {s.Documents.filter((x) => !x.missing).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title} · {x.source_filename}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {files.filter((f) => f.name === d.source_filename).length > 1 && (
              <p className="warning-text">
                Mehrere Dateien mit diesem Namen. Bitte anhand Inhalt und
                Prüfsumme bewusst zuordnen.
              </p>
            )}
          </div>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={allowMissing}
            onChange={(e) => setAllowMissing(e.target.checked)}
          />{" "}
          Ich bestätige bewusst fehlende Originale. Diese bleiben als „Beleg
          fehlt“ gekennzeichnet.
        </label>
        {p.reminders.length > 0 && (
          <>
            <h3>Neue Fälligkeiten</h3>
            {p.reminders.map((r) => (
              <p key={r.ref}>
                {r.title} · {date(r.due_date)} / {r.due_odometer_km ?? "offen"}{" "}
                km · E-Mail:{" "}
                {r.email_enabled === true
                  ? "angefordert"
                  : r.email_enabled === false
                    ? "aus"
                    : "offen, bleibt aus"}
              </p>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={confirmRules}
                onChange={(e) => setConfirmRules(e.target.checked)}
              />{" "}
              Diese neuen Wartungsregeln sind geprüft und bestätigt.
            </label>
          </>
        )}
        {conflicts.length > 0 && (
          <div className="banner warning">
            Mögliche bereits erfasste Rechnung:{" "}
            {conflicts.map((x) => x.title).join(", ")}. Vor erneutem Buchen
            prüfen.
          </div>
        )}
        <Field label="Begründung für eine bewusst getrennte ähnliche Buchung (optional)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="z. B. Zwei getrennte Rechnungen mit unterschiedlichen Rechnungsnummern"
          />
        </Field>
      </fieldset>
      {frozen && (
        <div className="banner warning">
          <div>
            Der Speichervorgang ist festgelegt. Falls keine Bestätigung ankam,
            „Speichern wiederholen“ verwenden. Dateiuploads und Buchungen werden
            wiederverwendet.
            <Btn
              onClick={() =>
                run(async () => {
                  if (!adapter) throw Error("Bitte erneut verbinden.");
                  const fresh = await adapter.call("read");
                  if (
                    fresh.state.Operations.some(
                      (o: any) =>
                        o.id === operation && o.status === "committed",
                    )
                  )
                    await onDone();
                  else {
                    setFrozen(false);
                    setOperation(crypto.randomUUID());
                  }
                })
              }
            >
              Vorgang prüfen und Bearbeitung freigeben
            </Btn>
          </div>
        </div>
      )}
      <div className="button-group">
        <Btn primary disabled={busy} onClick={save}>
          {frozen ? "Speichern wiederholen" : "Geprüft speichern"}
        </Btn>
        <Btn
          onClick={() =>
            download(
              JSON.stringify(p, null, 2),
              "Fahrzeugakte-Entwurf.json",
              "application/json",
            )
          }
        >
          <Download size={16} /> Entwurf sichern
        </Btn>
      </div>
    </section>
  );
}
