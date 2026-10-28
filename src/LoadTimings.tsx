import { useState } from "react";
import { readTimings } from "./timings";
export function LoadTimings() {
  const [rows, setRows] = useState(readTimings);
  return (
    <details>
      <summary>Ladezeiten dieses Tabs</summary>
      <p className="muted">
        Messwerte verbleiben in diesem Tab und werden beim Abmelden verworfen.
        „Anmeldung prüfen“ misst die Sitzungsprüfung, ohne die Zeit für deine
        Passworteingabe. Aktenstart und Speichern enthalten die Tokenbeschaffung
        und Serverantwort.
      </p>
      <button className="button" onClick={() => setRows(readTimings())}>
        Messwerte aktualisieren
      </button>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Vorgang</th>
                <th>Dauer</th>
                <th>Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.kind}</td>
                  <td>{r.ms} ms</td>
                  <td>{r.ok ? "Bestätigt" : "Nicht bestätigt"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Noch keine Messwerte.</p>
      )}
    </details>
  );
}
