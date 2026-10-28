import { emptyHistoryFilter, type HistoryFilter } from "../../shared/fleet";
import { ChevronRight, Download, FileText, Plus, Wrench } from "lucide-react";
import { useState, type FormEvent } from "react";
import { workshopSnapshot } from "../../shared/capture";
import { clone } from "../../shared/logic";
import type {
  Doc,
  Expense,
  Meta,
  State,
  Table,
  Work,
} from "../../shared/types";
import { categories } from "../../shared/types";
import "../cloudflare.css";
import { Field } from "../Field";
import "../login.css";
import { PositionEditor } from "../PositionEditor";
import {
  Btn,
  Empty,
  cents,
  date,
  money,
  numText,
  workKinds,
  type Runner,
} from "../view-support";
import { WorkshopInfo, WorkshopSelect } from "../Workshops";

export function HistoryView({
  s,
  detailId,
  edit,
  run,
  openDocument,
  filter,
  onFilter,
}: {
  s: State;
  filter?: HistoryFilter;
  onFilter?: (filter: HistoryFilter) => void;
  detailId?: string;
  edit: (t: Table, r: Meta, p: Record<string, unknown>) => Promise<boolean>;
  run: Runner;
  openDocument: (d: Doc, preview?: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState<HistoryFilter>(
      filter ?? emptyHistoryFilter,
    ),
    set = (key: keyof HistoryFilter, value: string | boolean) =>
      setDraft((d) => ({ ...d, [key]: value }));
  const { search, category, from, to, proof, showArchived, showVoided } =
    onFilter ? (filter ?? emptyHistoryFilter) : draft;
  const row =
      s.Expenses.find((x) => x.id === detailId) ??
      s.Work.find((x) => x.id === detailId),
    table = row && "amount_cents" in row ? "Expenses" : "Work";
  if (detailId && row)
    return (
      <>
        <a className="back-link" href="#/historie">
          ← Zur Historie
        </a>
        <section className="panel">
          <div className="section-heading">
            <h2>{row.title}</h2>
            <span className="tag">
              {row.voided
                ? "Storniert"
                : row.archived
                  ? "Archiviert"
                  : "Gültig"}
            </span>
          </div>
          <p>
            {date(row.date)} ·{" "}
            {row.odometer_km === null
              ? "Kilometerstand unbekannt"
              : row.odometer_km.toLocaleString("de-DE") + " km"}
          </p>
          <RecordEditor
            key={row.id + "-" + row.revision}
            row={row}
            table={table}
            s={s}
            onSave={(patch) => edit(table, row, patch)}
          />
          <h3>Zugehörige Belege</h3>
          {row.document_refs.map((id) => {
            const d = s.Documents.find((x) => x.id === id);
            return (
              d && (
                <div className="list-row" key={id}>
                  <span>
                    <strong>{d.title}</strong>
                    <small>
                      {d.source_filename ?? "Originalname unbekannt"}
                    </small>
                  </span>
                  {d.missing ? (
                    <span className="tag due">Beleg fehlt</span>
                  ) : (
                    <>
                      <Btn onClick={() => run(() => openDocument(d, true))}>
                        Vorschau
                      </Btn>
                      <Btn onClick={() => run(() => openDocument(d))}>
                        <Download size={15} />
                      </Btn>
                    </>
                  )}
                </div>
              )
            );
          })}
          {!row.document_refs.length && (
            <p className="muted">Kein Beleg verknüpft.</p>
          )}
          <Field label="Vorhandene Dokumente verknüpfen">
            <select
              multiple
              value={row.document_refs}
              onChange={(e) =>
                edit(table, row, {
                  document_refs: Array.from(
                    e.target.selectedOptions,
                    (x) => x.value,
                  ),
                })
              }
            >
              {s.Documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </Field>
          <h3>Zusammengehörige Einträge</h3>
          {table === "Expenses"
            ? s.Work.filter((w) => w.expense_refs.includes(row.id)).map((w) => (
                <a className="list-row" href={"#/historie/" + w.id} key={w.id}>
                  {w.title}
                  <ChevronRight size={16} />
                </a>
              ))
            : (row as Work).expense_refs.map((id) => {
                const e = s.Expenses.find((e) => e.id === id);
                return (
                  e && (
                    <a
                      className="list-row"
                      href={"#/historie/" + e.id}
                      key={e.id}
                    >
                      {e.title}
                      <strong>{money(e.amount_cents, e.currency)}</strong>
                    </a>
                  )
                );
              })}
          <div className="button-group">
            <Btn onClick={() => edit(table, row, { archived: !row.archived })}>
              {row.archived
                ? "Archivierung aufheben"
                : "Archivieren (zählt weiter)"}
            </Btn>
            <Btn onClick={() => edit(table, row, { voided: !row.voided })}>
              {row.voided ? "Storno aufheben" : "Stornieren (zählt nicht)"}
            </Btn>
          </div>
          <p className="muted">
            Archivieren blendet gültige Daten aus der Standardansicht aus.
            Stornieren nimmt eine Zahlung aus den Summen; die Änderung bleibt
            nachvollziehbar.
          </p>
          <details>
            <summary>Änderungsverlauf</summary>
            {s.AuditLog.filter(
              (a) =>
                a.entity_id === row.id ||
                ((a.after as any)?.ids ?? []).includes(row.id),
            ).map((a) => (
              <div key={a.id}>
                <p>
                  {new Date(a.created_at).toLocaleString("de-DE")} ·{" "}
                  {a.action === "edit"
                    ? "Bearbeitet"
                    : a.action === "import"
                      ? "Erfasst"
                      : a.action}
                </p>
                <pre>
                  {JSON.stringify(
                    { vorher: a.before, nachher: a.after },
                    null,
                    2,
                  )}
                </pre>
              </div>
            ))}
          </details>
        </section>
      </>
    );
  const rows = [...s.Expenses, ...s.Work]
    .filter(
      (x) =>
        (showArchived || !x.archived) &&
        (showVoided || !x.voided) &&
        (!from || (!!x.date && x.date >= from)) &&
        (!to || (!!x.date && x.date <= to)) &&
        (!category || ("category" in x && x.category === category)) &&
        (!search ||
          JSON.stringify(x)
            .toLocaleLowerCase("de-DE")
            .includes(search.toLocaleLowerCase("de-DE"))) &&
        (proof === "all" ||
          (proof === "with" &&
            x.document_refs.some(
              (id) => !s.Documents.find((d) => d.id === id)?.missing,
            )) ||
          (proof === "missing" &&
            (!x.document_refs.length ||
              x.document_refs.some(
                (id) => s.Documents.find((d) => d.id === id)?.missing,
              )))),
    )
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return (
    <section className="panel">
      <div className="filters">
        <Field label="Stichwort">
          <input
            value={draft.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Titel, Werkstatt, Rechnungsnummer …"
          />
        </Field>
        <Field label="Kategorie">
          <select
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">Alle Kategorien</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Von">
          <input
            type="date"
            value={draft.from}
            onChange={(e) => set("from", e.target.value)}
          />
        </Field>
        <Field label="Bis">
          <input
            type="date"
            value={draft.to}
            onChange={(e) => set("to", e.target.value)}
          />
        </Field>
        <Field label="Beleg">
          <select
            value={draft.proof}
            onChange={(e) => set("proof", e.target.value)}
          >
            <option value="all">Alle</option>
            <option value="with">Mit Original</option>
            <option value="missing">Beleg fehlt</option>
          </select>
        </Field>
      </div>
      <div className="button-group">
        <label className="check">
          <input
            type="checkbox"
            checked={draft.showArchived}
            onChange={(e) => set("showArchived", e.target.checked)}
          />{" "}
          Archivierte zeigen
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.showVoided}
            onChange={(e) => set("showVoided", e.target.checked)}
          />{" "}
          Stornierte zeigen
        </label>
      </div>
      {onFilter && <Btn onClick={() => onFilter(draft)}>Filter anwenden</Btn>}
      <div className="section-heading">
        <h2>Deine Einträge</h2>
        <span className="muted">
          {rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"}
        </span>
      </div>
      {rows.length ? (
        rows.map((x) => (
          <a className="history-row" href={"#/historie/" + x.id} key={x.id}>
            <span className="history-date">{date(x.date)}</span>
            <span className="row-icon">
              {"amount_cents" in x ? (
                <FileText size={18} />
              ) : (
                <Wrench size={18} />
              )}
            </span>
            <span className="history-description">
              <strong>{x.title}</strong>
              <small>
                {"category" in x
                  ? (x.category ?? "Kategorie offen")
                  : workKinds[x.kind]}{" "}
                ·{" "}
                {x.odometer_km === null
                  ? "km offen"
                  : x.odometer_km.toLocaleString("de-DE") + " km"}{" "}
                · {x.document_refs.length} Beleg(e)
              </small>
              {"amount_cents" in x &&
                s.Work.filter((w) => w.expense_refs.includes(x.id)).map((w) => (
                  <small key={w.id}>↳ {w.title}</small>
                ))}
              {x.voided && <span className="tag due">Storniert</span>}
              {x.archived && <span className="tag">Archiviert</span>}
            </span>
            <strong>
              {"amount_cents" in x
                ? money(x.amount_cents, x.currency)
                : x.status === "planned"
                  ? "Geplant"
                  : "Arbeit"}
            </strong>
            <ChevronRight size={16} />
          </a>
        ))
      ) : (
        <Empty title="Noch keine passenden Einträge">
          Erfasse deinen ersten Eintrag oder passe die Filter an.
        </Empty>
      )}
    </section>
  );
}
export function RecordEditor({
  row,
  table,
  s,
  onSave,
}: {
  row: Expense | Work;
  table: "Expenses" | "Work";
  s: State;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<any>(clone(row)),
    [saving, setSaving] = useState(false),
    [localError, setLocalError] = useState("");
  const set = (k: string, v: any) => setDraft({ ...draft, [k]: v });
  const moneyInput = (k: string, label: string) => (
    <Field label={label}>
      <input
        inputMode="decimal"
        defaultValue={draft[k] == null ? "" : numText(draft[k] / 100)}
        name={k}
      />
    </Field>
  );
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setLocalError("");
    try {
      const f = new FormData(e.currentTarget),
        patch: any = {};
      for (const [k, v] of Object.entries(draft))
        if (
          ![
            "id",
            "vehicle_id",
            "revision",
            "created_at",
            "updated_at",
            "ref",
            "archived",
            "voided",
          ].includes(k)
        )
          patch[k] = v;
      for (const k of table === "Expenses"
        ? ["amount_cents"]
        : ["estimated_cost_cents"])
        patch[k] = cents(String(f.get(k) ?? ""));
      if (table === "Expenses") patch.refund_of_id = draft.refund_of_id ?? null;
      await onSave(patch);
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save}>
      <div className="form-grid">
        <Field label="Titel">
          <input
            required
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field label="Datum (leer = unbekannt)">
          <input
            type="date"
            value={draft.date ?? ""}
            onChange={(e) => set("date", e.target.value || null)}
          />
        </Field>
        <Field label="Kilometerstand (leer = unbekannt)">
          <input
            type="number"
            min="0"
            step="any"
            value={draft.odometer_km ?? ""}
            onChange={(e) =>
              set(
                "odometer_km",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </Field>
        {table === "Expenses" ? (
          <>
            <Field label="Kategorie">
              <select
                value={draft.category ?? ""}
                onChange={(e) => set("category", e.target.value || null)}
              >
                <option value="">Ungeklärt</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            {moneyInput("amount_cents", "Betrag")}
            <Field label="Währung">
              <input
                value={draft.currency ?? ""}
                pattern="[A-Z]{3}"
                onChange={(e) => set("currency", e.target.value || null)}
              />
            </Field>
            <Field label="Händler / Werkstatt">
              <input
                value={draft.vendor ?? ""}
                onChange={(e) => set("vendor", e.target.value || null)}
              />
            </Field>
            <Field label="Rechnungsnummer">
              <input
                value={draft.invoice_number ?? ""}
                onChange={(e) => set("invoice_number", e.target.value || null)}
              />
            </Field>
            <Field label="Zahlungsart">
              <select
                value={draft.cashflow_type ?? "expense"}
                onChange={(e) => set("cashflow_type", e.target.value)}
              >
                <option value="expense">Ausgabe / Erstattung</option>
                <option value="income">Einnahme / Verkauf</option>
              </select>
            </Field>
            <Field label="Erstattung bezieht sich auf">
              <select
                value={draft.refund_of_id ?? ""}
                onChange={(e) => set("refund_of_id", e.target.value || null)}
              >
                <option value="">Kein Bezug</option>
                {s.Expenses.filter((e) => e.id !== row.id).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notizen">
              <textarea
                value={draft.notes ?? ""}
                onChange={(e) => set("notes", e.target.value || null)}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Arbeitsart">
              <select
                value={draft.kind}
                onChange={(e) => set("kind", e.target.value)}
              >
                {Object.entries(workKinds).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={draft.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="completed">Bestätigt durchgeführt</option>
                <option value="planned">Geplant</option>
              </select>
            </Field>
            <Field label="Durchführung">
              <select
                value={draft.performed_by}
                onChange={(e) => {
                  const performed_by = e.target.value;
                  setDraft({
                    ...draft,
                    performed_by,
                    workshop_snapshot:
                      performed_by === "self"
                        ? workshopSnapshot(
                            s.Settings[0],
                            s.Settings[0].self_workshop_id ?? null,
                          )
                        : null,
                  });
                }}
              >
                <option value="unknown">Unbekannt</option>
                <option value="self">Eigenleistung</option>
                <option value="workshop">Werkstatt</option>
              </select>
            </Field>
            {moneyInput(
              "estimated_cost_cents",
              "Kostenschätzung (nur Planung)",
            )}
            <Field label="Eigene Arbeitszeit in Minuten (optional)">
              <input
                type="number"
                min="0"
                value={draft.labor_minutes ?? ""}
                onChange={(e) =>
                  set(
                    "labor_minutes",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field label="Beschreibung">
              <textarea
                value={draft.description ?? ""}
                onChange={(e) => set("description", e.target.value || null)}
              />
            </Field>
            <Field label="Bezahlte Ausgaben verknüpfen">
              <select
                multiple
                value={draft.expense_refs}
                onChange={(e) => {
                  const ids = Array.from(
                    e.target.selectedOptions,
                    (x) => x.value,
                  );
                  setDraft({
                    ...draft,
                    expense_refs: ids,
                    allocations: draft.allocations.filter((a: any) =>
                      ids.includes(a.expense_id),
                    ),
                  });
                }}
              >
                {s.Expenses.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {money(e.amount_cents, e.currency)}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>
      {table === "Expenses" && draft.category === "Tanken" && (
        <fieldset>
          <legend>Tankdaten</legend>
          <div className="form-grid">
            {[
              ["liters", "Liter"],
              ["fuel_type", "Kraftstoff"],
              ["station_name", "Tankstelle"],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <input
                  type={k === "liters" ? "number" : "text"}
                  step="any"
                  value={draft.fuel?.[k] ?? ""}
                  onChange={(e) =>
                    set("fuel", {
                      liters: null,
                      fuel_type: null,
                      station_name: null,
                      full_tank: null,
                      missed_previous_fillup: null,
                      ...draft.fuel,
                      [k]:
                        e.target.value === ""
                          ? null
                          : k === "liters"
                            ? Number(e.target.value)
                            : e.target.value,
                    })
                  }
                />
              </Field>
            ))}
            {[
              ["full_tank", "Vollgetankt"],
              ["missed_previous_fillup", "Vorherigen Tankvorgang ausgelassen"],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <select
                  value={
                    draft.fuel?.[k] === null || draft.fuel?.[k] === undefined
                      ? ""
                      : String(draft.fuel[k])
                  }
                  onChange={(e) =>
                    set("fuel", {
                      liters: null,
                      fuel_type: null,
                      station_name: null,
                      full_tank: null,
                      missed_previous_fillup: null,
                      ...draft.fuel,
                      [k]:
                        e.target.value === ""
                          ? null
                          : e.target.value === "true",
                    })
                  }
                >
                  <option value="">Unbekannt</option>
                  <option value="true">Ja</option>
                  <option value="false">Nein</option>
                </select>
              </Field>
            ))}
          </div>
          {draft.fuel?.liters && draft.amount_cents !== null && (
            <p>
              Preis pro Liter:{" "}
              {money(
                Math.round(draft.amount_cents / draft.fuel.liters),
                draft.currency,
              )}
            </p>
          )}
        </fieldset>
      )}
      <details>
        <summary>Teile, Betriebsstoffe und Positionspreise</summary>
        {table === "Expenses" ? (
          <PositionEditor
            parts={draft.items ?? []}
            prices={draft.position_prices ?? []}
            onChange={(items, position_prices) =>
              setDraft({ ...draft, items, position_prices })
            }
          />
        ) : (
          <PartsEditor
            parts={draft.parts ?? []}
            onChange={(p) => set("parts", p)}
          />
        )}
      </details>
      {table === "Work" && (
        <>
          <WorkshopInfo snapshot={draft.workshop_snapshot} />
          <WorkshopSelect
            settings={s.Settings[0]}
            value={
              (s.Settings[0].workshops ?? []).some(
                (w) =>
                  w.id === draft.workshop_snapshot?.profile_id && !w.archived,
              )
                ? draft.workshop_snapshot.profile_id
                : ""
            }
            onChange={(id) =>
              set(
                "workshop_snapshot",
                workshopSnapshot(s.Settings[0], id || null),
              )
            }
          />
        </>
      )}
      {table === "Work" && (
        <>
          <details>
            <summary>Optionale Kostenanteile</summary>
            <p className="muted">
              Diese Zuordnung erzeugt keine weitere Zahlung. Summe aller
              Arbeitsanteile darf den Rechnungsbetrag nicht überschreiten.
            </p>
            {draft.expense_refs.map((id: string) => (
              <Field
                key={id}
                label={s.Expenses.find((e) => e.id === id)?.title ?? id}
              >
                <input
                  type="number"
                  min="0"
                  placeholder="Anteil in Cent (optional)"
                  value={
                    draft.allocations.find((a: any) => a.expense_id === id)
                      ?.amount_cents ?? ""
                  }
                  onChange={(e) =>
                    set("allocations", [
                      ...draft.allocations.filter(
                        (a: any) => a.expense_id !== id,
                      ),
                      ...(e.target.value === ""
                        ? []
                        : [
                            {
                              expense_id: id,
                              amount_cents: Number(e.target.value),
                            },
                          ]),
                    ])
                  }
                />
              </Field>
            ))}
          </details>
          {draft.kind === "modification" && (
            <fieldset>
              <legend>Umbauangaben</legend>
              <div className="form-grid">
                {[
                  ["manufacturer", "Hersteller"],
                  ["part_number", "Teilenummer"],
                  ["approval_number", "Genehmigungsnummer"],
                  ["installation_date", "Einbaudatum"],
                  ["installation_odometer_km", "Einbaukilometer"],
                  ["removal_date", "Ausbaudatum"],
                  ["removal_odometer_km", "Ausbaukilometer"],
                ].map(([k, l]) => (
                  <Field key={k} label={l}>
                    <input
                      type={
                        k.endsWith("date")
                          ? "date"
                          : k.endsWith("_km")
                            ? "number"
                            : "text"
                      }
                      value={draft.modification_details?.[k] ?? ""}
                      onChange={(e) =>
                        set("modification_details", {
                          manufacturer: null,
                          part_number: null,
                          approval_number: null,
                          status: "planned",
                          ...draft.modification_details,
                          [k]:
                            e.target.value === ""
                              ? null
                              : k.endsWith("_km")
                                ? Number(e.target.value)
                                : e.target.value,
                        })
                      }
                    />
                  </Field>
                ))}
                <Field label="Bestätigter Zustand">
                  <select
                    value={draft.modification_details?.status ?? "planned"}
                    onChange={(e) =>
                      set("modification_details", {
                        manufacturer: null,
                        part_number: null,
                        approval_number: null,
                        ...draft.modification_details,
                        status: e.target.value,
                      })
                    }
                  >
                    <option value="planned">Geplant</option>
                    <option value="installed">Eingebaut</option>
                    <option value="removed">Ausgebaut</option>
                  </select>
                </Field>
              </div>
              <p className="muted">
                Dokumentiert den bestätigten Sachstand. Eine Genehmigungsnummer
                ist keine automatische Aussage zur Zulässigkeit.
              </p>
            </fieldset>
          )}
        </>
      )}
      {localError && (
        <p className="warning-text" role="alert">
          {localError}
        </p>
      )}
      <Btn type="submit" primary disabled={saving}>
        Änderungen speichern
      </Btn>
    </form>
  );
}
export function PartsEditor({
  parts,
  onChange,
}: {
  parts: any[];
  onChange: (parts: any[]) => void;
}) {
  return (
    <>
      {parts.map((p, i) => (
        <div className="review-entry" key={i}>
          <div className="form-grid">
            {[
              ["description", "Beschreibung"],
              ["part_number", "Teilenummer"],
              ["quantity", "Menge"],
              ["unit", "Einheit"],
              ["specification", "Bestätigte Freigabe / Spezifikation"],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <input
                  type={k === "quantity" ? "number" : "text"}
                  step="any"
                  value={p[k] ?? ""}
                  onChange={(e) =>
                    onChange(
                      parts.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              [k]:
                                e.target.value === ""
                                  ? null
                                  : k === "quantity"
                                    ? Number(e.target.value)
                                    : e.target.value,
                            }
                          : x,
                      ),
                    )
                  }
                />
              </Field>
            ))}
          </div>
          <Btn onClick={() => onChange(parts.filter((_, j) => j !== i))}>
            Position entfernen
          </Btn>
        </div>
      ))}
      <Btn
        onClick={() =>
          onChange([
            ...parts,
            {
              description: null,
              part_number: null,
              quantity: null,
              unit: null,
              specification: null,
            },
          ])
        }
      >
        <Plus size={16} /> Position hinzufügen
      </Btn>
    </>
  );
}
