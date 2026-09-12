import { useState } from "react";
import { Project, useStore, Territory, TerritoryStatus, TerritoryDealInfo } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Upload,
  Download,
  ChevronDown,
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
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface DistributionViewProps {
  project: Project;
}

const STATUS_CONFIG: Record<TerritoryStatus, { label: string; color: string; Icon: any }> = {
  Available: { label: "Available", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200", Icon: CircleDot },
  "In Discussion": { label: "In Discussion", color: "bg-amber-500/10 text-amber-600 border-amber-200", Icon: Clock },
  Licensed: { label: "Licensed", color: "bg-blue-500/10 text-blue-600 border-blue-200", Icon: CheckCircle2 },
  Delivered: { label: "Delivered", color: "bg-violet-500/10 text-violet-600 border-violet-200", Icon: Truck },
  Closed: { label: "Closed", color: "bg-slate-400/10 text-slate-500 border-slate-200", Icon: XCircle },
};

function StatusBadge({ status }: { status: TerritoryStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border", cfg.color)}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ─── Territory Card ───────────────────────────────────────────────────────────
function TerritoryCard({
  territory,
  onClick,
  onRename,
  onDelete,
}: {
  territory: Territory;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(territory.name);

  const handleRenameSubmit = () => {
    if (nameInput.trim() && nameInput.trim() !== territory.name) {
      onRename(nameInput.trim());
    }
    setRenaming(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="group relative"
    >
      <Card
        className={cn(
          "cursor-pointer border border-border/50 bg-card transition-all duration-200",
          "hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5 hover:border-border"
        )}
        onClick={onClick}
      >
        <CardContent className="p-6 space-y-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
                <Globe className="h-5 w-5 text-primary/70" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-foreground leading-tight">{territory.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Updated {format(new Date(territory.updatedAt), "MMM d, yyyy")}
                </p>
              </div>
            </div>

            {/* Three-dot menu — stops card click propagation */}
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
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
                  <DropdownMenuSeparator />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete territory
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {territory.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove the territory, all its notes, and all its documents. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={onDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Status */}
          <StatusBadge status={territory.status} />

          {/* Stats row */}
          <div className="flex items-center gap-5 pt-1">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>{territory.documents.length} {territory.documents.length === 1 ? "doc" : "docs"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{territory.notes.length} {territory.notes.length === 1 ? "note" : "notes"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inline rename dialog */}
      <AlertDialog open={renaming} onOpenChange={setRenaming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Territory</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(); }}
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
function TerritoryWorkspace({
  territory,
  projectId,
  onBack,
}: {
  territory: Territory;
  projectId: string;
  onBack: () => void;
}) {
  const {
    updateTerritoryStatus,
    addTerritoryNote,
    editTerritoryNote,
    deleteTerritoryNote,
    addTerritoryDocument,
    deleteTerritoryDocument,
    updateTerritoryDealInfo,
    fixtureActor: user,
  } = useStore();

  // Notes state
  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Document upload state
  const [fileNameInput, setFileNameInput] = useState("");
  const [fileDescInput, setFileDescInput] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  // Deal info local state — mirrors store, kept in sync on save
  const [dealInfo, setDealInfo] = useState<TerritoryDealInfo>(territory.dealInfo);
  const [dealDirty, setDealDirty] = useState(false);

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addTerritoryNote(territory.id, noteText.trim());
    setNoteText("");
    toast.success("Note added");
  };

  const handleSaveEdit = (noteId: string) => {
    if (!editingText.trim()) return;
    editTerritoryNote(noteId, editingText.trim());
    setEditingNoteId(null);
    toast.success("Note updated");
  };

  const handleDeleteNote = (noteId: string) => {
    deleteTerritoryNote(noteId);
    toast.success("Note deleted");
  };

  const handleUploadDocument = () => {
    if (!fileNameInput.trim()) return;
    addTerritoryDocument(territory.id, {
      fileName: fileNameInput.trim(),
      description: fileDescInput.trim() || undefined,
    });
    setFileNameInput("");
    setFileDescInput("");
    setShowUpload(false);
    toast.success("Document added");
  };

  const handleDeleteDocument = (docId: string) => {
    deleteTerritoryDocument(docId);
    toast.success("Document removed");
  };

  const handleSaveDeal = () => {
    updateTerritoryDealInfo(territory.id, dealInfo);
    setDealDirty(false);
    toast.success("Deal information saved");
  };

  const dealField = (field: keyof TerritoryDealInfo, label: string, multiline = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</Label>
      {multiline ? (
        <Textarea
          value={dealInfo[field] || ""}
          onChange={(e) => { setDealInfo(d => ({ ...d, [field]: e.target.value })); setDealDirty(true); }}
          className="resize-none min-h-[80px] bg-background text-sm"
          placeholder={`Enter ${label.toLowerCase()}...`}
        />
      ) : (
        <Input
          value={dealInfo[field] || ""}
          onChange={(e) => { setDealInfo(d => ({ ...d, [field]: e.target.value })); setDealDirty(true); }}
          className="bg-background text-sm"
          placeholder={`Enter ${label.toLowerCase()}...`}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-400">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          All Territories
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-6">
          <div>
            <h2 className="text-3xl font-display font-bold tracking-tight text-foreground">{territory.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Last updated {format(new Date(territory.updatedAt), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <Select
              value={territory.status}
              onValueChange={(v) => {
                updateTerritoryStatus(territory.id, v as TerritoryStatus);
                toast.success("Status updated");
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_CONFIG) as TerritoryStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Notes Section */}
      <section className="space-y-5">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Notes</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Territory-specific notes and updates.</p>
        </div>

        {/* Add note */}
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-3">
            <Textarea
              placeholder="Add a note for this territory..."
              className="resize-none min-h-[100px] bg-background"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="flex justify-end">
              <Button onClick={handleAddNote} disabled={!noteText.trim()} size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Note
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notes list */}
        <div className="space-y-3">
          <AnimatePresence>
            {territory.notes.length > 0 ? (
              territory.notes.map((note) => (
                <motion.div
                  key={note.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="border-border/40 shadow-sm">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                            {note.authorName.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-medium leading-none">{note.authorName}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(new Date(note.createdAt), "MMM d, yyyy · h:mm a")}
                              {note.editedAt && (
                                <span className="ml-2 italic opacity-70">
                                  (edited {format(new Date(note.editedAt), "MMM d")})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditingText(note.text);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Note?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. The note will be permanently removed.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteNote(note.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      {editingNoteId === note.id ? (
                        <div className="space-y-2 pl-11">
                          <Textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="resize-none min-h-[80px] bg-background text-sm"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveEdit(note.id)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap pl-11">
                          {note.text}
                        </p>
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

      {/* Documents Section */}
      <section className="space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Documents</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Files and agreements for this territory.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowUpload(v => !v)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Upload Document
          </Button>
        </div>

        {/* Upload form */}
        <AnimatePresence>
          {showUpload && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="border-border/50 border-dashed">
                <CardContent className="p-5 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">File Name</Label>
                    <Input
                      placeholder="e.g. UK_Distribution_Agreement.pdf"
                      value={fileNameInput}
                      onChange={(e) => setFileNameInput(e.target.value)}
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description (optional)</Label>
                    <Input
                      placeholder="Brief description of this document..."
                      value={fileDescInput}
                      onChange={(e) => setFileDescInput(e.target.value)}
                      className="bg-background"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleUploadDocument} disabled={!fileNameInput.trim()}>Add Document</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowUpload(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Document list */}
        <div className="space-y-2">
          {territory.documents.length > 0 ? (
            territory.documents.map((doc) => (
              <Card key={doc.id} className="border-border/40 shadow-sm hover:shadow-md transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-primary/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.fileName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Uploaded by {doc.uploadedBy} · {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                      </p>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5 italic">{doc.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Download">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Document?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove <strong>{doc.fileName}</strong> from this territory.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed rounded-xl border-border/40 bg-secondary/5">
              <FileText className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground/70">No documents yet</p>
              <p className="text-xs text-muted-foreground mt-1">Upload agreements and contracts for this territory.</p>
            </div>
          )}
        </div>
      </section>

      <Separator />

      {/* Deal Information Section */}
      <section className="space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Important Deal Information</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Key deal details for this territory. No calculations — information only.</p>
          </div>
          {dealDirty && (
            <Button size="sm" onClick={handleSaveDeal}>Save Changes</Button>
          )}
        </div>

        <Card className="border-border/50">
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {dealField("distributor", "Distributor")}
            {dealField("contact", "Contact")}
            {dealField("signaturePayment", "Signature Payment")}
            {dealField("deliveryPayment", "Delivery Payment")}
            <div className="md:col-span-2">
              {dealField("generalNotes", "General Notes", true)}
            </div>
          </CardContent>
        </Card>

        {dealDirty && (
          <div className="flex justify-end">
            <Button onClick={handleSaveDeal}>Save Changes</Button>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Main Distribution View ───────────────────────────────────────────────────
export default function DistributionView({ project }: DistributionViewProps) {
  const {
    getProjectTerritories,
    addTerritory,
    renameTerritory,
    deleteTerritory,
    territories: allTerritories,
  } = useStore();

  const territories = getProjectTerritories(project.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTerritoryName, setNewTerritoryName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const selectedTerritory = territories.find(t => t.id === selectedId) || null;

  // When in workspace view, keep territory data live from store
  if (selectedTerritory) {
    return (
      <TerritoryWorkspace
        territory={selectedTerritory}
        projectId={project.id}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  // Summary counts
  const counts = {
    total: territories.length,
    licensed: territories.filter(t => t.status === "Licensed").length,
    inDiscussion: territories.filter(t => t.status === "In Discussion").length,
    available: territories.filter(t => t.status === "Available").length,
  };

  const handleAddTerritory = () => {
    if (!newTerritoryName.trim()) return;
    addTerritory(project.id, newTerritoryName.trim());
    setNewTerritoryName("");
    setShowNewForm(false);
    toast.success("Territory added");
  };

  const handleDelete = (territoryId: string) => {
    deleteTerritory(territoryId);
    toast.success("Territory deleted");
  };

  const handleRename = (territoryId: string, name: string) => {
    renameTerritory(territoryId, name);
    toast.success("Territory renamed");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h2 className="text-3xl font-display font-bold tracking-tight text-foreground">Distribution</h2>
          <p className="text-muted-foreground mt-1">Manage territory licensing and distribution agreements.</p>
        </div>
        <Button onClick={() => setShowNewForm(v => !v)}>
          <Plus className="h-4 w-4 mr-2" />
          New Territory
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Territories", value: counts.total, color: "text-foreground" },
          { label: "Licensed", value: counts.licensed, color: "text-blue-600" },
          { label: "In Discussion", value: counts.inDiscussion, color: "text-amber-600" },
          { label: "Available", value: counts.available, color: "text-emerald-600" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="p-5 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className={cn("text-3xl font-bold", color)}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New Territory Form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-border/50 border-dashed">
              <CardContent className="p-5">
                <p className="text-sm font-medium mb-3">New Territory Name</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. United Kingdom, France, Japan..."
                    value={newTerritoryName}
                    onChange={(e) => setNewTerritoryName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTerritory(); }}
                    className="bg-background"
                    autoFocus
                  />
                  <Button onClick={handleAddTerritory} disabled={!newTerritoryName.trim()}>
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

      {/* Territory Grid */}
      {territories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <AnimatePresence>
            {territories.map((territory) => (
              <TerritoryCard
                key={territory.id}
                territory={territory}
                onClick={() => setSelectedId(territory.id)}
                onRename={(name) => handleRename(territory.id, name)}
                onDelete={() => handleDelete(territory.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-2xl border-border/40 bg-secondary/5">
          <Globe className="h-12 w-12 text-muted-foreground/25 mb-4" />
          <h3 className="text-lg font-semibold text-foreground/70">No territories yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Add your first territory to start tracking distribution rights, notes, and deal information.
          </p>
          <Button className="mt-6" onClick={() => setShowNewForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Territory
          </Button>
        </div>
      )}
    </div>
  );
}
