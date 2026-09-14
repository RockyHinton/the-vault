import { useState } from "react";
import type {
  DistributionTerritory,
  DistributionTerritoryNote,
  DistributionTerritoryStatus,
  DistributionTerritorySummary,
} from "@shared/contracts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Globe,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowLeft,
  FileText,
  MessageSquare,
  CheckCircle2,
  Clock,
  XCircle,
  Truck,
  CircleDot,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useCurrentUser } from "@/features/auth/use-current-user";
import {
  useAttachNewTerritoryDocument,
  useChangeTerritoryStatus,
  useCreateTerritory,
  useCreateTerritoryNote,
  useDeleteTerritory,
  useDeleteTerritoryNote,
  useDetachTerritoryDocument,
  useTerritories,
  useTerritory,
  useUpdateTerritory,
  useUpdateTerritoryNote,
} from "@/features/distribution/use-distribution";
import { distributionTerritoryStatuses, distributionTerritoryStatusLabels } from "@/features/distribution/labels";
import { OwnerDocumentList } from "@/components/documents/OwnerDocumentList";
import { ApiClientError } from "@/lib/api-client";

const STATUS_STYLE: Record<DistributionTerritoryStatus, { color: string; Icon: typeof CircleDot }> = {
  available: { color: "bg-emerald-500/10 text-emerald-600 border-emerald-200", Icon: CircleDot },
  in_discussion: { color: "bg-amber-500/10 text-amber-600 border-amber-200", Icon: Clock },
  licensed: { color: "bg-blue-500/10 text-blue-600 border-blue-200", Icon: CheckCircle2 },
  delivered: { color: "bg-violet-500/10 text-violet-600 border-violet-200", Icon: Truck },
  closed: { color: "bg-slate-400/10 text-slate-500 border-slate-200", Icon: XCircle },
};

function StatusBadge({ status }: { status: DistributionTerritoryStatus }) {
  const cfg = STATUS_STYLE[status];
  return (
    <span
      data-testid="territory-status"
      className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border", cfg.color)}
    >
      <cfg.Icon className="h-3 w-3" />
      {distributionTerritoryStatusLabels[status]}
    </span>
  );
}

// ─── Territory Card ───────────────────────────────────────────────────────────
function TerritoryCard({
  territory,
  canDelete,
  onClick,
  onRename,
  onDelete,
}: {
  territory: DistributionTerritorySummary;
  canDelete: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(territory.name);

  const handleRenameSubmit = () => {
    if (nameInput.trim() && nameInput.trim() !== territory.name) onRename(nameInput.trim());
    setRenaming(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="group relative"
      data-testid="territory-card"
      data-territory-name={territory.name}
    >
      <Card
        className={cn(
          "cursor-pointer border border-border/50 bg-card transition-all duration-200",
          "hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5 hover:border-border",
        )}
        onClick={onClick}
      >
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
                <Globe className="h-5 w-5 text-primary/70" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-foreground leading-tight">{territory.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Updated {format(new Date(territory.updatedAt), "MMM d, yyyy")} · added by {territory.createdBy.displayName}
                </p>
              </div>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Territory actions for ${territory.name}`}
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setNameInput(territory.name);
                      setRenaming(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete territory
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {territory.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The territory, its notes and its deal information are removed from this project. Attached documents
                              stay in the Documents library.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <StatusBadge status={territory.status} />

          <div className="flex items-center gap-5 pt-1">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>
                {territory.documentCount} {territory.documentCount === 1 ? "doc" : "docs"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>
                {territory.noteCount} {territory.noteCount === 1 ? "note" : "notes"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={renaming} onOpenChange={setRenaming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Territory</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            aria-label="Territory name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
            }}
            className="mt-2"
            autoFocus
          />
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel onClick={() => setRenaming(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRenameSubmit}>Rename</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

// ─── Territory Workspace ──────────────────────────────────────────────────────
function TerritoryWorkspace({ projectId, territoryId, onBack }: { projectId: string; territoryId: string; onBack: () => void }) {
  const { isStudioAdmin } = useProjectWorkspace();
  const currentUserId = useCurrentUser().data?.data.user.id;
  const territoryQuery = useTerritory(projectId, territoryId);
  const changeStatus = useChangeTerritoryStatus();
  const update = useUpdateTerritory();
  const createNote = useCreateTerritoryNote();
  const updateNote = useUpdateTerritoryNote();
  const deleteNote = useDeleteTerritoryNote();
  const attachDocument = useAttachNewTerritoryDocument();
  const detachDocument = useDetachTerritoryDocument();

  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  if (territoryQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading territory…</p>;
  const territory = territoryQuery.data?.data;
  if (!territory) {
    // Only the server's 404 means the territory is gone; any other failure is an error.
    const gone =
      !territoryQuery.isError ||
      (territoryQuery.error instanceof ApiClientError && territoryQuery.error.status === 404);
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          All Territories
        </button>
        {gone ? (
          <p className="text-sm text-destructive">This territory is no longer available.</p>
        ) : (
          <p className="text-sm text-destructive" role="alert">
            This territory could not be loaded.{" "}
            <button type="button" className="underline" onClick={() => void territoryQuery.refetch()}>
              Try again
            </button>
          </p>
        )}
      </div>
    );
  }
  const ref = { projectId, territoryId };
  const canManage = isStudioAdmin || territory.createdBy.id === currentUserId;
  const canManageNote = (note: DistributionTerritoryNote) => isStudioAdmin || note.author.id === currentUserId;

  return (
    <div className="space-y-8 animate-in fade-in duration-400">
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          All Territories
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-6">
          <div>
            <h2 className="text-3xl font-display font-bold tracking-tight text-foreground">{territory.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Last updated {format(new Date(territory.updatedAt), "MMMM d, yyyy 'at' h:mm a")} · added by {territory.createdBy.displayName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <Select
              value={territory.status}
              onValueChange={(status) => {
                if (status !== territory.status)
                  changeStatus.mutate({ ...ref, input: { status: status as DistributionTerritoryStatus, version: territory.version } });
              }}
            >
              <SelectTrigger className="w-44" aria-label="Territory status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {distributionTerritoryStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {distributionTerritoryStatusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <section className="space-y-5">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Notes</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Territory-specific notes and updates.</p>
        </div>

        <Card className="border-border/50">
          <CardContent className="p-5 space-y-3">
            <Textarea
              aria-label="New note"
              placeholder="Add a note for this territory..."
              className="resize-none min-h-[100px] bg-background"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!noteText.trim() || createNote.isPending}
                onClick={async () => {
                  try {
                    await createNote.mutateAsync({ ...ref, input: { body: noteText.trim() } });
                    setNoteText("");
                  } catch {
                    /* toast shown by the mutation */
                  }
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Note
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <AnimatePresence>
            {territory.notes.length > 0 ? (
              territory.notes.map((note) => (
                <motion.div key={note.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                  <Card className="border-border/40 shadow-sm" data-testid="territory-note">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                            {note.author.displayName.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-medium leading-none">{note.author.displayName}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(new Date(note.createdAt), "MMM d, yyyy · h:mm a")}
                              {note.editedAt && <span className="ml-2 italic opacity-70">(edited {format(new Date(note.editedAt), "MMM d")})</span>}
                            </div>
                          </div>
                        </div>
                        {canManageNote(note) && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit note"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditingText(note.body);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Delete note" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Note?</AlertDialogTitle>
                                  <AlertDialogDescription>The note is removed from this territory.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteNote.mutate({ ...ref, noteId: note.id, version: note.version })}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>

                      {editingNoteId === note.id ? (
                        <div className="space-y-2 pl-11">
                          <Textarea aria-label="Edit note text" value={editingText} onChange={(e) => setEditingText(e.target.value)} className="resize-none min-h-[80px] bg-background text-sm" autoFocus />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!editingText.trim() || updateNote.isPending}
                              onClick={async () => {
                                try {
                                  await updateNote.mutateAsync({ ...ref, noteId: note.id, input: { body: editingText.trim(), version: note.version } });
                                  setEditingNoteId(null);
                                } catch {
                                  /* toast shown by the mutation */
                                }
                              }}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap pl-11">{note.body}</p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed rounded-xl border-border/40 bg-secondary/5">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground/70">No notes yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add the first note for this territory above.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <Separator />

      <section className="space-y-5">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Documents</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Agreements and contracts for this territory, filed under Distribution.</p>
        </div>
        <OwnerDocumentList
          ownerLabel={territory.name}
          documents={territory.documents}
          canDetach={canManage}
          rowTestId="territory-document"
          emptyMessage="No documents yet. Upload agreements and contracts for this territory."
          onAttachNew={(input) => attachDocument.mutateAsync({ ...ref, input })}
          onDetach={(doc) => detachDocument.mutate({ ...ref, documentId: doc.id })}
        />
      </section>

      <Separator />

      <DealInformation territory={territory} pending={update.isPending} onSave={(input) => update.mutateAsync({ ...ref, input: { ...input, version: territory.version } })} />
    </div>
  );
}

type DealDraft = { distributor: string; contact: string; signaturePayment: string; deliveryPayment: string; generalNotes: string };

/** Deal fields are saved together with an explicit button, as in the validated design. */
function DealInformation({
  territory,
  pending,
  onSave,
}: {
  territory: DistributionTerritory;
  pending: boolean;
  onSave: (input: DealDraft) => Promise<unknown>;
}) {
  const saved: DealDraft = {
    distributor: territory.deal.distributor ?? "",
    contact: territory.deal.contact ?? "",
    signaturePayment: territory.deal.signaturePayment ?? "",
    deliveryPayment: territory.deal.deliveryPayment ?? "",
    generalNotes: territory.deal.generalNotes ?? "",
  };
  const [draft, setDraft] = useState<DealDraft>(saved);
  // Reconcile per field: when the server value of a field changes (our own
  // save or a colleague's), only that field's draft follows it; text typed
  // into the other fields is kept.
  const [seen, setSeen] = useState<DealDraft>(saved);
  const fields = Object.keys(saved) as (keyof DealDraft)[];
  if (fields.some((k) => seen[k] !== saved[k])) {
    setSeen(saved);
    setDraft((current) => {
      const next = { ...current };
      for (const k of fields) if (seen[k] !== saved[k]) next[k] = saved[k];
      return next;
    });
  }
  const dirty = fields.some((k) => draft[k].trim() !== saved[k]);

  const field = (name: keyof DealDraft, label: string, multiline = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`deal-${name}`} className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </Label>
      {multiline ? (
        <Textarea id={`deal-${name}`} value={draft[name]} onChange={(e) => setDraft({ ...draft, [name]: e.target.value })} className="resize-none min-h-[80px] bg-background text-sm" placeholder={`Enter ${label.toLowerCase()}...`} />
      ) : (
        <Input id={`deal-${name}`} value={draft[name]} onChange={(e) => setDraft({ ...draft, [name]: e.target.value })} className="bg-background text-sm" placeholder={`Enter ${label.toLowerCase()}...`} />
      )}
    </div>
  );

  const save = async () => {
    try {
      await onSave({
        distributor: draft.distributor.trim(),
        contact: draft.contact.trim(),
        signaturePayment: draft.signaturePayment.trim(),
        deliveryPayment: draft.deliveryPayment.trim(),
        generalNotes: draft.generalNotes.trim(),
      });
    } catch {
      /* toast shown by the mutation; the draft stays for the user to retry */
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Important Deal Information</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Key deal details for this territory. No calculations — information only.</p>
        </div>
        {dirty && (
          <Button size="sm" disabled={pending} onClick={save}>
            Save Changes
          </Button>
        )}
      </div>

      <Card className="border-border/50">
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {field("distributor", "Distributor")}
          {field("contact", "Contact")}
          {field("signaturePayment", "Signature Payment")}
          {field("deliveryPayment", "Delivery Payment")}
          <div className="md:col-span-2">{field("generalNotes", "General Notes", true)}</div>
        </CardContent>
      </Card>

      {dirty && (
        <div className="flex justify-end">
          <Button disabled={pending} onClick={save}>
            Save Changes
          </Button>
        </div>
      )}
    </section>
  );
}

// ─── Main Distribution View ───────────────────────────────────────────────────
export default function DistributionView() {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const currentUserId = useCurrentUser().data?.data.user.id;
  const territoriesQuery = useTerritories(project.id);
  const create = useCreateTerritory();
  const update = useUpdateTerritory();
  const remove = useDeleteTerritory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTerritoryName, setNewTerritoryName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  if (selectedId) {
    return <TerritoryWorkspace projectId={project.id} territoryId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (territoriesQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading territories…</p>;
  if (territoriesQuery.isError) return <p className="text-sm text-destructive">Territories could not be loaded.</p>;
  const territories = territoriesQuery.data?.data.items ?? [];

  const counts = {
    total: territories.length,
    licensed: territories.filter((t) => t.status === "licensed").length,
    inDiscussion: territories.filter((t) => t.status === "in_discussion").length,
    available: territories.filter((t) => t.status === "available").length,
  };

  const handleAddTerritory = async () => {
    const name = newTerritoryName.trim();
    if (!name) return;
    try {
      await create.mutateAsync({ projectId: project.id, input: { name } });
      setNewTerritoryName("");
      setShowNewForm(false);
    } catch {
      /* toast shown by the mutation; keep the form open */
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h2 className="text-3xl font-display font-bold tracking-tight text-foreground">Distribution</h2>
          <p className="text-muted-foreground mt-1">Manage territory licensing and distribution agreements.</p>
        </div>
        <Button onClick={() => setShowNewForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-2" />
          New Territory
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Territories", value: counts.total, color: "text-foreground", testId: "territory-count-total" },
          { label: "Licensed", value: counts.licensed, color: "text-blue-600", testId: "territory-count-licensed" },
          { label: "In Discussion", value: counts.inDiscussion, color: "text-amber-600", testId: "territory-count-discussion" },
          { label: "Available", value: counts.available, color: "text-emerald-600", testId: "territory-count-available" },
        ].map(({ label, value, color, testId }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="p-5 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className={cn("text-3xl font-bold", color)} data-testid={testId}>
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {showNewForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            <Card className="border-border/50 border-dashed">
              <CardContent className="p-5">
                <p className="text-sm font-medium mb-3">New Territory Name</p>
                <div className="flex gap-2">
                  <Input
                    aria-label="New territory name"
                    placeholder="e.g. United Kingdom, France, Japan..."
                    value={newTerritoryName}
                    onChange={(e) => setNewTerritoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddTerritory();
                    }}
                    className="bg-background"
                    autoFocus
                  />
                  <Button onClick={handleAddTerritory} disabled={!newTerritoryName.trim() || create.isPending}>
                    Add
                  </Button>
                  <Button variant="ghost" onClick={() => setShowNewForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {territories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <AnimatePresence>
            {territories.map((territory) => (
              <TerritoryCard
                key={territory.id}
                territory={territory}
                canDelete={isStudioAdmin || territory.createdBy.id === currentUserId}
                onClick={() => setSelectedId(territory.id)}
                onRename={(name) => update.mutate({ projectId: project.id, territoryId: territory.id, input: { name, version: territory.version } })}
                onDelete={() => remove.mutate({ projectId: project.id, territoryId: territory.id, version: territory.version })}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-2xl border-border/40 bg-secondary/5">
          <Globe className="h-12 w-12 text-muted-foreground/25 mb-4" />
          <h3 className="text-lg font-semibold text-foreground/70">No territories yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">Add your first territory to start tracking distribution rights, notes, and deal information.</p>
          <Button className="mt-6" onClick={() => setShowNewForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Territory
          </Button>
        </div>
      )}
    </div>
  );
}
