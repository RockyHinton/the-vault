import { useEffect, useState } from "react";
import { format } from "date-fns";
import type { AnnotationTag, AnnotationType, ScriptAnnotation } from "@shared/contracts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Filter, Tag, Clock, Trash2, X, Palette, AlertCircle, HelpCircle, Save, Plus, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import {
  annotationTagLabels,
  annotationTags,
  annotationTypeLabels,
  annotationTypes,
} from "@/features/scripts/labels";

export interface NoteDraft {
  body: string;
  type: AnnotationType;
  tag: AnnotationTag | null;
}

interface NotesPanelProps {
  annotations: ScriptAnnotation[];
  currentUserId: string | undefined;
  isStudioAdmin: boolean;
  onAnnotationClick: (page: number, id: string) => void;
  selectedAnnotationIds: string[];
  isCreating: boolean;
  onCancelCreate: () => void;
  onCreateNote: (draft: NoteDraft) => Promise<unknown>;
  onUpdateNote: (annotation: ScriptAnnotation, draft: NoteDraft) => Promise<unknown>;
  onDeleteNote: (annotation: ScriptAnnotation) => void;
  onAddNoteAtLocation: (x: number, y: number) => void;
}

const typeIcons: Record<AnnotationType, typeof Palette> = {
  creative: Palette,
  commercial: AlertCircle,
  question: HelpCircle,
  concern: AlertCircle,
};
const typeColors: Record<AnnotationType, string> = {
  creative: "text-purple-500 bg-purple-500/10",
  commercial: "text-blue-500 bg-blue-500/10",
  question: "text-amber-500 bg-amber-500/10",
  concern: "text-red-500 bg-red-500/10",
};
const NO_TAG = "none";

function NoteForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: NoteDraft;
  submitLabel: string;
  onSubmit: (draft: NoteDraft) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial.body);
  const [type, setType] = useState<AnnotationType>(initial.type);
  const [tag, setTag] = useState<AnnotationTag | null>(initial.tag);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ body: body.trim(), type, tag });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="note-type" className="text-[10px] uppercase text-muted-foreground">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as AnnotationType)}>
            <SelectTrigger id="note-type" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {annotationTypes.map((t) => (
                <SelectItem key={t} value={t}>{annotationTypeLabels[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="note-tag" className="text-[10px] uppercase text-muted-foreground">Tag</Label>
          <Select value={tag ?? NO_TAG} onValueChange={(v) => setTag(v === NO_TAG ? null : (v as AnnotationTag))}>
            <SelectTrigger id="note-tag" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TAG}>No tag</SelectItem>
              {annotationTags.map((t) => (
                <SelectItem key={t} value={t}>{annotationTagLabels[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Textarea
        aria-label="Note text"
        placeholder="Write your note here..."
        value={body}
        maxLength={4000}
        onChange={(e) => setBody(e.target.value)}
        className="resize-none h-24 text-sm focus-visible:ring-primary/20"
        autoFocus
      />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={submit} disabled={!body.trim() || busy}>
          <Save className="mr-2 h-3 w-3" />
          {busy ? "Saving…" : submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}

/** Notes on the exact script version being read; author-or-admin edit and delete. */
export default function NotesPanel({
  annotations,
  currentUserId,
  isStudioAdmin,
  onAnnotationClick,
  selectedAnnotationIds,
  isCreating,
  onCancelCreate,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onAddNoteAtLocation,
}: NotesPanelProps) {
  const [filterType, setFilterType] = useState<AnnotationType | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<ScriptAnnotation | null>(null);

  const visible = annotations.filter((a) => filterType === "all" || a.type === filterType);
  const sorted = [...visible].sort((a, b) => {
    const aSelected = selectedAnnotationIds.includes(a.id);
    const bSelected = selectedAnnotationIds.includes(b.id);
    if (aSelected !== bSelected) return aSelected ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const canManage = (a: ScriptAnnotation) => isStudioAdmin || a.author.id === currentUserId;

  useEffect(() => {
    const firstSelectedId = selectedAnnotationIds[0];
    if (firstSelectedId) document.getElementById(`note-${firstSelectedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedAnnotationIds]);

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0 h-16">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Notes
          <Badge variant="secondary" className="ml-2 text-xs">{sorted.length}</Badge>
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Filter notes">
              <Filter className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Filter Notes</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={filterType === "all"} onCheckedChange={() => setFilterType("all")}>
              All Types
            </DropdownMenuCheckboxItem>
            {annotationTypes.map((type) => (
              <DropdownMenuCheckboxItem key={type} checked={filterType === type} onCheckedChange={() => setFilterType(type)}>
                {annotationTypeLabels[type]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isCreating && (
        <div className="p-4 bg-primary/5 border-b border-primary/20 animate-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-primary flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              New Note
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2" onClick={onCancelCreate} aria-label="Cancel note">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <NoteForm
            initial={{ body: "", type: "creative", tag: null }}
            submitLabel="Save Note"
            onSubmit={onCreateNote}
            onCancel={onCancelCreate}
          />
        </div>
      )}

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {sorted.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <p>{annotations.length === 0 ? "No notes on this version yet. Click the page to add one." : "No notes match this filter."}</p>
            </div>
          ) : (
            sorted.map((note) => {
              const Icon = typeIcons[note.type];
              const isSelected = selectedAnnotationIds.includes(note.id);
              return (
                <div
                  id={`note-${note.id}`}
                  key={note.id}
                  data-testid="script-note"
                  className={cn(
                    "border rounded-lg p-3 transition-all cursor-pointer group relative",
                    isSelected ? "bg-primary/5 border-primary shadow-sm" : "bg-card hover:bg-secondary/40 border-border",
                  )}
                  onClick={() => onAnnotationClick(note.pageNumber, note.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px] bg-primary/20 text-primary">
                          {note.author.displayName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium text-foreground">{note.author.displayName}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      p.{note.pageNumber} · {format(new Date(note.createdAt), "MMM d, h:mm a")}
                    </span>
                  </div>

                  {editingId === note.id ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <NoteForm
                        initial={{ body: note.body, type: note.type, tag: note.tag }}
                        submitLabel="Save Changes"
                        onSubmit={async (draft) => {
                          await onUpdateNote(note, draft);
                          setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2 mb-2">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-transparent ${typeColors[note.type]}`}>
                          <Icon className="h-3 w-3 mr-1" />
                          {annotationTypeLabels[note.type]}
                        </Badge>
                        {note.tag && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            <Tag className="h-3 w-3 mr-1 opacity-50" />
                            {annotationTagLabels[note.tag]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground/90 leading-relaxed mb-2 whitespace-pre-wrap">{note.body}</p>
                      {isSelected && (
                        <div className="flex justify-end pt-2 border-t border-border/50 gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] gap-1 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddNoteAtLocation(note.x, note.y);
                            }}
                          >
                            <Plus className="h-3 w-3" />
                            Reply / Add Here
                          </Button>
                        </div>
                      )}
                      {canManage(note) && (
                        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit note"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground bg-card/80 backdrop-blur-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(note.id);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete note"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive bg-card/80 backdrop-blur-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNoteToDelete(note);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={noteToDelete !== null} onOpenChange={(open) => !open && setNoteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>This note will be removed from this script version for everyone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (noteToDelete) onDeleteNote(noteToDelete);
                setNoteToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
