import { useState, type ReactNode } from "react";
import {
  MAX_UPLOAD_BYTES,
  type Document,
  type DocumentFolder,
  type DocumentStatus,
} from "@shared/contracts";
import { File as FileIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { uploadFile } from "@/features/files/files-api";
import {
  useAddDocumentVersion,
  useCreateDocument,
} from "@/features/documents/use-documents";
import { documentFolders, folderLabel } from "@/features/documents/folders";
import { cn } from "@/lib/utils";

const statusLabels: Record<DocumentStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  final: "Final",
  signed: "Signed",
};

export type DocumentUploadMode =
  | { kind: "create"; folder?: DocumentFolder }
  | { kind: "version"; document: Document };

interface DocumentUploadDialogProps {
  projectId: string;
  mode: DocumentUploadMode;
  children?: ReactNode;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Two steps behind one button: stream the bytes to /files, then record the
 * document (or the new version) that claims them. If the second step fails,
 * the staged upload is swept by the server later; nothing half-made is shown.
 */
export function DocumentUploadDialog({ projectId, mode, children }: DocumentUploadDialogProps) {
  const create = useCreateDocument();
  const addVersion = useAddDocumentVersion();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState<DocumentFolder>(
    mode.kind === "create" ? (mode.folder ?? "general") : mode.document.folder,
  );
  const [status, setStatus] = useState<DocumentStatus>("draft");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setTitle("");
    setStatus("draft");
    setNotes("");
    setPhase("idle");
    setError(null);
    if (mode.kind === "create") setFolder(mode.folder ?? "general");
  };

  const chooseFile = (chosen: File | undefined) => {
    if (!chosen) return;
    setError(null);
    if (chosen.size > MAX_UPLOAD_BYTES) {
      setError(`Files larger than ${formatBytes(MAX_UPLOAD_BYTES)} are not accepted.`);
      return;
    }
    setFile(chosen);
    if (mode.kind === "create" && !title) setTitle(chosen.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async () => {
    if (!file) return;
    setError(null);
    try {
      setPhase("uploading");
      const staged = await uploadFile(file);
      setPhase("saving");
      if (mode.kind === "create") {
        await create.mutateAsync({
          projectId,
          input: { fileObjectId: staged.data.id, folder, title: title.trim(), status, notes: notes.trim() || undefined },
        });
      } else {
        await addVersion.mutateAsync({
          projectId,
          documentId: mode.document.id,
          input: { fileObjectId: staged.data.id, status, notes: notes.trim() || undefined, version: mode.document.version },
        });
      }
      reset();
      setOpen(false);
    } catch (failure) {
      setPhase("idle");
      setError(failure instanceof Error ? failure.message : "The upload failed.");
    }
  };

  const busy = phase !== "idle";
  const canSubmit = Boolean(file) && (mode.kind === "version" || title.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { if (!next) reset(); setOpen(next); } }}>
      <DialogTrigger asChild>
        {children ?? (
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>{mode.kind === "create" ? "Upload Document" : `New version of ${mode.document.title}`}</DialogTitle>
          <DialogDescription>
            {mode.kind === "create"
              ? "The file is stored privately and can be downloaded by the studio's Vault users."
              : `Uploads version ${mode.document.versionNumber + 1}. Earlier versions are kept.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-colors",
              file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/20",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]); }}
          >
            {file ? (
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-primary/20 text-primary rounded-lg flex items-center justify-center">
                  <FileIcon className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm truncate max-w-[240px]">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setFile(null)} disabled={busy} className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Remove file">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="h-12 w-12 bg-secondary/50 rounded-full flex items-center justify-center mb-3">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Click to browse or drag a file here</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, Office, image, text or Final Draft up to {formatBytes(MAX_UPLOAD_BYTES)}</p>
                <label htmlFor="document-file" className="absolute inset-0 cursor-pointer">
                  <span className="sr-only">Choose file</span>
                </label>
                <input id="document-file" type="file" className="sr-only" onChange={(e) => chooseFile(e.target.files?.[0])} />
              </>
            )}
          </div>

          {mode.kind === "create" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="document-title">Title</Label>
                <Input id="document-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-folder">Folder</Label>
                <Select value={folder} onValueChange={(value) => setFolder(value as DocumentFolder)}>
                  <SelectTrigger id="document-folder"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {documentFolders.map((f) => (
                      <SelectItem key={f} value={f}>{folderLabel(f)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="document-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as DocumentStatus)}>
              <SelectTrigger id="document-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(statusLabels) as DocumentStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-notes">Notes (optional)</Label>
            <Textarea id="document-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} className="resize-none h-20" placeholder="Context for this version…" />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); setOpen(false); }} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {phase === "uploading" ? "Uploading…" : phase === "saving" ? "Saving…" : file ? (mode.kind === "create" ? "Upload File" : "Upload version") : "Select File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
