import { ImageOff, RotateCcw, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Doc } from "../shared/types";
import { base64Bytes, type Adapter } from "./adapter";

export class PhotoSession {
  private cache = new Map<string, Promise<string>>();
  private urls = new Set<string>();
  private queue: {
    run: () => Promise<string>;
    resolve: (url: string) => void;
    reject: (error: Error) => void;
    epoch: number;
  }[] = [];
  private running = 0;
  private epoch = 0;
  private closed = false;
  constructor(private adapter: Adapter) {}
  resume() {
    this.closed = false;
  }
  dispose() {
    this.closed = true;
    this.epoch++;
    this.cache.clear();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    for (const task of this.queue) task.reject(Error("Bildsitzung beendet."));
    this.queue = [];
  }
  private pump() {
    while (!this.closed && this.running < 2 && this.queue.length) {
      const task = this.queue.shift()!;
      this.running++;
      task
        .run()
        .then((url) => {
          if (this.closed || task.epoch !== this.epoch) {
            URL.revokeObjectURL(url);
            task.reject(Error("Bildsitzung beendet."));
          } else {
            this.urls.add(url);
            task.resolve(url);
          }
        }, task.reject)
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
  private schedule(run: () => Promise<string>) {
    return new Promise<string>((resolve, reject) => {
      if (this.closed) {
        reject(Error("Bildsitzung beendet."));
        return;
      }
      this.queue.push({ run, resolve, reject, epoch: this.epoch });
      this.pump();
    });
  }
  private async blob(doc: Doc) {
    const file = await this.adapter.call("document", { id: doc.id });
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.mime))
      throw Error("Fahrzeugfoto konnte nicht geladen werden.");
    return new Blob([base64Bytes(file.base64)], { type: file.mime });
  }
  thumbnail(doc: Doc) {
    const key = doc.id + ":" + doc.sha256;
    const stored = this.cache.get(key);
    if (stored) return stored;
    const job = this.schedule(async () => {
      if (this.adapter.thumbnail)
        return URL.createObjectURL(await this.adapter.thumbnail(doc));
      const bitmap = await createImageBitmap(await this.blob(doc));
      try {
        const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height)),
          canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw Error("Bildvorschau nicht verfügbar.");
        context.fillStyle = "#f5f4ef";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const image = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(Error("Bildvorschau nicht verfügbar.")),
            "image/jpeg",
            0.83,
          ),
        );
        return URL.createObjectURL(image);
      } finally {
        bitmap.close();
      }
    });
    this.cache.set(key, job);
    job.catch(() => {
      if (this.cache.get(key) === job) this.cache.delete(key);
    });
    return job;
  }
  full(doc: Doc) {
    return this.schedule(async () => URL.createObjectURL(await this.blob(doc)));
  }
  release(url: string) {
    if (this.urls.delete(url)) URL.revokeObjectURL(url);
  }
}
type PhotoContext = { session: PhotoSession; show: (doc: Doc) => void };
const Context = createContext<PhotoContext | null>(null);
export function PhotoProvider({
  adapter,
  accountKey,
  children,
}: {
  adapter: Adapter;
  accountKey: string;
  children: ReactNode;
}) {
  const session = useMemo(
      () => new PhotoSession(adapter),
      [adapter, accountKey],
    ),
    [selected, setSelected] = useState<Doc | null>(null);
  useLayoutEffect(() => {
    session.resume();
    setSelected(null);
    return () => session.dispose();
  }, [session]);
  const value = useMemo(() => ({ session, show: setSelected }), [session]);
  return (
    <Context.Provider value={value}>
      {children}
      {selected && (
        <PhotoLightbox
          key={selected.id}
          doc={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </Context.Provider>
  );
}
function usePhotos() {
  const value = useContext(Context);
  if (!value) throw Error("Bildsitzung fehlt.");
  return value;
}
export function Photo({
  doc,
  priority = false,
  natural = false,
}: {
  doc: Doc;
  priority?: boolean;
  natural?: boolean;
}) {
  const { session, show } = usePhotos(),
    host = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(priority),
    [url, setUrl] = useState(""),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [ratio, setRatio] = useState(1.5);
  useEffect(() => {
    if (visible || !host.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "180px" },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    let canceled = false;
    setError(false);
    setUrl("");
    session
      .thumbnail(doc)
      .then((value) => {
        if (!canceled) setUrl(value);
      })
      .catch(() => {
        if (!canceled) setError(true);
      });
    return () => {
      canceled = true;
    };
  }, [session, doc.id, doc.sha256, visible, retry]);
  return (
    <div
      className={"photo-frame" + (natural ? " natural-photo" : "")}
      ref={host}
      style={
        natural
          ? { aspectRatio: String(ratio), maxWidth: ratio * 340 + "px" }
          : undefined
      }
    >
      {error ? (
        <button
          type="button"
          className="photo-retry"
          onClick={() => setRetry((x) => x + 1)}
        >
          <ImageOff size={19} />
          <span>Foto nicht geladen</span>
          <small>
            <RotateCcw size={12} /> Erneut laden
          </small>
        </button>
      ) : (
        <button
          type="button"
          className="photo-open"
          onClick={() => show(doc)}
          aria-label={doc.title + " groß ansehen"}
        >
          {url ? (
            <img
              src={url}
              alt={doc.title}
              decoding="async"
              onLoad={(e) => {
                if (natural && e.currentTarget.naturalHeight)
                  setRatio(
                    e.currentTarget.naturalWidth /
                      e.currentTarget.naturalHeight,
                  );
              }}
            />
          ) : (
            <span className="photo-placeholder" role="status">
              Foto wird geladen …
            </span>
          )}
        </button>
      )}
    </div>
  );
}
function PhotoLightbox({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const { session } = usePhotos(),
    dialog = useRef<HTMLDialogElement>(null),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let canceled = false,
      objectUrl = "";
    setError("");
    setUrl("");
    session
      .full(doc)
      .then((value) => {
        objectUrl = value;
        if (canceled) session.release(value);
        else setUrl(value);
      })
      .catch(() => {
        if (!canceled) setError("Das Original konnte nicht geladen werden.");
      });
    return () => {
      canceled = true;
      if (objectUrl) session.release(objectUrl);
    };
  }, [session, doc.id, retry]);
  return (
    <dialog
      className="photo-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="photo-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="photo-dialog-header">
        <h2 id="photo-dialog-title">{doc.title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Foto schließen"
          onClick={onClose}
          autoFocus
        >
          <X size={22} />
        </button>
      </div>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="button" onClick={() => setRetry((x) => x + 1)}>
            Erneut laden
          </button>
        </div>
      ) : url ? (
        <img src={url} alt={doc.title} />
      ) : (
        <p role="status">Original wird geladen …</p>
      )}
    </dialog>
  );
}
