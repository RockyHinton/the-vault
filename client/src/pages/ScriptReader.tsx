import { useState } from "react";
import { Link, useRoute } from "wouter";
import type { ScriptAnnotation } from "@shared/contracts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, History } from "lucide-react";
import ScriptViewer from "@/components/script/ScriptViewer";
import NotesPanel, { type NoteDraft } from "@/components/script/NotesPanel";
import { useCurrentUser, useIsStudioAdmin } from "@/features/auth/use-current-user";
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useScript,
  useUpdateAnnotation,
} from "@/features/scripts/use-scripts";
import { usePdfDocument } from "@/features/scripts/use-pdf-document";
import { scriptReaderPath } from "@/features/scripts/labels";
import { ApiClientError } from "@/lib/api-client";

/**
 * Full-screen reader for one exact script version. The version is part of
 * the URL, so a note written here is bound to these bytes and no others.
 */
export default function ScriptReaderPage() {
  const [, params] = useRoute("/script-reader/:projectId/:scriptId/:documentId");
  const projectId = params?.projectId;
  const scriptId = params?.scriptId;
  const documentId = params?.documentId;
  const scriptQuery = useScript(projectId, scriptId);
  const detail = scriptQuery.data?.data;
  const version = detail?.versions.find((v) => v.id === documentId);

  if (!projectId || !scriptId || !documentId) return <div className="p-8">Script not found</div>;
  if (scriptQuery.isLoading) return <div className="p-8 text-muted-foreground">Loading script…</div>;
  // Only the server's 404 means the script is gone; any other failure is an error, never "not found".
  if (scriptQuery.isError && !(scriptQuery.error instanceof ApiClientError && scriptQuery.error.status === 404))
    return (
      <div className="p-8 text-destructive" role="alert">
        The script could not be loaded.{" "}
        <Button variant="link" className="h-auto p-0" onClick={() => void scriptQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!detail || !version) return <div className="p-8">Script version not found</div>;

  return (
    <ScriptReader
      projectId={projectId}
      scriptId={scriptId}
      documentId={documentId}
      title={detail.script.title}
      versionNumber={version.versionNumber}
      isCurrent={version.isCurrent}
      currentVersionId={detail.script.currentVersion.id}
      fileId={version.file.id}
    />
  );
}

function ScriptReader({
  projectId,
  scriptId,
  documentId,
  title,
  versionNumber,
  isCurrent,
  currentVersionId,
  fileId,
}: {
  projectId: string;
  scriptId: string;
  documentId: string;
  title: string;
  versionNumber: number;
  isCurrent: boolean;
  currentVersionId: string;
  fileId: string;
}) {
  const currentUserId = useCurrentUser().data?.data.user.id;
  const isStudioAdmin = useIsStudioAdmin();
  const pdf = usePdfDocument(fileId);
  const annotationsQuery = useAnnotations(projectId, scriptId, documentId);
  const create = useCreateAnnotation();
  const update = useUpdateAnnotation();
  const remove = useDeleteAnnotation();
  const annotations = annotationsQuery.data?.data.items ?? [];

  const [currentPage, setCurrentPage] = useState(1);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [draftPos, setDraftPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);

  const ref = { projectId, scriptId, documentId };

  const handleSelection = (x: number, y: number) => {
    setSelectedAnnotationIds([]);
    setDraftPos({ x, y });
    setIsCreatingNote(true);
  };

  const handleAnnotationClick = (id: string) => {
    const clicked = annotations.find((a) => a.id === id);
    if (!clicked) return;
    // Notes on the same page within 2% vertically are shown together.
    const nearby = annotations
      .filter((a) => a.pageNumber === clicked.pageNumber && Math.abs(a.y - clicked.y) < 2)
      .map((a) => a.id);
    setSelectedAnnotationIds(nearby);
    setIsCreatingNote(false);
    setDraftPos(null);
  };

  const createNote = async (draft: NoteDraft) => {
    if (!draftPos) return;
    await create.mutateAsync({
      ...ref,
      input: { pageNumber: currentPage, x: draftPos.x, y: draftPos.y, ...draft },
    });
    setIsCreatingNote(false);
    setDraftPos(null);
  };

  const updateNote = (annotation: ScriptAnnotation, draft: NoteDraft) =>
    update.mutateAsync({
      ...ref,
      annotationId: annotation.id,
      input: { ...draft, version: annotation.version },
    });

  const deleteNote = (annotation: ScriptAnnotation) => {
    remove.mutate({ ...ref, annotationId: annotation.id, version: annotation.version });
    setSelectedAnnotationIds((ids) => ids.filter((id) => id !== annotation.id));
  };

  const deselectAll = () => {
    setSelectedAnnotationIds([]);
    setIsCreatingNote(false);
    setDraftPos(null);
  };

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
      <header className="h-16 bg-background border-b border-border flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <Link href={`/project/${projectId}/script`}>
            <Button variant="ghost" className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Exit Reader
            </Button>
          </Link>
          <div className="h-6 w-[1px] bg-border" />
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold font-display">{title}</h1>
            <Badge variant={isCurrent ? "default" : "outline"} className="font-mono text-xs" data-testid="reader-version-badge">
              v{versionNumber}
              {isCurrent ? " · current" : " · earlier version"}
            </Badge>
          </div>
        </div>
        {!isCurrent && (
          <Link href={scriptReaderPath(projectId, scriptId, currentVersionId)}>
            <Button variant="outline" size="sm" className="gap-2">
              <History className="h-4 w-4" />
              Open current version
            </Button>
          </Link>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 relative flex flex-col min-w-0 bg-secondary/5">
          {pdf.status === "loading" ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading script…</div>
          ) : pdf.status === "error" ? (
            <div className="flex-1 flex items-center justify-center text-destructive" role="alert">
              {pdf.message}
            </div>
          ) : (
            <ScriptViewer
              document={pdf.document}
              pageCount={pdf.pageCount}
              currentPage={currentPage}
              onPageChange={(page) => {
                setCurrentPage(page);
                deselectAll();
              }}
              annotations={annotations}
              onSelection={handleSelection}
              onAnnotationClick={handleAnnotationClick}
              onBackgroundClick={deselectAll}
              selectionPos={draftPos}
              selectedAnnotationIds={selectedAnnotationIds}
            />
          )}
        </main>

        <aside className="w-[400px] shrink-0 z-20 shadow-2xl bg-card">
          <NotesPanel
            annotations={annotations}
            currentUserId={currentUserId}
            isStudioAdmin={isStudioAdmin}
            onAnnotationClick={(page, id) => {
              setCurrentPage(page);
              handleAnnotationClick(id);
            }}
            selectedAnnotationIds={selectedAnnotationIds}
            isCreating={isCreatingNote}
            onCancelCreate={() => {
              setIsCreatingNote(false);
              setDraftPos(null);
            }}
            onCreateNote={createNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onAddNoteAtLocation={(x, y) => {
              setDraftPos({ x, y });
              setIsCreatingNote(true);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
