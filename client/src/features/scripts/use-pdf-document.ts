import { useEffect, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fileContentUrl } from "@/features/files/files-api";

// The worker is served from this origin by Vite; no third-party host, no blob: worker.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDocumentState =
  | { status: "loading" }
  | { status: "ready"; document: PDFDocumentProxy; pageCount: number }
  | { status: "error"; message: string };

/**
 * Fetches a stored file's bytes through the authenticated content route and
 * parses them with pdf.js. Bytes live only in memory for the life of the
 * hook; nothing is persisted and no object URL is created.
 */
export function usePdfDocument(fileId: string | undefined): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({ status: "loading" });

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    // The loading task owns the worker-side document; destroying it frees both.
    let task: ReturnType<typeof pdfjs.getDocument> | undefined;
    setState({ status: "loading" });
    (async () => {
      try {
        const response = await fetch(fileContentUrl(fileId, "inline"), {
          credentials: "same-origin",
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401 || response.status === 403
              ? "You are not allowed to read this script."
              : "The script could not be loaded.",
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({ data: bytes });
        const document = await task.promise;
        if (cancelled) return;
        setState({ status: "ready", document, pageCount: document.numPages });
      } catch (failure) {
        if (!cancelled)
          setState({
            status: "error",
            message:
              failure instanceof Error
                ? failure.message
                : "The script could not be loaded.",
          });
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [fileId]);

  return state;
}
