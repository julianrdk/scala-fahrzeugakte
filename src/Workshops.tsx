import { Check, Plus, Star } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  Meta,
  Settings,
  Table,
  Workshop,
  WorkshopSnapshot,
} from "../shared/types";
import { Field } from "./Field";
export function WorkshopSelect({
  settings,
  value,
  onChange,
  disabled = false,
  label = "Ausführende Werkstatt",
}: {
  settings: Settings;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Noch nicht zugeordnet</option>
        {(settings.workshops ?? [])
          .filter((w) => !w.archived)
          .map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.id === settings.self_workshop_id ? " · Eigenleistung" : ""}
            </option>
          ))}
      </select>
    </Field>
  );
}
export function WorkshopInfo({
  snapshot,
}: {
  snapshot: WorkshopSnapshot | null | undefined;
}) {
  return snapshot ? (
    <div className="workshop-snapshot">
      <strong>{snapshot.name}</strong>
      {snapshot.address && <span>{snapshot.address}</span>}
    </div>
  ) : null;
}
export function Workshops({
  settings,
  edit,
  supported,
}: {
  settings: Settings;
  edit: (
    table: Table,
    row: Meta,
    patch: Record<string, unknown>,
  ) => Promise<boolean>;
  supported: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(""),
    [address, setAddress] = useState(""),
    [saving, setSaving] = useState(false),
    rows = settings.workshops ?? [];
  function start(profile?: Workshop) {
    setEditing(profile?.id ?? "new");
    setName(profile?.name ?? "");
    setAddress(profile?.address ?? "");
  }
  async function update(
    workshops: Workshop[],
    self = settings.self_workshop_id ?? null,
  ) {
    setSaving(true);
    try {
      return await edit("Settings", settings, {
        workshops,
        self_workshop_id: self,
      });
    } finally {
      setSaving(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const profile = {
        id: editing === "new" ? crypto.randomUUID() : editing!,
        name: name.trim(),
        address: address.trim(),
        archived: rows.find((w) => w.id === editing)?.archived ?? false,
      },
      next =
        editing === "new"
          ? [...rows, profile]
          : rows.map((w) => (w.id === editing ? profile : w));
    if (await update(next)) setEditing(null);
  }
  return (
    <section className="panel workshops-panel">
      <div className="section-heading">
        <h2>Werkstätten</h2>
        <button
          type="button"
          className="button"
          disabled={!supported || saving || rows.length >= 50}
          onClick={() => start()}
        >
          <Plus size={16} /> Werkstatt hinzufügen
        </button>
      </div>
      <p className="muted">
        Eine Werkstatt als Standard für „selbst gemacht“ festlegen. Verkäufer
        einer Rechnung werden separat erfasst.
      </p>
      {!supported && (
        <p className="banner warning">
          Für Werkstattprofile muss zuerst die neue Apps-Script-Version
          bereitgestellt werden. Die Anleitung liegt im Projekt unter „Galerie
          und Belegerkennung einrichten“.
        </p>
      )}
      {rows.map((w) => (
        <div className="workshop-row" key={w.id}>
          <div>
            <strong>{w.name}</strong>
            {w.address && <small>{w.address}</small>}
            {w.archived && <small>Archiviert</small>}
          </div>
          <div className="button-group">
            {settings.self_workshop_id === w.id ? (
              <span className="gallery-default">
                <Star size={15} fill="currentColor" /> Standard für
                Eigenleistung
              </span>
            ) : (
              !w.archived && (
                <button
                  type="button"
                  className="button"
                  disabled={!supported || saving}
                  onClick={() => update(rows, w.id)}
                >
                  <Star size={14} /> Für Eigenleistung
                </button>
              )
            )}
            <button
              type="button"
              className="button"
              disabled={!supported || saving}
              onClick={() => start(w)}
            >
              Bearbeiten
            </button>
            <button
              type="button"
              className="button"
              disabled={!supported || saving}
              onClick={() =>
                update(
                  rows.map((x) =>
                    x.id === w.id ? { ...x, archived: !x.archived } : x,
                  ),
                  settings.self_workshop_id === w.id
                    ? null
                    : (settings.self_workshop_id ?? null),
                )
              }
            >
              {w.archived ? "Aktivieren" : "Archivieren"}
            </button>
          </div>
        </div>
      ))}
      {!rows.length && (
        <p className="muted">Noch keine Werkstatt gespeichert.</p>
      )}
      {settings.self_workshop_id && (
        <button
          type="button"
          className="button"
          disabled={!supported || saving}
          onClick={() => update(rows, null)}
        >
          Eigenleistungsstandard aufheben
        </button>
      )}
      {editing && (
        <form className="workshop-form" onSubmit={save}>
          <h3>
            {editing === "new"
              ? "Werkstatt hinzufügen"
              : "Werkstatt bearbeiten"}
          </h3>
          <Field label="Name der Werkstatt">
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Meine Garage"
            />
          </Field>
          <Field label="Adresse (optional)">
            <textarea
              maxLength={500}
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Straße, Hausnummer, PLZ und Ort"
            />
          </Field>
          <div className="button-group">
            <button className="button primary" disabled={saving || !supported}>
              <Check size={16} /> Speichern
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
