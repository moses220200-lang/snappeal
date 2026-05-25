/**
 * Photo storage adapter.
 *
 * Persists PCN / evidence / portal-lookup photos to durable storage and
 * writes an `appeal_photos` row. Production uses Vercel Blob (managed
 * object store, signed CDN URLs); local dev — where there's no
 * BLOB_READ_WRITE_TOKEN — falls back to writing into
 * `apps/web/public/dev-blobs/` so the flow works on `pnpm dev` without a
 * Vercel account.
 *
 * This is the first concrete writer for the long-dormant `appeal_photos`
 * table — every other photo path in the codebase still keeps base64 data
 * URLs in sessionStorage. Future evidence-upload work can point at the
 * same helper.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { put } from "@vercel/blob";
import { customAlphabet } from "../id";
import { getDb, schema } from "./db/client";

const newPhotoId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  12,
  "ph_",
);

export type AppealPhotoKind = "pcn" | "evidence" | "portal";

interface UploadInput {
  appealId: string;
  kind: AppealPhotoKind;
  /** Either a path to a file on disk OR a raw byte buffer. */
  source: { path: string } | { buffer: Buffer; filename: string };
  caption?: string | null;
  contentType?: string;
}

export interface UploadedPhoto {
  id: string;
  blobUrl: string;
}

/**
 * Upload one photo to durable storage and record an `appeal_photos` row.
 *
 * On production (BLOB_READ_WRITE_TOKEN present) the file lands in Vercel
 * Blob and `blobUrl` is a CDN URL. On a fresh dev machine the file lands
 * in `apps/web/public/dev-blobs/<appealId>/...` and `blobUrl` is the
 * local `/dev-blobs/...` path served by Next.js out of `public/`.
 */
export async function uploadAppealPhoto(
  input: UploadInput,
): Promise<UploadedPhoto> {
  const id = newPhotoId();
  const filename =
    "path" in input.source ? basename(input.source.path) : input.source.filename;
  const ext = extname(filename) || ".png";
  const objectKey = `appeals/${input.appealId}/${id}${ext}`;

  let blobUrl: string;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const body =
      "path" in input.source
        ? await readFile(input.source.path)
        : input.source.buffer;
    const result = await put(objectKey, body, {
      access: "public",
      contentType: input.contentType ?? guessContentType(ext),
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    });
    blobUrl = result.url;
  } else {
    blobUrl = await writeDevBlob({
      objectKey,
      source: input.source,
    });
  }

  const db = getDb();
  if (db) {
    await db.insert(schema.appealPhotos).values({
      id,
      appealId: input.appealId,
      kind: input.kind,
      blobUrl,
      caption: input.caption ?? null,
    });
  }

  return { id, blobUrl };
}

/**
 * Convenience for the portal-lookup job: takes an array of local PNG paths
 * the Playwright MCP agent wrote into its workDir, uploads them in series,
 * and returns the resulting URLs in the same order. Failures on a single
 * file are logged but don't abort the run — partial photo sets are still
 * useful.
 */
export async function uploadPortalPhotos(opts: {
  appealId: string;
  paths: string[];
}): Promise<string[]> {
  const urls: string[] = [];
  for (const path of opts.paths) {
    if (!existsSync(path)) continue;
    try {
      const out = await uploadAppealPhoto({
        appealId: opts.appealId,
        kind: "portal",
        source: { path },
        caption: basename(path),
      });
      urls.push(out.blobUrl);
    } catch (err) {
      console.error("[blob] failed to upload portal photo:", path, err);
    }
  }
  return urls;
}

async function writeDevBlob(opts: {
  objectKey: string;
  source: UploadInput["source"];
}): Promise<string> {
  const publicRoot = join(process.cwd(), "public");
  const destDir = join(publicRoot, "dev-blobs", ...opts.objectKey.split("/").slice(0, -1));
  const destFile = join(
    publicRoot,
    "dev-blobs",
    ...opts.objectKey.split("/"),
  );
  await mkdir(destDir, { recursive: true });
  const body =
    "path" in opts.source
      ? await readFile(opts.source.path)
      : opts.source.buffer;
  await writeFile(destFile, body);
  return `/dev-blobs/${opts.objectKey}`;
}

function guessContentType(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  switch (e) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}
