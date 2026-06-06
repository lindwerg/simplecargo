import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";

import { env } from "@/lib/env";

// Thin filesystem layer over the document store (a mounted Railway volume in prod,
// ./.storage locally). Keys are ALWAYS built server-side — external filenames are
// never trusted for the on-disk path (only kept as metadata). Every read/write is
// guarded so a key can never escape the storage root (path-traversal defence).

// Upload guardrails. Kept here so the API route and the storage layer agree.
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20 MB

// MIME → canonical extension. Whitelist doubles as the accept filter.
const ALLOWED_MIME: Readonly<Record<string, string>> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

export function isAllowedMime(mime: string): boolean {
  return mime in ALLOWED_MIME;
}

export function allowedMimeList(): string[] {
  return Object.keys(ALLOWED_MIME);
}

function storageRoot(): string {
  return resolve(env.STORAGE_DIR);
}

// Resolve a relative key to an absolute path and assert it stays inside the root.
// Throws on any attempt to climb out (../, absolute keys, symlink-style tricks).
function resolveKey(relKey: string): string {
  const root = storageRoot();
  const abs = resolve(root, relKey);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error("Недопустимый путь к файлу");
  }
  return abs;
}

// Build a safe, collision-free key for a counterparty document. The extension is
// taken from the validated MIME first, falling back to the (sanitised) original.
export function buildDocumentKey(counterpartyId: string, mimeType: string, originalName: string): string {
  const safeId = /^[0-9a-f-]{36}$/i.test(counterpartyId) ? counterpartyId : "_";
  const fromMime = ALLOWED_MIME[mimeType];
  const fromName = extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const ext = fromMime ?? (fromName.length <= 8 ? fromName : "");
  return join("counterparties", safeId, `${randomUUID()}${ext}`);
}

export async function saveFile(relKey: string, data: Buffer): Promise<void> {
  const abs = resolveKey(relKey);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, data);
}

export async function readStoredFile(relKey: string): Promise<Buffer> {
  return readFile(resolveKey(relKey));
}

export async function deleteFile(relKey: string): Promise<void> {
  try {
    await unlink(resolveKey(relKey));
  } catch (error: unknown) {
    // A missing file is not an error for delete — the metadata row is the source
    // of truth and may outlive a manually-removed blob. Re-throw anything else.
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
}

// SHA-256 of file bytes — handy for future dedupe; not persisted yet.
export function hashBuffer(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
