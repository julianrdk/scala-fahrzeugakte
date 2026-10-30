import {
  ArrowUpRight,
  Download,
  FileText,
  Link as LinkIcon,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  blankPackage,
  currentOdometer,
  dueStatus,
  odometerWarnings,
} from "../../shared/logic";
import type {
  Doc,
  ImportPackage,
  Meta,
  ReminderInput,
  State,
  Table,
} from "../../shared/types";
import { prepareFile, type Adapter } from "../adapter";
import "../cloudflare.css";
import { Field } from "../Field";
import { vehicleColors } from "../theme";
import "../login.css";
import {
  Btn,
  Empty,
  date,
  docTypes,
  dueLabels,
  number,
  today,
  workKinds,
  type Runner,
} from "../view-support";

export function VehicleForm({
  s,
  edit,
  run,
  mutate,
}: {
  s: State;
  edit: (t: Table, r: Meta, p: Record<string, unknown>) => Promise<boolean>;
  run: Runner;
  mutate: (a: string, p: any) => Promise<void>;
  openDocument: (d: Doc, preview?: boolean) => Promise<void>;
  onPreview: (p: ImportPackage) => void;
}) {
  const v = s.Vehicles[0];
  const [accent, setAccent] = useState(v.accent_color ?? "");
  useEffect(() => setAccent(v.accent_color ?? ""), [v.id, v.accent_color]);
  return (
    <>
      <section className="panel">
        <h2>Fahrzeugdaten</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              patch: any = {};
            for (const k of [
              "manufacturer",
              "model",
              "year",
              "first_registration",
              "engine",
              "vin",
              "plate",
              "purchase_date",
              "fuel_type",
            ])
              patch[k] = String(f.get(k)) || null;
            patch.purchase_odometer = number(
              String(f.get("purchase_odometer")),
            );
            patch.accent_color = accent || null;
            edit("Vehicles", v, patch);
          }}
        >
          <div className="form-grid">
            {[
              ["manufacturer", "Hersteller"],
              ["model", "Modell"],
              ["year", "Baujahr"],
              ["first_registration", "Erstzulassung"],
              ["engine", "Motor / Motorkennbuchstabe"],
              ["vin", "FIN"],
              ["plate", "Kennzeichen"],
              ["purchase_date", "Kaufdatum"],
              ["purchase_odometer", "Kilometer bei Kauf"],
              ["fuel_type", "Kraftstoff"],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <input
                  name={k}
                  type={
                    ["first_registration", "purchase_date"].includes(k)
                      ? "date"
                      : k === "purchase_odometer"
                        ? "number"
                        : "text"
                  }
                  required={["manufacturer", "model"].includes(k)}
                  defaultValue={(v as any)[k] ?? ""}
                />
              </Field>
            ))}
          </div>
          <fieldset className="vehicle-colors">
            <legend>Akzentfarbe</legend>
            {vehicleColors.map(([label, color]) => (
              <button
                key={color}
                type="button"
                className="vehicle-color"
                title={label}
                aria-label={label}
                aria-pressed={accent.toLowerCase() === color}
                style={{ backgroundColor: color }}
                onClick={() => setAccent(color)}
              />
            ))}
            <input
              type="color"
              aria-label="Freie Akzentfarbe"
              value={accent || "#19644b"}
              onChange={(e) => setAccent(e.target.value)}
            />
            <button
              type="button"
              className="button"
              onClick={() => setAccent("")}
            >
              Standard
            </button>
          </fieldset>
          <Btn type="submit" primary>
            Fahrzeugdaten speichern
          </Btn>
        </form>
        <h3>Fahrzeugbilder</h3>
        <a className="button" href="#/fahrzeug/galerie">
          Galerie öffnen <ArrowUpRight size={15} />
        </a>
      </section>
      <section className="panel">
        <h2>Kilometerhistorie</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                mutate("odometer", {
                  id: crypto.randomUUID(),
                  date: String(f.get("date")),
                  km: number(String(f.get("km"))),
                  note: String(f.get("note")) || null,
                }),
              "Kilometerstand bestätigt gespeichert.",
            );
          }}
        >
          <div className="form-grid">
            <Field label="Datum des bestätigten Stands">
              <input name="date" required type="date" />
            </Field>
            <Field label="Bestätigte Kilometer">
              <input name="km" required type="number" min="0" step="any" />
            </Field>
            <Field label="Notiz">
              <input name="note" />
            </Field>
          </div>
          <Btn type="submit">Kilometerstand ergänzen</Btn>
        </form>
        {s.Odometer.slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((x) => (
            <div className="list-row" key={x.id}>
              {date(x.date)}
              <strong>{x.km.toLocaleString("de-DE")} km</strong>
              <span>{x.note}</span>
            </div>
          ))}
        <p className="muted">
          Kilometerangaben aus datierten Einträgen ergänzen die Historie.
          Historische Werte überschreiben keinen neueren Stand.
        </p>
        {odometerWarnings(s).length > 0 && (
          <p className="warning-text">
            Mindestens ein späterer Stand liegt unter einem früheren Wert. Bitte
            die zugehörigen Einträge prüfen.
          </p>
        )}
      </section>
    </>
  );
}
export function Documents({
  s,
  edit,
  run,
  openDocument,
  onPreview,
  adapter,
  refresh,
}: {
  s: State;
  adapter: Adapter | null;
  refresh: () => Promise<void>;
  edit: (t: Table, r: Meta, p: Record<string, unknown>) => Promise<boolean>;
  run: Runner;
  openDocument: (d: Doc, preview?: boolean) => Promise<void>;
  onPreview: (p: ImportPackage) => void;
}) {
  const [q, setQ] = useState(""),
    [type, setType] = useState("");
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Deine Dokumente</h2>
        <Btn
          primary
          onClick={() => {
            const p = blankPackage();
            p.documents.push({
              ref: "doc1",
              source_filename: null,
              title: "Neues Dokument",
              document_type: "other",
            });
            onPreview(p);
          }}
        >
          <Plus size={16} /> Dokument ablegen
        </Btn>
      </div>
      <div className="form-grid">
        <Field label="Suchen">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, Titel oder Typ …"
          />
        </Field>
        <Field label="Typ">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Alle Dokumente</option>
            {Object.entries(docTypes).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {s.Documents.filter(
        (d) =>
          (!type || d.document_type === type) &&
          JSON.stringify(d).toLocaleLowerCase().includes(q.toLocaleLowerCase()),
      ).map((d) => (
        <article className="document-card" key={d.id}>
          <div className="list-row">
            <span className="row-icon">
              <FileText size={20} />
            </span>
            <span>
              <strong>{d.title}</strong>
              <small className="filename">
                {d.source_filename ?? "Originalname unbekannt"}
              </small>
              <small>
                {docTypes[d.document_type]} ·{" "}
                {d.size
                  ? (d.size / 1024).toFixed(0) + " KB"
                  : "Größe unbekannt"}{" "}
                · {d.missing ? "Beleg fehlt" : "Original gespeichert"}
              </small>
            </span>
            {!d.missing && (
              <div className="button-group">
                <Btn onClick={() => run(() => openDocument(d, true))}>
                  Vorschau
                </Btn>
                <Btn onClick={() => run(() => openDocument(d))}>
                  <Download size={16} /> Download
                </Btn>
              </div>
            )}
          </div>
          <details>
            <summary>Angaben und Verknüpfungen</summary>
            {d.missing && (
              <Field label="Fehlendes Original ergänzen (maximal 4 MiB)">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      run(async () => {
                        if (!adapter) throw Error("Bitte verbinden.");
                        const file = await prepareFile(f);
                        const u = await adapter.call("upload", {
                          operation_id: crypto.randomUUID(),
                          file,
                        });
                        await adapter.call("attachDocument", {
                          id: d.id,
                          revision: d.revision,
                          upload_id: u.id,
                        });
                        await refresh();
                      }, "Original bestätigt verknüpft.");
                  }}
                />
              </Field>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                edit("Documents", d, {
                  title: String(f.get("title")),
                  document_type: String(f.get("type")),
                });
              }}
            >
              <Field label="Anzeigename">
                <input name="title" defaultValue={d.title} required />
              </Field>
              <Field label="Typ">
                <select name="type" defaultValue={d.document_type}>
                  {Object.entries(docTypes).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Btn type="submit">Angaben speichern</Btn>
            </form>
            <p className="muted">
              Originaldateiname bleibt erhalten. Prüfsumme:{" "}
              {d.sha256 ?? "Noch kein Original zugeordnet"}
            </p>
            {s.DocumentLinks.filter((l) => l.document_id === d.id).map((l) => (
              <a
                className="list-row"
                href={"#/historie/" + l.entity_id}
                key={l.id}
              >
                {[...s.Expenses, ...s.Work].find((x) => x.id === l.entity_id)
                  ?.title ?? "Eintrag"}
                <LinkIcon size={16} />
              </a>
            ))}
          </details>
        </article>
      ))}
      {!s.Documents.length && (
        <Empty title="Ein Platz für alle Originale">
          Rechnungen, ABE, Verträge und Serviceheft-Scans. Auch ohne Ausgabe
          ablegbar.
        </Empty>
      )}
    </section>
  );
}
export function Reminders({
  s,
  edit,
  run,
  mutate,
  onPreview,
}: {
  s: State;
  edit: (t: Table, r: Meta, p: Record<string, unknown>) => Promise<boolean>;
  run: Runner;
  mutate: (a: string, p: any) => Promise<void>;
  onPreview: (p: ImportPackage) => void;
}) {
  const odo = currentOdometer(s);
  return (
    <>
      <section className="panel">
        <h2>Termin oder Wartungsregel ergänzen</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              const p = blankPackage();
              const r: ReminderInput = {
                ref: "reminder1",
                title: String(f.get("title")),
                work_type: String(f.get("kind")) as any,
                due_date: String(f.get("date")) || null,
                due_odometer_km: number(String(f.get("km"))),
                repeat_months: number(String(f.get("months"))),
                repeat_km: number(String(f.get("repeat_km"))),
                lead_days: number(String(f.get("lead_days"))),
                lead_km: number(String(f.get("lead_km"))),
                email_enabled: f.get("email") === null ? false : true,
                basis_work_ref: null,
                notes: String(f.get("notes")) || null,
              };
              if (!r.due_date && r.due_odometer_km === null)
                throw Error(
                  "Bitte mindestens Datum oder Kilometergrenze nennen.",
                );
              p.reminders.push(r);
              onPreview(p);
            });
          }}
        >
          <div className="form-grid">
            <Field label="Arbeit / Termin">
              <input name="title" required />
            </Field>
            <Field label="Arbeitsart">
              <select name="kind">
                {Object.entries(workKinds).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fällig am (optional)">
              <input name="date" type="date" />
            </Field>
            <Field label="Oder bei Kilometerstand (optional)">
              <input name="km" inputMode="numeric" />
            </Field>
          </div>
          <details>
            <summary>Wiederholung, Vorlauf und E-Mail</summary>
            <div className="form-grid">
              <Field label="Wiederholen alle Monate">
                <input name="months" inputMode="numeric" />
              </Field>
              <Field label="Wiederholen alle Kilometer">
                <input name="repeat_km" inputMode="numeric" />
              </Field>
              <Field label="Vorlauf in Tagen">
                <input name="lead_days" defaultValue="30" inputMode="numeric" />
              </Field>
              <Field label="Vorlauf in Kilometern">
                <input name="lead_km" defaultValue="1000" inputMode="numeric" />
              </Field>
              <Field label="Bestätigte Materialhinweise">
                <textarea name="notes" />
              </Field>
            </div>
            <label className="check">
              <input type="checkbox" name="email" /> E-Mail für diese Regel
              aktivieren (zusätzlich globale Einstellung erforderlich)
            </label>
          </details>
          <p className="muted">
            Fällig, sobald die erste bestätigte Grenze erreicht ist. Ein
            Teilekauf setzt kein Intervall zurück.
          </p>
          <Btn type="submit" primary>
            Regel prüfen
          </Btn>
        </form>
      </section>
      {s.Reminders.map((r) => (
        <section className="panel" key={r.id} id={r.id}>
          <div className="section-heading">
            <h2>{r.title}</h2>
            <span className={"tag " + dueStatus(r, today(), odo?.km ?? null)}>
              {dueLabels[dueStatus(r, today(), odo?.km ?? null)]}
            </span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                const patch: any = {
                  due_date: String(f.get("date")) || null,
                  email_enabled: !!f.get("email"),
                  fixed_calendar: !!f.get("fixed"),
                  notes: String(f.get("notes")) || null,
                };
                for (const k of [
                  "due_odometer_km",
                  "repeat_months",
                  "repeat_days",
                  "repeat_km",
                  "lead_days",
                  "lead_km",
                ])
                  patch[k] = number(String(f.get(k)));
                await edit("Reminders", r, patch);
              });
            }}
          >
            <div className="form-grid">
              <Field label="Fällig am">
                <input
                  name="date"
                  type="date"
                  defaultValue={r.due_date ?? ""}
                />
              </Field>
              {[
                ["due_odometer_km", "Fällig bei Kilometer"],
                ["repeat_months", "Wiederholung Monate"],
                ["repeat_days", "Oder Wiederholung Tage"],
                ["repeat_km", "Wiederholung Kilometer"],
                ["lead_days", "Vorlauf Tage"],
                ["lead_km", "Vorlauf Kilometer"],
              ].map(([k, l]) => (
                <Field key={k} label={l}>
                  <input
                    name={k}
                    defaultValue={(r as any)[k] ?? ""}
                    inputMode="numeric"
                  />
                </Field>
              ))}
              <Field label="Notizen / Material">
                <textarea name="notes" defaultValue={r.notes ?? ""} />
              </Field>
            </div>
            <label className="check">
              <input
                type="checkbox"
                name="email"
                defaultChecked={r.email_enabled === true}
              />{" "}
              E-Mail für diese Regel
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="fixed"
                defaultChecked={r.fixed_calendar}
              />{" "}
              Feste Kalenderregel statt tatsächlichem Erledigungsdatum
            </label>
            <Btn type="submit">Regel speichern</Btn>
          </form>
          <h3>Erledigung bestätigen</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                () =>
                  mutate("completeReminder", {
                    id: r.id,
                    revision: r.revision,
                    work_id: String(f.get("work")),
                  }),
                "Intervall anhand der bestätigten Arbeit aktualisiert.",
              );
            }}
          >
            <Field label="Passende abgeschlossene Arbeit">
              <select name="work" required>
                <option value="">Bitte auswählen</option>
                {s.Work.filter(
                  (w) =>
                    w.status === "completed" &&
                    w.kind === r.work_type &&
                    !w.voided,
                ).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title} · {date(w.date)} · {w.odometer_km ?? "offen"} km
                  </option>
                ))}
              </select>
            </Field>
            <Btn type="submit">Anhand dieser Arbeit erledigen</Btn>
          </form>
          <Btn onClick={() => edit("Reminders", r, { voided: !r.voided })}>
            {r.voided ? "Regel wieder aktivieren" : "Regel pausieren"}
          </Btn>
        </section>
      ))}
    </>
  );
}
