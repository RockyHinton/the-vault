import { useState } from "react";
import {
  MAX_UPLOAD_BYTES,
  type Document,
  type DocumentStatus,
} from "@shared/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileText, Plus, X } from "lucide-react";
import { uploadFile, fileContentUrl } from "@/features/files/files-api";

const defaultStatusLabels: Record<DocumentStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  final: "Final",
  signed: "Signed",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export interface OwnerDocumentListProps {
  /** What the documents belong to, for dialog copy ("Attach a private file to …"). */
  ownerLabel: string;
  documents: Document[];
  canDetach: boolean;
  /** Stages the bytes are already uploaded; the owner command creates and links the document. */
  onAttachNew: (input: {
    fileObjectId: string;
    title: string;
    status: DocumentStatus;
    notes?: string;
  }) => Promise<unknown>;
  onDetach: (document: Document) => void;
  /**
   * When set, rows the viewer may manage show a status select. Status is
   * Documents-domain state, so `canEdit` is the uploader-or-admin rule and
   * `onChange` goes through the Documents update.
   */
  statusEditor?: {
    canEdit: (document: Document) => boolean;
    onChange: (document: Document, status: DocumentStatus) => void;
  };
  statusLabels?: Record<DocumentStatus, string>;
  /** Test id for each row; owners pick their own so browser tests stay specific. */
  rowTestId: string;
  emptyMessage?: string;
}

/**
 * The attached-documents panel every owner (people, rights, legal records)
 * renders: a private upload-and-attach dialog, current versions with
 * download, optional status control, and detach with confirmation.
 */
export function OwnerDocumentList({
  ownerLabel,
  documents,
  canDetach,
  onAttachNew,
  onDetach,
  statusEditor,
  statusLabels = defaultStatusLabels,
  rowTestId,
  emptyMessage = "No documents yet.",
}: OwnerDocumentListProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<DocumentStatus>("draft");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [toDetach, setToDetach] = useState<Document | null>(null);
  const statuses = Object.keys(statusLabels) as DocumentStatus[];

  const reset = () => {
    setFile(null);
    setTitle("");
    setStatus("draft");
    setNotes("");
    setPhase("idle");
    setError(null);
  };

  const chooseFile = (chosen: File | undefined) => {
    if (!chosen) return;
    setError(null);
    if (chosen.size > MAX_UPLOAD_BYTES) {
      setError(
        `Files larger than ${formatBytes(MAX_UPLOAD_BYTES)} are not accepted.`,
      );
      return;
    }
    setFile(chosen);
    if (!title) setTitle(chosen.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async () => {
    if (!file) return;
    setError(null);
    try {
      setPhase("uploading");
      const staged = await uploadFile(file);
      setPhase("saving");
      await onAttachNew({
        fileObjectId: staged.data.id,
        title: title.trim(),
        status,
        notes: notes.trim() || undefined,
      });
      reset();
      setUploadOpen(false);
    } catch (failure) {
      setPhase("idle");
      setError(
        failure instanceof Error ? failure.message : "The upload failed.",
      );
    }
  };

  const busy = phase !== "idle";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Stored privately in the project library and linked to {ownerLabel}.
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setUploadOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 bg-background/30 flex items-center gap-2">
          <FileText className="h-4 w-4 opacity-50" />
          {emptyMessage}
        </div>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.lineageId}
              data-testid={rowTestId}
              className="rounded-lg border border-border/60 bg-background/30 p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{doc.title}</div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {doc.file.originalFilename} · v{doc.versionNumber} ·{" "}
                  {formatBytes(doc.file.byteSize)} · uploaded by{" "}
                  {doc.createdBy.displayName}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {statusEditor?.canEdit(doc) ? (
                    <Select
                      value={doc.status}
                      onValueChange={(value) =>
                        statusEditor.onChange(doc, value as DocumentStatus)
                      }
                    >
                      <SelectTrigger
                        className="h-7 w-40 text-xs"
                        aria-label={`Status of ${doc.title}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {statusLabels[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {statusLabels[doc.status]}
                    </Badge>
                  )}
                  <a
                    href={fileContentUrl(doc.file.id)}
                    className="inline-flex items-center text-xs text-primary hover:underline"
                    aria-label={`Download ${doc.title}`}
                  >
                    <Download className="h-3 w-3 mr-1" /> Download
                  </a>
                </div>
              </div>
              {canDetach && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Detach ${doc.title}`}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setToDetach(doc)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={uploadOpen}
        onOpenChange={(next) => {
          if (busy) return;
          if (!next) reset();
          setUploadOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>
              Attach a private file to {ownerLabel}. It also appears in the
              project library.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="owner-document-file">File</Label>
              <Input
                id="owner-document-file"
                type="file"
                onChange={(event) => chooseFile(event.target.files?.[0])}
                disabled={busy}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-document-title">Title</Label>
              <Input
                id="owner-document-title"
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-document-status">Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as DocumentStatus)}
              >
                <SelectTrigger id="owner-document-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-document-notes">Notes (optional)</Label>
              <Textarea
                id="owner-document-notes"
                value={notes}
                maxLength={4000}
                onChange={(event) => setNotes(event.target.value)}
                className="resize-none h-20"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setUploadOpen(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={!file || !title.trim() || busy}>
              {phase === "uploading"
                ? "Uploading…"
                : phase === "saving"
                  ? "Attaching…"
                  : "Upload & Attach"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={toDetach !== null}
        onOpenChange={(next) => !next && setToDetach(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Detach document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDetach?.title}" will no longer be linked to {ownerLabel}. It
              stays in the project library with all its versions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDetach) onDetach(toDetach);
                setToDetach(null);
              }}
            >
              Detach
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
