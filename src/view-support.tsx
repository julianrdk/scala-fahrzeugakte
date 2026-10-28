import { FolderOpen } from "lucide-react";
import { type ReactNode } from "react";
import "./cloudflare.css";
import "./login.css";
export const money = (
  c: number | null | undefined,
  currency: string | null = "EUR",
) =>
  c == null
    ? "Betrag unbekannt"
    : currency === null
      ? (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) +
        " (Währung offen)"
      : new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(
          c / 100,
        );
export const date = (d: string | null | undefined) =>
  d ? d.split("-").reverse().join(".") : "Datum unbekannt";
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(),
  );
export const number = (x: string) => {
  if (!x.trim()) return null;
  const n = Number(x.replace(",", "."));
  if (!Number.isFinite(n)) throw Error("Bitte eine gültige Zahl eingeben.");
  return n;
};
export const cents = (x: string) => {
  if (!x.trim()) return null;
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(x.trim()))
    throw Error("Betrag bitte mit höchstens zwei Nachkommastellen eingeben.");
  return Math.round(Number(x.replace(",", ".")) * 100);
};
export const numText = (x: number | null | undefined) =>
  x == null ? "" : String(x).replace(".", ",");
export function Btn({
  children,
  onClick,
  primary = false,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={primary ? "button primary" : "button"}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export const workKinds = {
  maintenance: "Wartung",
  repair: "Reparatur",
  modification: "Umbau",
  inspection: "HU / Prüfung",
  other: "Andere Arbeit",
};
export const dueLabels = {
  due: "Fällig",
  soon: "Bald fällig",
  later: "Geplant",
  paused: "Erledigt / pausiert",
};
export const docTypes = {
  invoice: "Rechnung",
  receipt: "Beleg",
  contract: "Vertrag",
  approval: "ABE / Genehmigung",
  inspection: "Prüfbericht",
  service_history: "Serviceheft",
  photo: "Foto",
  other: "Sonstiges",
};
export type Runner = (
  action: () => Promise<void>,
  success?: string,
) => Promise<boolean>;
