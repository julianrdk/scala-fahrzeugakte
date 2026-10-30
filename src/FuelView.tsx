import { ArrowUpRight, Fuel, LocateFixed, MapPin, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FuelSearchError,
  fuelPrice,
  matchingStations,
  type FuelPoint,
  type FuelResult,
  type FuelService,
  type FuelStatus,
} from "../shared/fuel";
import { SignInRequired } from "./adapter";
import "./fuel.css";
import { FuelMap } from "./FuelMap";

const germany: FuelPoint = { lat: 51.16, lng: 10.45, label: "Deutschland" };
const grades = { e5: "Super E5", e10: "Super E10", diesel: "Diesel" } as const;
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
    [target, setTarget] = useState(germany),
    [position, setPosition] = useState<FuelPoint | null>(null),
    [result, setResult] = useState<FuelResult | null>(null),
    [radius, setRadius] = useState(10),
    [openOnly, setOpenOnly] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [locating, setLocating] = useState(false),
    [loading, setLoading] = useState(false),
    [signIn, setSignIn] = useState(false),
    [retryUntil, setRetryUntil] = useState(0),
    [now, setNow] = useState(Date.now());
  const alive = useRef(false),
    searchLock = useRef(false),
    locationAttempt = useRef(0),
    priceAttempt = useRef(0),
    point = useRef(germany),
    resolvedPostal = useRef(""),
    locationController = useRef<AbortController | null>(null),
    priceController = useRef<AbortController | null>(null);
  const retrySeconds = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  const report = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Suche fehlgeschlagen.");
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
      priceAttempt.current++;
      locationController.current?.abort();
      priceController.current?.abort();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    if (!service) {
      setStatus({ enabled: false, reason: "key" });
      return;
    }
    service
      .fuelStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus({ enabled: false });
          report(e);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [service, report]);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);
  const locate = useCallback(() => {
    const attempt = ++locationAttempt.current;
    locationController.current?.abort();
    setError("");
    if (!navigator.geolocation) {
      setError("Standort nicht verfügbar.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!alive.current || attempt !== locationAttempt.current) return;
        const next = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          label: "Mein Standort",
        };
        point.current = next;
        resolvedPostal.current = "";
        setPostal("");
        setPosition(next);
        setTarget(next);
        setLocating(false);
      },
      () => {
        if (alive.current && attempt === locationAttempt.current) {
          setLocating(false);
          setError("Standort nicht verfügbar.");
        }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }, []);
  useEffect(() => {
    if (!testMode) locate();
  }, [testMode, locate]);
  const moved = useCallback((next: FuelPoint, byUser: boolean) => {
    point.current = next;
    if (byUser) {
      locationAttempt.current++;
      locationController.current?.abort();
      setLocating(false);
      resolvedPostal.current = "";
      setPostal("");
    }
  }, []);
  async function showPostal(): Promise<FuelPoint | null> {
    const code = postal.trim();
    if (!/^\d{5}$/.test(code)) {
      setError("Bitte eine fünfstellige deutsche PLZ eingeben.");
      return null;
    }
    if (!service) return null;
    const attempt = ++locationAttempt.current,
      controller = new AbortController();
    locationController.current?.abort();
    locationController.current = controller;
    setLocating(true);
    setError("");
    try {
      const next = await service.resolveFuelLocation(code, controller.signal);
      if (
        !alive.current ||
        controller.signal.aborted ||
        attempt !== locationAttempt.current
      )
        return null;
      point.current = next;
      resolvedPostal.current = code;
      setTarget(next);
      return next;
    } catch (e) {
      if (
        alive.current &&
        !controller.signal.aborted &&
        attempt === locationAttempt.current
      )
        report(e);
      return null;
    } finally {
      if (alive.current && attempt === locationAttempt.current)
        setLocating(false);
    }
  }
  async function search() {
    if (!service || searchLock.current || retrySeconds || !status?.enabled)
      return;
    searchLock.current = true;
    const attempt = ++priceAttempt.current,
      controller = new AbortController();
    priceController.current?.abort();
    priceController.current = controller;
    setLoading(true);
    setError("");
    try {
      const next =
        postal.trim() && postal.trim() !== resolvedPostal.current
          ? await showPostal()
          : point.current;
      if (
        !next ||
        !alive.current ||
        attempt !== priceAttempt.current ||
        controller.signal.aborted
      )
        return;
      const data = await service.searchFuel(
        { lat: next.lat, lng: next.lng },
        controller.signal,
      );
      if (
        !alive.current ||
        attempt !== priceAttempt.current ||
        controller.signal.aborted
      )
        return;
      setResult(data);
      setSelected(null);
      setSignIn(false);
    } catch (e) {
      if (
        alive.current &&
        attempt === priceAttempt.current &&
        !controller.signal.aborted
      )
        report(e);
    } finally {
      searchLock.current = false;
      if (alive.current && attempt === priceAttempt.current) setLoading(false);
    }
  }
  const found = useMemo(
    () => matchingStations(result?.stations ?? [], "all", radius, openOnly),
    [result, radius, openOnly],
  );
  const selectStation = useCallback((id: string) => setSelected(id), []);
  return (
    <section className="fuel-view">
      <div className="fuel-toolbar panel">
        <form
          className="fuel-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            void showPostal();
          }}
        >
          <label className="field">
            <span>PLZ</span>
            <div className="fuel-postal-input">
              <MapPin size={18} />
              <input
                aria-label="PLZ"
                value={postal}
                onChange={(e) => {
                  locationAttempt.current++;
                  locationController.current?.abort();
                  setLocating(false);
                  setPostal(e.target.value);
                }}
                placeholder="10115"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
              />
            </div>
          </label>
          <button
            type="submit"
            className="icon-button"
            aria-label="Ort anzeigen"
            title="Ort anzeigen"
            disabled={locating || !postal.trim()}
          >
            <MapPin size={18} />
          </button>
        </form>
        <button
          className="icon-button"
          onClick={locate}
          disabled={locating}
          title="Mein Standort"
          aria-label="Mein Standort"
        >
          <LocateFixed size={19} />
        </button>
        <button
          className="button primary"
          onClick={() => void search()}
          disabled={loading || locating || retrySeconds > 0 || !status?.enabled}
        >
          <Search size={17} />
          {loading
            ? "Suche läuft …"
            : retrySeconds
              ? "Suchen (" + retrySeconds + "s)"
              : "Suchen"}
        </button>
        <div className="fuel-filters">
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
            />
            Nur geöffnet
          </label>
          <a
            className="fuel-external"
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Externe Suche <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
      {status && !status.enabled && !error && (
        <p className="banner warning" role="status">
          {testMode
            ? "Keine Livepreise im Testmodus."
            : "Livepreise nicht eingerichtet."}
        </p>
      )}
      {error && (
        <div className="banner danger" role="alert">
          {error}
          {signIn && onReconnect && (
            <button className="button" onClick={onReconnect}>
              Erneut anmelden
            </button>
          )}
        </div>
      )}
      <div className="fuel-layout">
        <FuelMap
          center={target}
          position={position}
          stations={found}
          selected={selected}
          onSelect={selectStation}
          onViewChange={moved}
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
                  : "Tankstellen"}
            </h2>
          </div>
          {!result && !loading && (
            <div className="fuel-empty">
              <Fuel size={30} />
            </div>
          )}
          {result && !loading && !found.length && (
            <p>Keine Tankstellen im gewählten Umkreis.</p>
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
                {(Object.keys(grades) as (keyof typeof grades)[]).map((g) => (
                  <div key={g}>
                    <span>{grades[g]}</span>
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
              Uhr{result.cached ? " · Cache" : ""}
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
