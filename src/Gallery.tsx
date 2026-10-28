import {
  ArrowUpRight,
  Check,
  ImagePlus,
  Images,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { galleryPhotos } from "../shared/gallery";
import { blankPackage, MAX_FILE } from "../shared/logic";
import type { Meta, State, Table } from "../shared/types";
import { vehicleName } from "../shared/vehicle";
import { prepareFile, type Adapter } from "./adapter";
import "./gallery.css";
import { Photo } from "./PhotoSession";
type Runner = (
  action: () => Promise<void>,
  success?: string,
) => Promise<boolean>;
function useSmall() {
  const [small, setSmall] = useState(
    () => matchMedia("(max-width: 600px)").matches,
  );
  useEffect(() => {
    const m = matchMedia("(max-width: 600px)"),
      update = () => setSmall(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return small;
}
export function VehicleHero({ s, total }: { s: State; total?: number }) {
  const photos = galleryPhotos(s),
    small = useSmall(),
    shown = photos.slice(0, small ? 4 : 10),
    count = Math.max(total ?? photos.length, photos.length),
    extra = count - shown.length,
    vehicle = s.Vehicles[0];
  return (
    <section
      className={
        "vehicle-hero vehicle-pinboard" + (shown.length ? " has-photos" : "")
      }
    >
      <div className="vehicle-hero-info">
        <span className="hero-eyebrow">MEIN FAHRZEUG</span>
        <h2>{vehicleName(vehicle)}</h2>
        {vehicle.engine && <p>{vehicle.engine}</p>}
        <a href="#/fahrzeug">
          Fahrzeug ansehen <ArrowUpRight size={15} />
        </a>
        {photos.length > 0 && (
          <a className="hero-gallery-link" href="#/fahrzeug/galerie">
            <Images size={15} />
            {count} {count === 1 ? "Foto" : "Fotos"} in der Galerie
          </a>
        )}
      </div>
      {shown.length ? (
        <div
          className={"pinboard-board count-" + shown.length}
          aria-label="Fahrzeugbilder"
        >
          <div className="pinboard-main">
            <Photo doc={shown[0]} priority />
          </div>
          {shown.length > 1 && (
            <div className={"pinboard-thumbs count-" + (shown.length - 1)}>
              {shown.slice(1).map((doc) => (
                <Photo key={doc.id} doc={doc} />
              ))}
            </div>
          )}
          {extra > 0 && (
            <a className="pinboard-more" href="#/fahrzeug/galerie">
              + {extra} weitere
            </a>
          )}
        </div>
      ) : (
        <div className="car-illustration">
          <svg viewBox="0 0 500 180" role="img" aria-label="Fahrzeugsymbol">
            <path
              d="m30 120 22-37 79-17 71-42h112l77 49 69 13 16 28-10 24H34Z"
              fill="#f9faf8"
              stroke="#859d8f"
              strokeWidth="2"
            />
            <path d="m151 67 59-34h92l53 35Z" fill="#b9cdc1" />
            <path
              d="M250 34v35m-81 13h155m-193 21H65m364-4h25"
              fill="none"
              stroke="#7b9586"
              strokeWidth="3"
            />
            <circle cx="127" cy="135" r="31" fill="#2f3935" />
            <circle cx="127" cy="135" r="17" fill="#ccd4cd" />
            <circle cx="374" cy="135" r="31" fill="#2f3935" />
            <circle cx="374" cy="135" r="17" fill="#ccd4cd" />
          </svg>
        </div>
      )}
    </section>
  );
}
export function Gallery({
  s,
  adapter,
  edit,
  run,
  refresh,
  busy,
}: {
  s: State;
  adapter: Adapter;
  edit: (
    t: Table,
    row: Meta,
    patch: Record<string, unknown>,
  ) => Promise<boolean>;
  run: Runner;
  refresh: () => Promise<void>;
  busy: boolean;
}) {
  const photos = galleryPhotos(s),
    [files, setFiles] = useState<File[]>([]),
    [urls, setUrls] = useState<string[]>([]),
    [operation, setOperation] = useState(() => crypto.randomUUID()),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [frozen, setFrozen] = useState(false);
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach(URL.revokeObjectURL);
  }, [files]);
  function select(input: File[]) {
    setError("");
    if (
      input.some(
        (f) =>
          !/^image\/(jpeg|png|webp)$/.test(f.type) ||
          f.size > MAX_FILE ||
          !f.size,
      )
    ) {
      setError("Bitte JPG, PNG oder WebP mit maximal 4 MiB je Bild auswählen.");
      return;
    }
    if (input.length > 100) {
      setError("Bitte höchstens 100 Bilder auf einmal auswählen.");
      return;
    }
    setFiles(input);
    setOperation(crypto.randomUUID());
  }
  async function save() {
    const ok = await run(async () => {
      setFrozen(true);
      try {
        for (const [i, file] of files.entries()) {
          setProgress(
            "Bild " + (i + 1) + " von " + files.length + " wird geprüft …",
          );
          await prepareFile(file);
        }
        const p = blankPackage(),
          documents: Record<string, string> = {};
        for (const [i, original] of files.entries()) {
          setProgress(
            "Bild " + (i + 1) + " von " + files.length + " wird gespeichert …",
          );
          const file = await prepareFile(original),
            ref = "photo" + (i + 1),
            upload = await adapter.call("upload", {
              operation_id: operation,
              file,
            });
          documents[ref] = upload.id;
          p.documents.push({
            ref,
            title: file.source_filename.replace(/\.[^.]+$/, ""),
            source_filename: file.source_filename,
            document_type: "photo",
          });
        }
        await adapter.call("commit", {
          operation_id: operation,
          package: p,
          documents,
          allow_missing: false,
          confirm_reminders: false,
          duplicate_override_reason: null,
          links: {},
        });
        await refresh();
      } finally {
        setProgress("");
      }
    }, "Fahrzeugbilder gespeichert. Das Standardfoto wählst du in der Galerie.");
    if (ok) {
      setFiles([]);
      setOperation(crypto.randomUUID());
    }
    setFrozen(false);
  }
  return (
    <section className="panel gallery-panel">
      <div className="section-heading">
        <div>
          <h2>Galerie</h2>
          <p className="muted">
            {photos.length}{" "}
            {photos.length === 1 ? "Fahrzeugbild" : "Fahrzeugbilder"} ·
            Standardfoto für die Übersicht auswählen
          </p>
        </div>
      </div>
      <div className="gallery-upload">
        <label className="button">
          <ImagePlus size={18} /> Bilder auswählen
          <input
            className="sr-only"
            type="file"
            aria-label="Fahrzeugbilder auswählen"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple
            disabled={busy || frozen}
            onChange={(e) => {
              select(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
        <span className="muted">JPG, PNG oder WebP · bis 4 MiB je Bild</span>
      </div>
      {error && (
        <p className="banner danger" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <div className="gallery-pending">
          <h3>Vor dem Speichern prüfen</h3>
          <div className="gallery-grid">
            {files.map((file, i) => (
              <article className="gallery-card" key={i}>
                <div className="gallery-local-photo">
                  {urls[i] && (
                    <img
                      src={urls[i]}
                      alt={file.name}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                </div>
                <p>{file.name}</p>
                <button
                  type="button"
                  className="button"
                  disabled={frozen || busy}
                  onClick={() => {
                    setFiles((x) => x.filter((_, j) => j !== i));
                    setOperation(crypto.randomUUID());
                  }}
                >
                  <Trash2 size={14} /> Auswahl entfernen
                </button>
              </article>
            ))}
          </div>
          <button
            type="button"
            className="button primary"
            disabled={!files.length || busy || frozen}
            onClick={save}
          >
            {busy ? (
              <>{progress || "Wird gespeichert …"}</>
            ) : (
              <>
                <Check size={17} />{" "}
                {files.length === 1 ? "Bild speichern" : "Bilder speichern"}
              </>
            )}
          </button>
        </div>
      )}
      {photos.length ? (
        <div className="gallery-grid">
          {photos.map((doc) => (
            <article className="gallery-card" key={doc.id}>
              <Photo doc={doc} />
              <div className="gallery-card-info">
                <strong>{doc.title}</strong>
                {s.Vehicles[0].photo_id === doc.id ? (
                  <span className="gallery-default">
                    <Star size={15} fill="currentColor" /> Standardfoto
                  </span>
                ) : (
                  <button
                    type="button"
                    className="button"
                    disabled={busy || frozen}
                    onClick={() =>
                      edit("Vehicles", s.Vehicles[0], { photo_id: doc.id })
                    }
                  >
                    <Star size={15} /> Als Standardfoto verwenden
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        !files.length && (
          <div className="gallery-empty">
            <Images size={35} />
            <h3>Noch keine Fahrzeugbilder</h3>
            <p>
              Wähle Bilder aus. Nach dem Speichern kannst du dein Standardfoto
              festlegen.
            </p>
          </div>
        )
      )}
    </section>
  );
}
