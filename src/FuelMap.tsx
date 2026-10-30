import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { fuelPrice, type FuelPoint, type FuelStation } from "../shared/fuel";

export function FuelMap({
  center,
  position,
  stations,
  selected,
  onSelect,
  onViewChange,
}: {
  center: FuelPoint;
  position: FuelPoint | null;
  stations: FuelStation[];
  selected: string | null;
  onSelect: (id: string) => void;
  onViewChange: (point: FuelPoint, byUser: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    library = useRef<typeof Leaflet | null>(null),
    markers = useRef(new Map<string, Leaflet.Marker>()),
    layers = useRef<Leaflet.LayerGroup | null>(null),
    positionLayer = useRef<Leaflet.LayerGroup | null>(null),
    tiles = useRef<Leaflet.TileLayer | null>(null),
    programmatic = useRef(false),
    moved = useRef(onViewChange);
  moved.current = onViewChange;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    import("leaflet")
      .then((L) => {
        if (cancelled || !host.current) return;
        library.current = L;
        const view = L.map(host.current, { scrollWheelZoom: true }).setView(
          [center.lat, center.lng],
          center.label === "Deutschland" ? 6 : 13,
        );
        map.current = view;
        let loaded = 0,
          failed = 0;
        const tileLayer = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            referrerPolicy: "strict-origin-when-cross-origin",
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          },
        );
        tileLayer.on("loading", () => {
          loaded = 0;
          failed = 0;
        });
        tileLayer.on("tileload", () => {
          loaded++;
          setError(false);
        });
        tileLayer.on("tileerror", () => {
          failed++;
        });
        tileLayer.on("load", () => setError(failed > 0 && loaded === 0));
        tiles.current = tileLayer.addTo(view);
        layers.current = L.layerGroup().addTo(view);
        positionLayer.current = L.layerGroup().addTo(view);
        view.on("moveend", () => {
          const p = view.getCenter();
          moved.current(
            { lat: p.lat, lng: p.lng, label: "Suchbereich" },
            !programmatic.current,
          );
        });
        setReady(true);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      tiles.current = null;
      layers.current = null;
      positionLayer.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    if (!ready || !map.current) return;
    programmatic.current = true;
    map.current.setView(
      [center.lat, center.lng],
      center.label === "Deutschland" ? 6 : 13,
      { animate: false },
    );
    programmatic.current = false;
  }, [ready, center]);
  useEffect(() => {
    const L = library.current,
      group = positionLayer.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (position) {
      const label = document.createElement("span");
      label.textContent = "Mein Standort";
      L.circleMarker([position.lat, position.lng], {
        radius: 7,
        color: "#fff",
        weight: 3,
        fillColor: "#2563eb",
        fillOpacity: 1,
      })
        .bindTooltip(label)
        .addTo(group);
    }
  }, [ready, position]);
  useEffect(() => {
    const L = library.current,
      group = layers.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    markers.current.clear();
    for (const station of stations) {
      const icon = L.divIcon({
          className: "fuel-map-marker" + (station.isOpen ? "" : " closed"),
          html: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
        marker = L.marker([station.lat, station.lng], {
          icon,
          title: station.name,
          keyboard: true,
        }).addTo(group),
        node = marker.getElement();
      if (node) {
        node.textContent = "⛽";
        node.setAttribute("aria-label", station.name);
      }
      const popup = document.createElement("div"),
        title = document.createElement("strong"),
        address = document.createElement("p"),
        prices = document.createElement("p");
      title.textContent = station.name;
      address.textContent = [
        station.street,
        station.houseNumber,
        station.postCode,
        station.place,
      ]
        .filter(Boolean)
        .join(" ");
      prices.textContent =
        "E5: " +
        fuelPrice(station.prices.e5) +
        " · E10: " +
        fuelPrice(station.prices.e10) +
        " · Diesel: " +
        fuelPrice(station.prices.diesel);
      popup.append(title, address, prices);
      marker.bindPopup(popup).on("click", () => onSelect(station.id));
      markers.current.set(station.id, marker);
    }
  }, [ready, stations, onSelect]);
  useEffect(() => {
    if (!selected) return;
    const marker = markers.current.get(selected),
      view = map.current;
    if (marker && view) {
      programmatic.current = true;
      view.panTo(marker.getLatLng(), { animate: false });
      marker.openPopup();
      programmatic.current = false;
    }
  }, [selected, ready, stations]);
  return (
    <div className="fuel-map-wrap">
      <div
        ref={host}
        className="fuel-map"
        role="region"
        aria-label="Karte der Tankstellen"
      />
      <span className="fuel-map-center" aria-label="Suchmittelpunkt">
        +
      </span>
      {!ready && !error && (
        <p className="fuel-map-loading" role="status">
          Karte wird geladen …
        </p>
      )}
      {error && (
        <div className="fuel-map-notice" role="status">
          Karte nicht verfügbar{" "}
          <button
            type="button"
            className="button"
            onClick={() => {
              setError(false);
              if (tiles.current) tiles.current.redraw();
              else setAttempt((n) => n + 1);
            }}
          >
            Erneut laden
          </button>
        </div>
      )}
    </div>
  );
}
