import path from "node:path";
import { MAX_FILENAME_LENGTH } from "@shared/contracts";

/**
 * Media types the Vault stores and serves. The server decides the type from
 * the bytes (magic numbers) where a signature exists, falling back to the
 * extension only for signature-less text formats. Anything else is refused.
 * `inline` marks types a browser may render in a tab; everything else is
 * always served as an attachment.
 */
export interface MediaTypeSpec {
  mediaType: string;
  extensions: readonly string[];
  inline: boolean;
}

export const ALLOWED_MEDIA_TYPES: readonly MediaTypeSpec[] = [
  { mediaType: "application/pdf", extensions: ["pdf"], inline: true },
  { mediaType: "image/png", extensions: ["png"], inline: true },
  { mediaType: "image/jpeg", extensions: ["jpg", "jpeg"], inline: true },
  { mediaType: "image/gif", extensions: ["gif"], inline: true },
  {
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
    inline: false,
  },
  {
    mediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: ["xlsx"],
    inline: false,
  },
  {
    mediaType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extensions: ["pptx"],
    inline: false,
  },
  { mediaType: "application/msword", extensions: ["doc"], inline: false },
  { mediaType: "application/vnd.ms-excel", extensions: ["xls"], inline: false },
  { mediaType: "application/xml", extensions: ["xml", "fdx"], inline: false },
  { mediaType: "text/plain", extensions: ["txt"], inline: false },
  { mediaType: "text/markdown", extensions: ["md"], inline: false },
  { mediaType: "text/csv", extensions: ["csv"], inline: false },
];

const byMediaType = new Map(ALLOWED_MEDIA_TYPES.map((s) => [s.mediaType, s]));
const byExtension = new Map(
  ALLOWED_MEDIA_TYPES.flatMap((s) => s.extensions.map((e) => [e, s] as const)),
);

export function isInlineSafe(mediaType: string): boolean {
  return byMediaType.get(mediaType)?.inline ?? false;
}

/** Bytes needed to classify any supported type. */
export const SNIFF_LENGTH = 16;

function extensionOf(filename: string): string {
  return path.extname(filename).slice(1).toLowerCase();
}

function looksLikeText(head: Buffer): boolean {
  return !head.includes(0);
}

/**
 * Decides the stored media type from the first bytes and the filename.
 * Returns `undefined` when the content is not something the Vault accepts.
 */
export function detectMediaType(
  head: Buffer,
  filename: string,
): string | undefined {
  const ext = extensionOf(filename);
  const startsWith = (sig: string | number[]) =>
    typeof sig === "string"
      ? head.subarray(0, sig.length).toString("latin1") === sig
      : sig.every((byte, i) => head[i] === byte);

  if (startsWith("%PDF-")) return "application/pdf";
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith("GIF87a") || startsWith("GIF89a")) return "image/gif";
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) {
    // Zip container: only the Office formats are accepted, chosen by extension.
    return ["docx", "xlsx", "pptx"].includes(ext)
      ? byExtension.get(ext)!.mediaType
      : undefined;
  }
  if (startsWith([0xd0, 0xcf, 0x11, 0xe0])) {
    return ["doc", "xls"].includes(ext)
      ? byExtension.get(ext)!.mediaType
      : undefined;
  }
  if (!looksLikeText(head)) return undefined;
  if (startsWith("<?xml") && ["xml", "fdx"].includes(ext))
    return "application/xml";
  const textSpec = byExtension.get(ext);
  return textSpec && textSpec.mediaType.startsWith("text/")
    ? textSpec.mediaType
    : undefined;
}

/**
 * Keeps the original name as metadata only: no directories, no control
 * characters, bounded length. Never used to address bytes.
 */
export function sanitiseFilename(raw: string | undefined): string {
  const base = (raw ?? "")
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  const named = base && base !== "." && base !== ".." ? base : "upload";
  if (named.length <= MAX_FILENAME_LENGTH) return named;
  const ext = path.extname(named);
  return named.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
}

/** RFC 6266 / RFC 8187 Content-Disposition with a safe ASCII fallback. */
export function contentDisposition(
  disposition: "attachment" | "inline",
  filename: string,
): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
