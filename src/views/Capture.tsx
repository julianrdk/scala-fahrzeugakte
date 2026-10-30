import {
  FilePlus2,
  FileSearch,
  Paperclip,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AssistantDraft,
  AssistantSeed,
  DraftConflict,
} from "../../shared/assistant";
import { validateCapture } from "../../shared/capture";
import {
  blankPackage,
  clone,
  duplicates,
  validatePackage,
} from "../../shared/logic";
import { parseReceipt, type ReceiptSuggestion } from "../../shared/receipt";
import type {
  CaptureMetadata,
  ImportPackage,
  State,
  WorkInput,
} from "../../shared/types";
import { prepareFile, type Adapter } from "../adapter";
import {
  applyEntryAssistant,
  entrySeed,
  initialEntry,
  newExpense,
  newWork,
} from "../entry-draft";
import { ExpenseFields, WorkFields } from "../DraftFields";
import { Field, SuggestedFields } from "../Field";
import { display, fieldNames } from "../draft-labels";
import { WorkshopSelect } from "../Workshops";
import { docTypes, money, date, type Runner } from "../view-support";
import { ServiceError } from "../CloudflareAdapter";
import "../capture.css";
import "../entry.css";

export type EntryApply = (
  draft: AssistantDraft,
  links?: Record<string, string[]>,
) => void;
type Props = {
  s: State;
  adapter: Adapter;
  busy: boolean;
  supported: boolean;
  run: Runner;
  initial?: ImportPackage;
  initialCapture?: CaptureMetadata;
  initialLinks?: Record<string, string[]>;
  onSaved: (reused?: boolean) => Promise<void>;
  onAssistant?: (seed?: AssistantSeed) => void;
  onAssistantContext?: (factory: (() => AssistantSeed) | null) => void;
  onAssistantApply?: (apply: EntryApply | null) => void;
};
export function Capture({
  s,
  adapter,
  busy,
  supported,
  run,
  initial,
  initialCapture,
  initialLinks,
  onSaved,
  onAssistant,
  onAssistantContext,
  onAssistantApply,
}: Props) {
  const [draft, setDraft] = useState<AssistantDraft>(() =>
      initial
        ? { package: clone(initial), capture: clone(initialCapture ?? {}) }
        : initialEntry(),
    ),
    [links, setLinks] = useState<Record<string, string[]>>(() =>
      clone(initialLinks ?? {}),
    ),
    [files, setFiles] = useState<Record<string, File>>({}),
    [fileHashes, setFileHashes] = useState<Record<string, string>>({}),
    [fileUrls, setFileUrls] = useState<Record<string, string>>({}),
    [existingDocs, setExistingDocs] = useState<Record<string, string>>({}),
    [kind, setKind] = useState<"work" | "expense" | "document">(() =>
      initial?.work.length
        ? "work"
        : initial?.expenses.length
          ? "expense"
          : initial?.documents.length
            ? "document"
            : "work",
    ),
    [saving, setSaving] = useState(false),
    [frozen, setFrozen] = useState(false),
    [choosing, setChoosing] = useState(false),
    [allowMissing, setAllowMissing] = useState(false),
    [confirmRules, setConfirmRules] = useState(false),
    [reason, setReason] = useState(""),
    [duplicateReview, setDuplicateReview] = useState(false),
    [readError, setReadError] = useState(""),
    [progress, setProgress] = useState(""),
    [reading, setReading] = useState(false),
    [ocrRef, setOcrRef] = useState(""),
    [forceOcr, setForceOcr] = useState(false),
    [previews, setPreviews] = useState<string[]>([]),
    [page, setPage] = useState(0),
    [warnings, setWarnings] = useState<string[]>([]),
    [conflicts, setConflicts] = useState<DraftConflict[]>([]),
    [suggested, setSuggested] = useState(false),
    [suggestions, setSuggestions] = useState<string[]>([]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const touched = useRef(new Set<string>()),
    baseline = useRef<AssistantDraft | null>(null),
    latest = useRef({ draft, links, frozen, saving }),
    operation = useRef(crypto.randomUUID()),
    uploaded = useRef<Record<string, string>>({}),
    saveLock = useRef(false),
    alive = useRef(true),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    previewUrls = useRef<string[]>([]),
    previousInitial = useRef(initial),
    host = useRef<HTMLElement>(null);
  latest.current = { draft, links, frozen, saving };
  const p = draft.package,
    locked = busy || saving || frozen || choosing;
  function changed(next: AssistantDraft) {
    if (latest.current.frozen || saveLock.current) return;
    operation.current = crypto.randomUUID();
    uploaded.current = {};
    latest.current.draft = next;
    setDraft(next);
  }
  useEffect(() => {
    if (initial === previousInitial.current) return;
    previousInitial.current = initial;
    if (!initial || latest.current.frozen) return;
    setDraft({ package: clone(initial), capture: clone(initialCapture ?? {}) });
    setLinks(clone(initialLinks ?? {}));
    touched.current.clear();
    operation.current = crypto.randomUUID();
    uploaded.current = {};
    setKind(
      initial.work.length
        ? "work"
        : initial.expenses.length
          ? "expense"
          : "document",
    );
  }, [initial, initialCapture, initialLinks]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      controller.current?.abort();
      previewUrls.current.forEach(URL.revokeObjectURL);
    };
  }, []);
  useEffect(() => {
    const urls = Object.fromEntries(
      Object.entries(files).map(([ref, file]) => [
        ref,
        URL.createObjectURL(file),
      ]),
    );
    setFileUrls(urls);
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [files]);
  function seed(): AssistantSeed {
    const current = latest.current;
    if (current.frozen || current.saving)
      throw Error("Bitte den unbestätigten Speichervorgang zuerst prüfen.");
    if (!validControls()) throw Error("Bitte die markierten Felder prüfen.");
    const result = entrySeed(current.draft, touched.current);
    baseline.current = clone(current.draft);
    return { ...result, links: clone(current.links) };
  }
  useEffect(() => {
    onAssistantContext?.(seed);
    return () => onAssistantContext?.(null);
  }, [onAssistantContext]);
  useEffect(() => {
    onAssistantApply?.((incoming, newLinks) => {
      if (latest.current.frozen || latest.current.saving)
        throw Error("Speichervorgang noch nicht bestätigt.");
      const merged = applyEntryAssistant(
        latest.current.draft,
        incoming,
        baseline.current,
      );
      changed(merged.draft);
      setConflicts(merged.conflicts);
      setLinks((old) =>
        Object.fromEntries(
          Object.entries({ ...newLinks, ...old }).filter(([ref]) =>
            merged.draft.package.work.some((work) => work.ref === ref),
          ),
        ),
      );
      setKind(
        merged.draft.package.work.length
          ? "work"
          : merged.draft.package.expenses.length
            ? "expense"
            : "document",
      );
    });
    return () => onAssistantApply?.(null);
  }, [onAssistantApply]);
  function rowChange<T extends "work" | "expenses">(
    table: T,
    ref: string,
    row: ImportPackage[T][number],
  ) {
    const next = clone(latest.current.draft),
      previous = next.package[table].find((r) => r.ref === ref)!;
    for (const [key, value] of Object.entries(row))
      if (JSON.stringify(value) !== JSON.stringify((previous as any)[key]))
        touched.current.add(table + "." + ref + "." + key);
    (next.package[table] as any[]) = next.package[table].map((r) =>
      r.ref === ref ? row : r,
    );
    if (
      table === "work" &&
      (row as WorkInput).performed_by === "self" &&
      (previous as WorkInput).performed_by !== "self"
    )
      next.capture.workshops_by_work_ref = {
        ...next.capture.workshops_by_work_ref,
        [ref]: s.Settings[0].self_workshop_id ?? null,
      };
    changed(next);
  }
  function removeRow(table: "work" | "expenses", ref: string) {
    generation.current++;
    controller.current?.abort();
    setReading(false);
    setProgress("");
    const next = clone(draft);
    (next.package[table] as any[]) = next.package[table].filter(
      (r) => r.ref !== ref,
    );
    if (table === "expenses") {
      next.package.work.forEach((w) => {
        w.expense_refs = w.expense_refs.filter((r) => r !== ref);
      });
      delete next.capture.prices_by_expense_ref?.[ref];
    } else {
      delete next.capture.workshops_by_work_ref?.[ref];
      setLinks((old) => {
        const copy = { ...old };
        delete copy[ref];
        return copy;
      });
    }
    changed(next);
  }
  function addCost(work?: WorkInput) {
    const next = clone(draft),
      expense = newExpense("expense_" + crypto.randomUUID());
    expense.title = work?.title ?? "";
    expense.category = work ? "Wartung & Reparatur" : null;
    expense.odometer_km = work?.odometer_km ?? null;
    expense.document_refs = work?.document_refs ?? [];
    next.package.expenses.push(expense);
    if (work)
      next.package.work
        .find((w) => w.ref === work.ref)!
        .expense_refs.push(expense.ref);
    changed(next);
  }
  async function chooseFiles(selected: File[]) {
    if (locked || reading || !selected.length) return;
    setReadError("");
    setChoosing(true);
    try {
      if (p.documents.length + selected.length > 100)
        throw Error("Höchstens 100 Dokumente pro Eintrag.");
      const hashes = new Map<File, string>();
      for (const file of selected)
        hashes.set(file, (await prepareFile(file)).sha256);
      if (!alive.current || saveLock.current || latest.current.frozen) return;
      const next = clone(latest.current.draft),
        additions: Record<string, File> = {},
        addedHashes: Record<string, string> = {};
      for (const file of selected) {
        const missing = next.package.documents.find(
          (d) =>
            !files[d.ref] &&
            !additions[d.ref] &&
            !existingDocs[d.ref] &&
            (!d.source_filename || d.source_filename === file.name),
        );
        const ref = missing?.ref ?? "doc_" + crypto.randomUUID();
        if (missing) {
          missing.source_filename = file.name;
          if (!missing.title || missing.title === "Neues Dokument")
            missing.title = file.name;
        } else
          next.package.documents.push({
            ref,
            source_filename: file.name,
            title: file.name.replace(/\.[^.]+$/, ""),
            document_type: "invoice",
          });
        additions[ref] = file;
        addedHashes[ref] = hashes.get(file)!;
        if (next.package.work.length <= 1 && next.package.expenses.length <= 1)
          [...next.package.work, ...next.package.expenses].forEach((r) => {
            if (!r.document_refs.includes(ref)) r.document_refs.push(ref);
          });
      }
      setFiles((old) => ({ ...old, ...additions }));
      setFileHashes((old) => ({ ...old, ...addedHashes }));
      changed(next);
      setOcrRef(Object.keys(additions)[0]);
    } catch (e) {
      if (alive.current)
        setReadError(e instanceof Error ? e.message : "Datei ungültig.");
    } finally {
      if (alive.current) setChoosing(false);
    }
  }
  function applyReceipt(data: ReceiptSuggestion) {
    const next = clone(latest.current.draft);
    const suggestedPaths: string[] = [];
    let expense = next.package.expenses[0];
    const work = next.package.work[0],
      planned = work?.status === "planned";
    if (!expense && kind !== "document" && !planned) {
      expense = newExpense("expense_" + crypto.randomUUID());
      expense.category = work ? "Wartung & Reparatur" : null;
      expense.document_refs = next.package.documents.map((d) => d.ref);
      next.package.expenses.push(expense);
      if (work) work.expense_refs.push(expense.ref);
    }
    const assign = (
      table: "expenses" | "work",
      row: any,
      field: string,
      value: unknown,
    ) => {
      const path = table + "." + row.ref + "." + field;
      if (value != null && value !== "" && !touched.current.has(path)) {
        row[field] = value;
        suggestedPaths.push(path);
      }
    };
    if (expense) {
      assign(
        "expenses",
        expense,
        "title",
        data.invoice_number
          ? "Rechnung " + data.invoice_number
          : data.vendor || work?.title || data.items[0]?.description || "Beleg",
      );
      assign("expenses", expense, "date", data.date);
      assign("expenses", expense, "amount_cents", data.amount_cents);
      assign("expenses", expense, "invoice_number", data.invoice_number);
      assign("expenses", expense, "vendor", data.vendor);
      assign("expenses", expense, "currency", data.currency);
      if (
        data.items.length &&
        !touched.current.has("expenses." + expense.ref + ".items")
      ) {
        expense.items = data.items;
        next.capture.prices_by_expense_ref = {
          ...next.capture.prices_by_expense_ref,
          [expense.ref]: data.prices,
        };
      }
    }
    if (work) {
      assign("work", work, "title", data.items[0]?.description);
      if (planned && !expense)
        assign("work", work, "estimated_cost_cents", data.amount_cents);
      if (
        data.items.length &&
        !touched.current.has("work." + work.ref + ".parts")
      )
        work.parts = data.items;
    }
    changed(next);
    setWarnings(data.warnings);
    setSuggested(true);
    setSuggestions(suggestedPaths);
    setSources(data.sources);
  }
  async function readDocument() {
    const file = files[ocrRef];
    if (!file || locked || reading) return;
    const id = ++generation.current,
      aborter = new AbortController();
    controller.current?.abort();
    controller.current = aborter;
    setReading(true);
    setReadError("");
    setProgress("Dokument wird ausgelesen …");
    try {
      const { readReceipt } = await import("../ocr");
      if (aborter.signal.aborted) return;
      const result = await readReceipt(file, {
        signal: aborter.signal,
        forceOcr,
        onProgress: (message) => {
          if (alive.current && id === generation.current) setProgress(message);
        },
      });
      if (
        !alive.current ||
        id !== generation.current ||
        aborter.signal.aborted
      ) {
        result.previews.forEach(URL.revokeObjectURL);
        return;
      }
      previewUrls.current.forEach(URL.revokeObjectURL);
      previewUrls.current = result.previews;
      setPreviews(result.previews);
      setPage(0);
      applyReceipt(parseReceipt(result.pages));
    } catch (e) {
      if (alive.current && id === generation.current && !aborter.signal.aborted)
        setReadError(e instanceof Error ? e.message : "Dokument nicht lesbar.");
    } finally {
      if (alive.current && id === generation.current) {
        setReading(false);
        setProgress("");
      }
    }
  }
  const missing = p.documents.filter(
    (d) => !files[d.ref] && !existingDocs[d.ref],
  );
  const possibleDuplicates = duplicates(
    s,
    p,
    Object.fromEntries(
      p.documents.map((doc) => [
        doc.ref,
        fileHashes[doc.ref] ??
          s.Documents.find((saved) => saved.id === existingDocs[doc.ref])
            ?.sha256 ??
          null,
      ]),
    ),
  );
  function validControls() {
    const invalid = Array.from(
      host.current?.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input,select,textarea") ?? [],
    ).find((input) => !input.checkValidity());
    if (invalid) {
      let parent = invalid.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      invalid.reportValidity();
      return false;
    }
    return true;
  }
  async function save() {
    if (saveLock.current || busy || reading || choosing || !validControls())
      return;
    saveLock.current = true;
    setSaving(true);
    try {
      await run(async () => {
        const current = latest.current,
          pack = validatePackage(current.draft.package);
        validateCapture(current.draft.capture, pack, s);
        if (
          !pack.work.length &&
          !pack.expenses.length &&
          !pack.documents.length &&
          !pack.reminders.length
        )
          throw Error("Bitte einen Eintrag ergänzen.");
        if (pack.reminders.length && !confirmRules)
          throw Error("Bitte die neuen Wartungsregeln bestätigen.");
        if (missing.length && !allowMissing)
          throw Error("Bitte fehlende Originale zuordnen.");
        if (Object.keys(current.draft.capture).length && !supported)
          throw Error("Speicherfunktion nicht verfügbar.");
        const prepared: Record<
          string,
          Awaited<ReturnType<typeof prepareFile>>
        > = {};
        for (const d of pack.documents)
          if (files[d.ref] && !uploaded.current[d.ref])
            prepared[d.ref] = await prepareFile(files[d.ref]);
        if (!alive.current) return;
        setFrozen(true);
        try {
          const documents: Record<string, string | null> = {};
          for (const d of pack.documents) {
            if (existingDocs[d.ref]) documents[d.ref] = existingDocs[d.ref];
            else if (uploaded.current[d.ref])
              documents[d.ref] = uploaded.current[d.ref];
            else if (prepared[d.ref]) {
              setProgress("Original wird hochgeladen …");
              const result = await adapter.call("upload", {
                operation_id: operation.current,
                file: prepared[d.ref],
              });
              if (!alive.current) return;
              uploaded.current[d.ref] = result.id;
              documents[d.ref] = result.id;
            } else documents[d.ref] = null;
          }
          setProgress("Eintrag wird gespeichert …");
          const result = await adapter.call("commit", {
            operation_id: operation.current,
            package: pack,
            documents,
            allow_missing: allowMissing,
            confirm_reminders: confirmRules,
            duplicate_override_reason: reason || null,
            links: current.links,
            ...(Object.keys(current.draft.capture).length
              ? { capture: current.draft.capture }
              : {}),
          });
          if (alive.current) await onSaved(result?.reused === true);
        } catch (e) {
          if (
            e instanceof ServiceError &&
            e.status < 500 &&
            /Dubletten|Dublette|doppelt/i.test(e.message)
          )
            setDuplicateReview(true);
          if (
            e instanceof ServiceError &&
            [400, 403, 404, 409, 422].includes(e.status)
          )
            setFrozen(false);
          throw e;
        }
      });
    } finally {
      saveLock.current = false;
      if (alive.current) {
        setSaving(false);
        setProgress("");
      }
    }
  }
  function selectKind(value: "work" | "expense" | "document") {
    if (
      (touched.current.size ||
        p.work.some((w) => w.title) ||
        p.expenses.some((e) => e.title)) &&
      !confirm("Eingaben für eine andere Eintragsart verwerfen?")
    )
      return;
    const next = { package: blankPackage(), capture: {} } as AssistantDraft;
    next.package.documents = clone(p.documents);
    if (value === "work")
      next.package.work = [
        { ...newWork(), document_refs: p.documents.map((d) => d.ref) },
      ];
    if (value === "expense")
      next.package.expenses = [
        { ...newExpense(), document_refs: p.documents.map((d) => d.ref) },
      ];
    touched.current.clear();
    setSuggested(false);
    setSuggestions([]);
    setWarnings([]);
    setConflicts([]);
    setSources({});
    setReason("");
    setDuplicateReview(false);
    setLinks({});
    setKind(value);
    changed(next);
  }
  function acceptConflict(conflict: DraftConflict) {
    const next = clone(draft),
      row = next.package[conflict.table].find((r) => r.ref === conflict.ref);
    if (conflict.field === "$workshop")
      next.capture.workshops_by_work_ref = {
        ...next.capture.workshops_by_work_ref,
        [conflict.ref]: conflict.proposed as string | null,
      };
    else if (row) (row as any)[conflict.field] = conflict.proposed;
    changed(next);
    setConflicts((old) => old.filter((c) => c !== conflict));
  }
  function suggestionLabels(table: "work" | "expenses", ref: string) {
    return new Set(
      suggestions
        .filter(
          (path) =>
            path.startsWith(table + "." + ref + ".") &&
            !touched.current.has(path),
        )
        .map((path) => {
          const field = path.split(".").at(-1)!;
          return field === "amount_cents"
            ? "Rechnungsbetrag"
            : field === "estimated_cost_cents"
              ? "Kostenschätzung (keine Ausgabe)"
              : fieldNames[field];
        }),
    );
  }
  return (
    <section className="panel entry-editor" ref={host}>
      {!(
        p.reminders.length > 0 &&
        !p.work.length &&
        !p.expenses.length &&
        !p.documents.length
      ) && (
        <div className="entry-heading">
          <Field label="Eintragsart">
            <select
              aria-label="Eintragsart"
              value={kind}
              disabled={locked || reading}
              onChange={(e) => selectKind(e.target.value as typeof kind)}
            >
              <option value="work">Arbeit</option>
              <option value="expense">Ausgabe / Einnahme</option>
              <option value="document">Nur Dokument</option>
            </select>
          </Field>
        </div>
      )}
      {onAssistant &&
        !(p.reminders.length > 0 && !p.work.length && !p.expenses.length) && (
          <button
            type="button"
            className="entry-assistant-link"
            disabled={locked || reading}
            onClick={() => onAssistant()}
          >
            Beschreiben oder diktieren – der Assistent füllt die Felder aus.
          </button>
        )}
      <fieldset className="entry-fields" disabled={locked}>
        {suggested && (
          <span className="entry-suggested" role="status">
            Belegvorschläge prüfen
          </span>
        )}
        {p.work.map((work, index) => (
          <section className="entry-card" key={work.ref}>
            <div className="section-heading">
              <h2>{p.work.length > 1 ? "Arbeit " + (index + 1) : "Arbeit"}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Arbeit aus Entwurf entfernen"
                onClick={() => removeRow("work", work.ref)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <SuggestedFields labels={suggestionLabels("work", work.ref)}>
              <WorkFields
                value={work}
                onChange={(row) => rowChange("work", work.ref, row)}
              />
            </SuggestedFields>
            {work.performed_by !== "unknown" && (
              <WorkshopSelect
                settings={s.Settings[0]}
                value={draft.capture.workshops_by_work_ref?.[work.ref] ?? ""}
                onChange={(value) => {
                  const next = clone(draft);
                  next.capture.workshops_by_work_ref = {
                    ...next.capture.workshops_by_work_ref,
                    [work.ref]: value || null,
                  };
                  changed(next);
                }}
              />
            )}
            <details className="entry-links" open={!!links[work.ref]?.length}>
              <summary>Kosten und Rechnungen</summary>
              <div className="button-group">
                <button
                  type="button"
                  className="button"
                  onClick={() => addCost(work)}
                >
                  <Plus size={15} />
                  Kosten hinzufügen
                </button>
              </div>
              {p.expenses.length > 0 && (
                <div className="field">
                  <span>Ausgaben dieses Eintrags</span>
                  {p.expenses.map((expense) => (
                    <label className="check" key={expense.ref}>
                      <input
                        type="checkbox"
                        checked={work.expense_refs.includes(expense.ref)}
                        onChange={(e) =>
                          rowChange("work", work.ref, {
                            ...work,
                            expense_refs: e.target.checked
                              ? [...work.expense_refs, expense.ref]
                              : work.expense_refs.filter(
                                  (r) => r !== expense.ref,
                                ),
                          })
                        }
                      />
                      {expense.title || "Neue Ausgabe"} ·{" "}
                      {money(expense.amount_cents, expense.currency)}
                    </label>
                  ))}
                </div>
              )}
              <Field label="Bereits bezahlte Ausgabe">
                <select
                  multiple
                  value={links[work.ref] ?? []}
                  onChange={(e) => {
                    setLinks({
                      ...links,
                      [work.ref]: Array.from(
                        e.target.selectedOptions,
                        (option) => option.value,
                      ),
                    });
                    operation.current = crypto.randomUUID();
                  }}
                >
                  <option value="" disabled>
                    Keine zusätzliche Ausgabe
                  </option>
                  {s.Expenses.filter((e) => !e.voided).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} · {money(e.amount_cents, e.currency)}
                    </option>
                  ))}
                </select>
              </Field>
            </details>
          </section>
        ))}
        {p.expenses.map((expense, index) => (
          <details key={expense.ref} className="entry-card entry-cost" open>
            <summary>
              {kind === "work"
                ? "Kosten"
                : p.expenses.length > 1
                  ? "Ausgabe " + (index + 1)
                  : "Ausgabe / Einnahme"}
            </summary>
            <div className="entry-card-actions">
              <button
                type="button"
                className="icon-button"
                aria-label="Ausgabe aus Entwurf entfernen"
                onClick={() => removeRow("expenses", expense.ref)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <SuggestedFields labels={suggestionLabels("expenses", expense.ref)}>
              <ExpenseFields
                value={expense}
                onChange={(row) => rowChange("expenses", expense.ref, row)}
                prices={
                  draft.capture.prices_by_expense_ref?.[expense.ref] ?? []
                }
                onPrices={(parts, prices) => {
                  const next = clone(draft);
                  next.package.expenses.find(
                    (e) => e.ref === expense.ref,
                  )!.items = parts;
                  next.capture.prices_by_expense_ref = {
                    ...next.capture.prices_by_expense_ref,
                    [expense.ref]: prices,
                  };
                  touched.current.add("expenses." + expense.ref + ".items");
                  changed(next);
                }}
              />
            </SuggestedFields>
          </details>
        ))}
        <details
          className="entry-documents"
          open={kind === "document" || p.documents.length > 0}
        >
          <summary>
            <Paperclip size={16} />
            Dokumente{p.documents.length ? " (" + p.documents.length + ")" : ""}
          </summary>
          <label className="button entry-file">
            <FilePlus2 size={16} />
            Dokument hinzufügen
            <input
              type="file"
              aria-label="Dokument hinzufügen"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              multiple
              disabled={locked || reading}
              onChange={(e) => {
                void chooseFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          {p.documents.map((doc) => (
            <section className="entry-document" key={doc.ref}>
              <div className="section-heading">
                <strong>{doc.source_filename ?? doc.title}</strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={doc.title + " entfernen"}
                  onClick={() => {
                    controller.current?.abort();
                    generation.current++;
                    setReading(false);
                    setProgress("");
                    const next = clone(draft);
                    next.package.documents = next.package.documents.filter(
                      (d) => d.ref !== doc.ref,
                    );
                    [...next.package.work, ...next.package.expenses].forEach(
                      (r) => {
                        r.document_refs = r.document_refs.filter(
                          (ref) => ref !== doc.ref,
                        );
                      },
                    );
                    setFiles((old) => {
                      const result = { ...old };
                      delete result[doc.ref];
                      return result;
                    });
                    setExistingDocs((old) => {
                      const result = { ...old };
                      delete result[doc.ref];
                      return result;
                    });
                    if (ocrRef === doc.ref) {
                      setOcrRef("");
                      previewUrls.current.forEach(URL.revokeObjectURL);
                      previewUrls.current = [];
                      setPreviews([]);
                    }
                    changed(next);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="form-grid">
                <Field label="Dokumenttitel">
                  <input
                    value={doc.title}
                    onChange={(e) => {
                      const next = clone(draft);
                      next.package.documents.find(
                        (d) => d.ref === doc.ref,
                      )!.title = e.target.value;
                      changed(next);
                    }}
                  />
                </Field>
                <Field label="Dokumenttyp">
                  <select
                    value={doc.document_type}
                    onChange={(e) => {
                      const next = clone(draft);
                      next.package.documents.find(
                        (d) => d.ref === doc.ref,
                      )!.document_type = e.target
                        .value as typeof doc.document_type;
                      changed(next);
                    }}
                  >
                    {Object.entries(docTypes).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {!files[doc.ref] && (
                <Field label="Vorhandenes Original">
                  <select
                    value={existingDocs[doc.ref] ?? ""}
                    onChange={(e) =>
                      setExistingDocs({
                        ...existingDocs,
                        [doc.ref]: e.target.value,
                      })
                    }
                  >
                    <option value="">Datei hinzufügen</option>
                    {s.Documents.filter((d) => !d.missing && !d.archived).map(
                      (d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              )}
              {[...p.work, ...p.expenses].length > 1 && (
                <details>
                  <summary>Verknüpfungen</summary>
                  {(["work", "expenses"] as const).flatMap((table) =>
                    p[table].map((row) => (
                      <label key={row.ref} className="check">
                        <input
                          type="checkbox"
                          checked={row.document_refs.includes(doc.ref)}
                          onChange={(e) =>
                            rowChange(table, row.ref, {
                              ...row,
                              document_refs: e.target.checked
                                ? [...row.document_refs, doc.ref]
                                : row.document_refs.filter(
                                    (r) => r !== doc.ref,
                                  ),
                            } as any)
                          }
                        />
                        {row.title || (table === "work" ? "Arbeit" : "Ausgabe")}
                      </label>
                    )),
                  )}
                </details>
              )}
              {fileUrls[doc.ref] && (
                <a
                  href={fileUrls[doc.ref]}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Original ansehen
                </a>
              )}
            </section>
          ))}
          {Object.keys(files).length > 0 && (
            <div className="entry-ocr">
              {Object.keys(files).length > 1 && (
                <Field label="Dokument auslesen">
                  <select
                    value={ocrRef}
                    disabled={reading}
                    onChange={(e) => setOcrRef(e.target.value)}
                  >
                    {Object.entries(files).map(([ref, file]) => (
                      <option key={ref} value={ref}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {reading ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    generation.current++;
                    controller.current?.abort();
                    setReading(false);
                    setProgress("");
                  }}
                >
                  <Square size={16} />
                  Abbrechen
                </button>
              ) : (
                <button
                  type="button"
                  className="button"
                  disabled={!files[ocrRef]}
                  onClick={() => void readDocument()}
                >
                  <FileSearch size={16} />
                  Dokument auslesen
                </button>
              )}
              <details>
                <summary>Erkennungsoptionen</summary>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={forceOcr}
                    disabled={reading}
                    onChange={(e) => setForceOcr(e.target.checked)}
                  />
                  Scan-Erkennung erzwingen
                </label>
              </details>
              {previews.length > 0 && (
                <div className="entry-scan-preview">
                  {previews.length > 1 && (
                    <div className="button-group">
                      <button
                        type="button"
                        className="button"
                        disabled={page === 0}
                        onClick={() => setPage((n) => n - 1)}
                      >
                        Zurück
                      </button>
                      <span>
                        {page + 1} / {previews.length}
                      </span>
                      <button
                        type="button"
                        className="button"
                        disabled={page === previews.length - 1}
                        onClick={() => setPage((n) => n + 1)}
                      >
                        Weiter
                      </button>
                    </div>
                  )}
                  <img src={previews[page]} alt="Belegvorschau" />
                </div>
              )}
            </div>
          )}
          {missing.length > 0 && (
            <label className="check">
              <input
                type="checkbox"
                checked={allowMissing}
                onChange={(e) => setAllowMissing(e.target.checked)}
              />
              Original fehlt
            </label>
          )}
        </details>
        {p.reminders.length > 0 && (
          <section className="entry-card">
            <h2>Wartungsregeln</h2>
            {p.reminders.map((rule) => (
              <p key={rule.ref}>
                {rule.title} · {date(rule.due_date)} ·{" "}
                {rule.due_odometer_km ?? "–"} km
              </p>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={confirmRules}
                onChange={(e) => setConfirmRules(e.target.checked)}
              />
              Wartungsregeln bestätigen
            </label>
          </section>
        )}
        <details>
          <summary>Weitere Einträge</summary>
          <div className="button-group">
            <button
              type="button"
              className="button"
              onClick={() => {
                const next = clone(draft);
                next.package.work.push(newWork("work_" + crypto.randomUUID()));
                changed(next);
              }}
            >
              Arbeit hinzufügen
            </button>
            <button type="button" className="button" onClick={() => addCost()}>
              Ausgabe hinzufügen
            </button>
          </div>
        </details>
        {(possibleDuplicates.length > 0 || duplicateReview || reason) && (
          <Field label="Mögliche Dublette – Begründung">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Grund für eine getrennte Buchung"
            />
          </Field>
        )}
        {conflicts.map((conflict, i) => (
          <div className="banner warning" key={i}>
            <span>
              {fieldNames[conflict.field] ?? conflict.field}:{" "}
              {display(
                conflict.field,
                conflict.current,
                s.Settings[0].workshops ?? [],
              )}{" "}
              →{" "}
              {display(
                conflict.field,
                conflict.proposed,
                s.Settings[0].workshops ?? [],
              )}
            </span>
            <button
              type="button"
              className="button"
              onClick={() => acceptConflict(conflict)}
            >
              Vorschlag übernehmen
            </button>
          </div>
        ))}
      </fieldset>
      {warnings.length > 0 && (
        <details className="receipt-warnings" open>
          <summary>Erkennung prüfen</summary>
          <ul>
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {Object.keys(sources).length > 0 && (
        <details className="entry-evidence">
          <summary>Erkennungsdetails</summary>
          <dl>
            {Object.entries(sources).map(([field, source]) => (
              <div key={field}>
                <dt>{fieldNames[field] ?? field}</dt>
                <dd>{source}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {readError && (
        <p className="banner warning" role="alert">
          {readError}
        </p>
      )}
      {progress && <p role="status">{progress}</p>}
      {frozen && !saving && (
        <p className="banner warning">
          Speichern noch nicht bestätigt. Bitte denselben Vorgang wiederholen.
        </p>
      )}
      <button
        type="button"
        className="button primary entry-save"
        disabled={busy || saving || reading || choosing}
        onClick={() => void save()}
      >
        {frozen ? "Speichern wiederholen" : "Speichern"}
      </button>
    </section>
  );
}
