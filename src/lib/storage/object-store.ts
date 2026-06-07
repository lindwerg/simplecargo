// NODE-only S3-compatible object storage adapter (Railway Bucket / Tigris).
// Хранит оригиналы писем: сырое .eml, HTML-тело, вложения — общий для web и
// mail-worker store (volume между сервисами не делится, поэтому bucket). Если
// креды не заданы (STORAGE_S3_*), isObjectStoreConfigured()=false и вызывающий
// код деградирует на Postgres bytea. Импортируется только серверным кодом.

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

let client: S3Client | null = null;

export function isObjectStoreConfigured(): boolean {
  return Boolean(
    env.STORAGE_S3_ENDPOINT &&
      env.STORAGE_S3_BUCKET &&
      env.STORAGE_S3_ACCESS_KEY_ID &&
      env.STORAGE_S3_SECRET_ACCESS_KEY,
  );
}

function s3(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: env.STORAGE_S3_REGION,
    endpoint: env.STORAGE_S3_ENDPOINT!,
    forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

/** Upload bytes under a key. Throws on failure — callers wrap so a storage hiccup
 *  never loses the email itself (worker falls back to bytea). */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: env.STORAGE_S3_BUCKET!, Key: key, Body: body, ContentType: contentType }),
  );
}

export interface ObjectStream {
  stream: ReadableStream;
  contentType: string | null;
  contentLength: number | null;
}

interface SdkBody {
  transformToWebStream(): ReadableStream;
  transformToByteArray(): Promise<Uint8Array>;
}

/** Stream an object for serving. Returns null on a missing key (NoSuchKey) or any
 *  error so the caller can fall back to bytea. */
export async function getObjectStream(key: string): Promise<ObjectStream | null> {
  try {
    const out: GetObjectCommandOutput = await s3().send(
      new GetObjectCommand({ Bucket: env.STORAGE_S3_BUCKET!, Key: key }),
    );
    if (!out.Body) return null;
    return {
      stream: (out.Body as unknown as SdkBody).transformToWebStream(),
      contentType: out.ContentType ?? null,
      contentLength: out.ContentLength ?? null,
    };
  } catch {
    return null;
  }
}

/** Full bytes of an object (for HTML body rewriting). Null if missing/error. */
export async function getObjectBytes(key: string): Promise<Buffer | null> {
  try {
    const out: GetObjectCommandOutput = await s3().send(
      new GetObjectCommand({ Bucket: env.STORAGE_S3_BUCKET!, Key: key }),
    );
    if (!out.Body) return null;
    const bytes = await (out.Body as unknown as SdkBody).transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

// ── key helpers ───────────────────────────────────────────────────────────────
export function emailRawKey(sha: string): string {
  return `emails/${sha}/raw.eml`;
}
export function emailHtmlKey(sha: string): string {
  return `emails/${sha}/body.html`;
}
export function emailAttachmentKey(sha: string, index: number, filename: string): string {
  const safe = filename.replace(/[^\w.\-А-Яа-яЁё]+/g, "_").slice(0, 80) || "file";
  return `emails/${sha}/att/${index}-${safe}`;
}
