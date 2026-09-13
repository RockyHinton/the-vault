import { useState, type ReactNode } from "react";
import { MAX_UPLOAD_BYTES, type Script } from "@shared/contracts";
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
import { Textarea } from "@/components/ui/textarea";
import { uploadFile } from "@/features/files/files-api";
import { useAddScriptVersion, useCreateScript } from "@/features/scripts/use-scripts";

export type ScriptUploadMode = { kind: "first-draft" } | { kind: "new-version"; script: Script };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Stages the screenplay bytes with the Files domain, then records either a
 * new script (version 1) or the next version of an existing lineage.
 */
export function ScriptUploadDialog({
  projectId,
  mode,
  children,
}: {
  projectId: string;
  mode: ScriptUploadMode;
  children: ReactNode;
}) {
  const create = useCreateScript();
  const addVersion = useAddScriptVersion();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setTitle("");
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
    if (chosen.type && chosen.type !== "application/pdf") {
      setError("Upload the screenplay as a PDF so it can be read in the Vault.");
      return;
    }
    setFile(chosen);
    if (mode.kind === "first-draft" && !title) setTitle(chosen.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async () => {
    if (!file) return;
    setError(null);
    try {
      setPhase("uploading");
      const staged = await uploadFile(file);
      setPhase("saving");
      if (mode.kind === "first-draft") {
        await create.mutateAsync({
          projectId,
          input: { fileObjectId: staged.data.id, title: title.trim(), notes: notes.trim() || undefined },
        });
      } else {
        await addVersion.mutateAsync({
          projectId,
          scriptId: mode.script.id,
          input: {
            fileObjectId: staged.data.id,
            notes: notes.trim() || undefined,
            currentDocumentVersion: mode.script.currentVersion.version,
          },
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
  const canSubmit = Boolean(file) && (mode.kind === "new-version" || title.trim().length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {mode.kind === "first-draft" ? "Upload First Draft" : `Upload version ${mode.script.currentVersion.versionNumber + 1}`}
          </DialogTitle>
          <DialogDescription>
            {mode.kind === "first-draft"
              ? "The screenplay is stored privately and becomes version 1 of this project's script."
              : "Earlier versions, and the notes written on them, are kept exactly as they are."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="script-file">Screenplay PDF</Label>
            <Input id="script-file" type="file" accept="application/pdf,.pdf" onChange={(e) => chooseFile(e.target.files?.[0])} disabled={busy} />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {formatBytes(file.size)}
              </p>
            )}
          </div>
          {mode.kind === "first-draft" && (
            <div className="space-y-2">
              <Label htmlFor="script-title">Title</Label>
              <Input id="script-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="script-notes">Notes (optional)</Label>
            <Textarea id="script-notes" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} className="resize-none h-20" placeholder="What changed in this draft…" />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); setOpen(false); }} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {phase === "uploading" ? "Uploading…" : phase === "saving" ? "Saving…" : mode.kind === "first-draft" ? "Upload Script" : "Upload Version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
