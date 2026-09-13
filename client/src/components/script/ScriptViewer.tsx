import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ScriptAnnotation } from "@shared/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ScriptViewerProps {
  document: PDFDocumentProxy;
  pageCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  annotations: ScriptAnnotation[];
  onSelection: (x: number, y: number) => void;
  onAnnotationClick: (id: string) => void;
  onBackgroundClick: () => void;
  selectionPos: { x: number; y: number } | null;
  selectedAnnotationIds: string[];
}

const PAGE_WIDTH = 850;

/**
 * Renders one page of the real screenplay PDF to a canvas and overlays the
 * notes written against this exact version at their page-local percentage
 * positions. A click on the page records a new note position.
 */
export default function ScriptViewer({
  document,
  pageCount,
  currentPage,
  onPageChange,
  annotations,
  onSelection,
  onAnnotationClick,
  onBackgroundClick,
  selectionPos,
  selectedAnnotationIds,
}: ScriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageHeight, setPageHeight] = useState<number>(Math.round(PAGE_WIDTH * 11 / 8.5));
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | undefined;
    (async () => {
      try {
        const page = await document.getPage(currentPage);
        if (cancelled) return;
        const unscaled = page.getViewport({ scale: 1 });
        const scale = PAGE_WIDTH / unscaled.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setPageHeight(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        const render = page.render({ canvasContext: context, viewport, canvas });
        task = render;
        await render.promise;
        if (!cancelled) setRenderError(null);
      } catch (failure) {
        if (!cancelled && !(failure instanceof Error && failure.name === "RenderingCancelledException"))
          setRenderError("This page could not be rendered.");
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, currentPage]);

  const handlePageClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    onSelection(Number(x.toFixed(2)), Number(y.toFixed(2)));
  };

  const pageAnnotations = annotations.filter((a) => a.pageNumber === currentPage);

  useEffect(() => {
    const firstSelectedId = selectedAnnotationIds[0];
    if (!firstSelectedId || !containerRef.current) return;
    const annotation = annotations.find((a) => a.id === firstSelectedId);
    if (!annotation || annotation.pageNumber !== currentPage) return;
    const pixelY = (annotation.y / 100) * containerRef.current.getBoundingClientRect().height;
    containerRef.current.parentElement?.scrollTo({ top: pixelY - 100, behavior: "smooth" });
  }, [selectedAnnotationIds, currentPage, annotations]);

  return (
    <div className="flex flex-col h-full bg-zinc-900/50 relative overflow-hidden" onClick={onBackgroundClick}>
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full border border-border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <Button variant="ghost" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          Prev
        </Button>
        <span className="text-sm font-mono text-foreground" data-testid="reader-page-indicator">
          Page {currentPage} of {pageCount}
        </span>
        <Button variant="ghost" size="sm" disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)}>
          Next
        </Button>
      </div>

      <div className="flex-1 overflow-auto flex justify-center p-8 custom-scrollbar bg-[#1a1a1a]">
        <div
          ref={containerRef}
          data-testid="reader-page"
          className="relative bg-white shadow-2xl cursor-text"
          style={{ width: PAGE_WIDTH, height: pageHeight }}
          onClick={handlePageClick}
        >
          <canvas ref={canvasRef} className="block select-none pointer-events-none" aria-label={`Script page ${currentPage}`} />
          {renderError && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive bg-white/90">
              {renderError}
            </div>
          )}

          {pageAnnotations.map((a) => (
            <div
              key={a.id}
              data-testid="reader-annotation-marker"
              className={cn(
                "absolute w-full h-6 border-l-4 transition-colors cursor-pointer group z-10",
                selectedAnnotationIds.includes(a.id)
                  ? "border-primary bg-primary/30"
                  : "border-primary/50 bg-primary/10 hover:bg-primary/20",
              )}
              style={{ top: `${a.y}%`, left: 0 }}
              title={a.body}
              onClick={(event) => {
                event.stopPropagation();
                onAnnotationClick(a.id);
              }}
            >
              <div className="absolute -left-12 top-0 h-6 w-6 flex items-center justify-center">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full transition-transform",
                    selectedAnnotationIds.includes(a.id) ? "bg-primary scale-125 ring-2 ring-background" : "bg-primary",
                  )}
                />
              </div>
            </div>
          ))}

          {selectionPos && (
            <div
              className="absolute w-full h-6 border-l-4 border-dashed border-primary/50 bg-primary/5 z-10 pointer-events-none"
              style={{ top: `${selectionPos.y}%`, left: 0 }}
            >
              <div className="absolute -left-4 top-0 bg-primary text-primary-foreground text-[10px] px-1 rounded animate-pulse">
                New Note
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
