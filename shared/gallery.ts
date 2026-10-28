import type { State } from "./types";
export function galleryPhotos(s: State) {
  const chosen = s.Vehicles[0].photo_id;
  return s.Documents.filter(
    (d) =>
      !d.missing &&
      !d.archived &&
      !d.voided &&
      d.mime?.startsWith("image/") &&
      (d.document_type === "photo" || d.id === chosen),
  ).sort(
    (a, b) =>
      Number(b.id === chosen) - Number(a.id === chosen) ||
      b.created_at.localeCompare(a.created_at) ||
      a.id.localeCompare(b.id),
  );
}
