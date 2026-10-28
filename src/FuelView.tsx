import {
  ArrowUpRight,
  Fuel,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  FuelSearchError,
  fuelPrice,
  matchingStations,
  type FuelGrade,
  type FuelPoint,
  type FuelQuery,
  type FuelResult,
  type FuelService,
  type FuelStatus,
} from "../shared/fuel";
import { SignInRequired } from "./adapter";
import "./fuel.css";
import { FuelMap } from "./FuelMap";

const germany: FuelPoint = { lat: 51.16, lng: 10.45, label: "Deutschland" };
const gradeLabels = {
  all: "Alle Kraftstoffe",
  e10: "Super E10",
  e5: "Super E5",
  diesel: "Diesel",
};
export function FuelView({
  service,
  externalUrl,
  testMode = false,
  onReconnect,
}: {
  service: FuelService | null;
  externalUrl: string;
  testMode?: boolean;
  onReconnect?: () => void;
}) {
  const [status, setStatus] = useState<FuelStatus | null>(null),
    [postal, setPostal] = useState(""),
    [query, setQuery] = useState<FuelQuery | null>(null),
    [center, setCenter] = useState(germany),
    [result, setResult] = useState<FuelResult | null>(null);
  const [grade, setGrade] = useState<FuelGrade | "all">("all"),
    [radius, setRadius] = useState(10),
    [openOnly, setOpenOnly] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [locationNote, setLocationNote] = useState(""),
    [locating, setLocating] = useState(false),
    [loading, setLoading] = useState(false),
    [signIn, setSignIn] = useState(false),
    [retryUntil, setRetryUntil] = useState(0),
    [now, setNow] = useState(Date.now());
  const alive = useRef(false),
    locationAttempt = useRef(0),
    retrySeconds = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  const report = useCallback((e: unknown) => {
    setError(
      e instanceof Error
        ? e.message
        : "Die Suche konnte nicht abgeschlossen werden.",
    );
    setSignIn(e instanceof SignInRequired);
    if (e instanceof FuelSearchError && e.retryAfter) {
      setRetryUntil(Date.now() + e.retryAfter * 1000);
      setNow(Date.now());
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      locationAttempt.current++;
    };
  }, []);
  useEffect(() => {
    let canceled = false;
    setStatus(null);
    if (!service) {
      setStatus({ enabled: false, reason: "key" });
      return;
    }
    service
      .fuelStatus()
      .then((s) => {
        if (!canceled) setStatus(s);
      })
      .catch((e) => {
        if (!canceled) {
          setStatus({ enabled: false });
          report(e);
        }
      });
    return () => {
      canceled = true;
    };
  }, [service, report]);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);
  const locate = useCallback(() => {
    const attempt = ++locationAttempt.current;
    setLocationNote("");
    if (!navigator.geolocation) {
      setLocationNote(
        "Standortermittlung ist hier nicht verfügbar. Bitte per PLZ suchen.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!alive.current || attempt !== locationAttempt.current) return;
        setLocating(false);
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Mein Standort",
        };
        setCenter(point);
        setQuery({ lat: point.lat, lng: point.lng });
      },
      (failure) => {
        if (!alive.current || attempt !== locationAttempt.current) return;
        setLocating(false);
        setLocationNote(
          failure.code === 1
            ? "Standort nicht freigegeben. Du kannst stattdessen per PLZ suchen."
            : "Standort konnte nicht ermittelt werden. Bitte per PLZ suchen.",
        );
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }, []);
  useEffect(() => {
    let canceled = false;
    if (!testMode)
      queueMicrotask(() => {
        if (!canceled) locate();
      });
    return () => {
      canceled = true;
    };
  }, [locate, testMode]);
  useEffect(() => {
    if (!service || !status?.enabled || !query) return;
    const controller = new AbortController();
    let canceled = false;
    setLoading(true);
    setError("");
    setResult(null);
    setSelected(null);
    service
      .searchFuel(query, controller.signal)
      .then((data) => {
        if (!canceled) {
          setResult(data);
          setCenter(
            "postalCode" in query
              ? data.center
              : { ...query, label: "Mein Standort" },
          );
          setSignIn(false);
        }
      })
      .catch((e) => {
        if (!canceled) report(e);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
      controller.abort();
    };
  }, [query, status?.enabled, service, report]);
  const found = useMemo(
    () => matchingStations(result?.stations ?? [], grade, radius, openOnly),
    [result, grade, radius, openOnly],
  );
  const selectStation = useCallback((id: string) => setSelected(id), []);
  function postalSearch(event: FormEvent) {
    event.preventDefault();
    const code = postal.trim();
    if (!/^\d{5}$/.test(code)) {
      setError("Bitte eine fünfstellige deutsche PLZ eingeben.");
      return;
    }
    locationAttempt.current++;
    setLocating(false);
    setLocationNote("");
    setQuery({ postalCode: code });
  }
  const disabled = loading || retrySeconds > 0 || !status?.enabled;
  return (
    <section className="fuel-view">
      <div className="fuel-toolbar panel">
        <form onSubmit={postalSearch} className="fuel-search-form">
          <label className="field">
            <span>PLZ in Deutschland</span>
            <div className="fuel-postal-input">
              <MapPin size={18} />
              <input
                aria-label="PLZ in Deutschland"
                value={postal}
                onChange={(e) => setPostal(e.target.value)}
                placeholder="z. B. 10115"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                pattern="[0-9]{5}"
                required
              />
            </div>
          </label>
          <button className="button primary" disabled={disabled}>
            <Search size={17} /> Suchen
          </button>
        </form>
        <button
          className="button"
          onClick={locate}
          disabled={locating || loading || retrySeconds > 0}
        >
          <LocateFixed size={17} />
          {locating ? "Standort wird ermittelt …" : "Mein Standort"}
        </button>
        <a
          className="fuel-external"
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Externe Tankpreis-Seite <ArrowUpRight size={15} />
        </a>
        <div className="fuel-filters">
          <label className="field">
            <span>Kraftstoff</span>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value as FuelGrade | "all")}
            >
              {Object.entries(gradeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Umkreis</span>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {[5, 10, 25].map((km) => (
                <option key={km} value={km}>
                  {km} km
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />{" "}
            Nur geöffnet
          </label>
        </div>
        <p className="fuel-permission-note">
          Standortfreigabe ist optional. Alternativ per PLZ suchen.
        </p>
      </div>
      {status && !status.enabled && !error && (
        <p className="banner warning" role="status">
          {testMode
            ? "Lokaler Testmodus: Hier werden keine Livepreise abgefragt."
            : "Die integrierten Livepreise sind noch nicht eingerichtet. Die Karte und der externe Link sind bereits nutzbar."}
        </p>
      )}
      {locationNote && (
        <p className="banner warning" role="status">
          {locationNote}
        </p>
      )}
      {error && (
        <div className="banner danger" role="alert">
          <span>{error}</span>
          {signIn && onReconnect && (
            <button className="button" onClick={onReconnect}>
              Erneut anmelden
            </button>
          )}
        </div>
      )}
      {retrySeconds > 0 && (
        <p className="muted" role="status">
          Neue Suche in {retrySeconds} Sekunden möglich.
        </p>
      )}
      <div className="fuel-layout">
        <FuelMap
          center={center}
          stations={found}
          grade={grade}
          selected={selected}
          onSelect={selectStation}
        />
        <section
          className="panel fuel-results"
          aria-label="Tankstellen und Preise"
        >
          <div className="section-heading">
            <h2>
              {loading
                ? "Preise werden geladen …"
                : result
                  ? found.length + " Tankstellen"
                  : "Tankstellen in der Nähe"}
            </h2>
            <button
              className="icon-button"
              title="Preise erneut abrufen"
              aria-label="Preise erneut abrufen"
              disabled={disabled || !query}
              onClick={() => query && setQuery({ ...query })}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <p className="muted fuel-search-location">
            <MapPin size={14} />
            {center.label}
          </p>
          {loading && <p role="status">Tankpreise werden abgerufen …</p>}
          {!result && !loading && (
            <div className="fuel-empty">
              <Fuel size={30} />
              <p>
                {status?.enabled
                  ? "Standort freigeben oder eine PLZ eingeben."
                  : "Die Karte lässt sich bereits verschieben und vergrößern."}
              </p>
            </div>
          )}
          {result && !loading && !found.length && (
            <p>
              Keine passenden Tankstellen im gewählten Umkreis. Prüfe Kraftstoff
              und Filter oder vergrößere den Umkreis.
            </p>
          )}
          {found.map((station) => (
            <article
              key={station.id}
              className={
                "fuel-station" + (selected === station.id ? " selected" : "")
              }
            >
              <button
                className="fuel-station-select"
                onClick={() => selectStation(station.id)}
              >
                <span className="fuel-station-name">
                  <strong>{station.name}</strong>
                  <small>
                    {[station.street, station.houseNumber]
                      .filter(Boolean)
                      .join(" ")}{" "}
                    · {station.postCode} {station.place}
                  </small>
                </span>
                <span className="fuel-station-distance">
                  {station.distance.toLocaleString("de-DE", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  km
                </span>
              </button>
              <div className="fuel-station-prices">
                {(grade === "all"
                  ? (["e5", "e10", "diesel"] as const)
                  : [grade]
                ).map((g) => (
                  <div key={g}>
                    <span>{gradeLabels[g]}</span>
                    <strong>
                      {fuelPrice(station.prices[g])}
                      <small> / l</small>
                    </strong>
                  </div>
                ))}
              </div>
              <div className="fuel-station-bottom">
                <span className={station.isOpen ? "fuel-open" : "muted"}>
                  {station.isOpen ? "Geöffnet" : "Geschlossen"}
                </span>
                <a
                  href={
                    "https://www.google.com/maps/dir/?api=1&destination=" +
                    encodeURIComponent(station.lat + "," + station.lng)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Route <ArrowUpRight size={14} />
                </a>
              </div>
            </article>
          ))}
          {result && (
            <p className="fuel-data-source">
              Abruf{" "}
              {new Date(result.fetchedAt).toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              Uhr{result.cached ? " · zwischengespeichert" : ""}
              <br />
              Preise:{" "}
              <a
                href="https://creativecommons.tankerkoenig.de/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Tankerkönig / MTS-K
              </a>{" "}
              ·{" "}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                CC BY 4.0
              </a>
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
