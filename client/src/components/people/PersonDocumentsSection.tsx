import { useState } from "react";
import {
  MAX_UPLOAD_BYTES,
  type Document,
  type DocumentStatus,
  type Person,
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
import { Separator } from "@/components/ui/separator";
import { Download, FileText, Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { uploadFile, fileContentUrl } from "@/features/files/files-api";
import {
  useAttachNewPersonDocument,
  useDetachPersonDocument,
} from "@/features/people/use-people";

const statusLabels: Record<DocumentStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  final: "Final",
  signed: "Signed",
};
const statuses = Object.keys(statusLabels) as DocumentStatus[];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * The person's attached documents. Upload stages the bytes with the Files
 * domain, then one People command creates the document in the kind's folder
 * and links it. Detaching removes the link; the document stays in the library.
 */
export function PersonDocumentsSection({
  person,
  canDetach,
}: {
  person: Person;
  canDetach: boolean;
}) {
  const attach = useAttachNewPersonDocument();
  const detach = useDetachPersonDocument();
  const [open, setOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<DocumentStatus>("draft");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [toDetach, setToDetach] = useState<Document | null>(null);

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
      setError(`Files larger than ${formatBytes(MAX_UPLOAD_BYTES)} are not accepted.`);
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
      await attach.mutateAsync({
        projectId: person.projectId,
        personId: person.id,
        input: {
          fileObjectId: staged.data.id,
          title: title.trim(),
          status,
          notes: notes.trim() || undefined,
        },
      });
      reset();
      setUploadOpen(false);
      setOpen(true);
    } catch (failure) {
      setPhase("idle");
      setError(failure instanceof Error ? failure.message : "The upload failed.");
    }
  };

  const busy = phase !== "idle";
  const summary =
    person.documents.length > 0
      ? `Documents: ${person.documents.length}`
      : "No documents";

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden bg-card/50">
      <button
        type="button"
        className="w-full p-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Documents</h3>
          </div>
          {!open && <p className="text-xs text-muted-foreground">{summary}</p>}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
          <Separator className="mb-4" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Stored privately in the project library and linked to this profile.
            </p>
            <Button size="sm" variant="secondary" onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </div>

          {person.documents.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 bg-background/30">
              No documents yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {person.documents.map((doc) => (
                <li
                  key={doc.lineageId}
                  data-testid="person-document"
                  className="rounded-lg border border-border/60 bg-background/30 p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{doc.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {doc.file.originalFilename} · v{doc.versionNumber} ·{" "}
                      {formatBytes(doc.file.byteSize)} · uploaded by {doc.createdBy.displayName}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] h-5">
                        {statusLabels[doc.status]}
                      </Badge>
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
        </div>
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
              Attach a private file to {person.name}. It also appears in the project library.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="person-document-file">File</Label>
              <Input
                id="person-document-file"
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
              <Label htmlFor="person-document-title">Title</Label>
              <Input
                id="person-document-title"
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-document-status">Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as DocumentStatus)}>
                <SelectTrigger id="person-document-status">
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
              <Label htmlFor="person-document-notes">Notes (optional)</Label>
              <Textarea
                id="person-document-notes"
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
              {phase === "uploading" ? "Uploading…" : phase === "saving" ? "Attaching…" : "Upload & Attach"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDetach !== null} onOpenChange={(next) => !next && setToDetach(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Detach document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDetach?.title}" will no longer be linked to this profile. It stays in the
              project library with all its versions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!toDetach) return;
                detach.mutate({
                  projectId: person.projectId,
                  personId: person.id,
                  documentId: toDetach.id,
                });
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
