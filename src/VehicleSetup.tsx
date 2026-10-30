import { useState } from "react";
import type { VehicleCreation } from "../shared/vehicle";
import { VehicleCatalogFields, identityFromForm } from "./VehicleCatalogFields";
import { Field } from "./Field";

export function VehicleSetup({
  busy,
  error,
  onSave,
  onLogout,
  testMode = false,
}: {
  busy: boolean;
  error: string;
  onSave: (input: VehicleCreation) => void;
  onLogout?: () => void;
  testMode?: boolean;
}) {
  const [selecting, setSelecting] = useState(true);
  return (
    <div className="login-screen">
      <main className="login-card">
        <h1>Fahrzeug hinzufügen</h1>
        {testMode && <p className="banner test">Testmodus · nur lokal</p>}
        {error && (
          <div className="banner danger" role="alert">
            {error}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (busy || selecting) return;
            const data = new FormData(e.currentTarget);
            onSave({
              ...identityFromForm(data),
              year: String(data.get("year") ?? "").trim(),
              engine: String(data.get("engine") ?? "").trim() || null,
            });
          }}
        >
          <VehicleCatalogFields initiallyOpen onSelecting={setSelecting} />
          <label className="field">
            <span>Baujahr (optional)</span>
            <input
              name="year"
              placeholder="z. B. 2020"
              maxLength={4}
              inputMode="numeric"
              pattern="[0-9]{4}"
            />
          </label>
          <Field label="Motor / Motorkennbuchstabe">
            <input name="engine" maxLength={100} />
          </Field>
          <button className="button primary" disabled={busy || selecting}>
            {busy ? "Wird gespeichert …" : "Fahrzeug hinzufügen"}
          </button>
        </form>
        {onLogout && (
          <button className="button" disabled={busy} onClick={onLogout}>
            Abmelden
          </button>
        )}
      </main>
    </div>
  );
}
