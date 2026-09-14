import { useState } from "react";
import { format } from "date-fns";
import type { Note, NoteCategory } from "@shared/contracts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { QueryState } from "@/components/QueryState";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useCurrentUser } from "@/features/auth/use-current-user";
import {
  useCreateNote,
  useDeleteNote,
  useNotes,
  useUpdateNote,
} from "@/features/notes/use-notes";
import { noteCategories, noteCategoryLabels } from "@/features/notes/labels";

function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: NoteCategory;
  onChange: (value: NoteCategory) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as NoteCategory)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {noteCategories.map((category) => (
          <SelectItem key={category} value={category}>
            {noteCategoryLabels[category]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Inline editor for one note; the server enforces author-or-admin. */
function NoteEditor({
  note,
  projectId,
  onDone,
}: {
  note: Note;
  projectId: string;
  onDone: () => void;
}) {
  const update = useUpdateNote();
  const [body, setBody] = useState(note.body);
  const [category, setCategory] = useState<NoteCategory>(note.category);
  const save = async () => {
    try {
      await update.mutateAsync({
        projectId,
        noteId: note.id,
        input: { body: body.trim(), category, version: note.version },
      });
      onDone();
    } catch {
      // Reported by the mutation hook; keep editing.
    }
  };
  return (
    <div className="space-y-3 pl-11">
      <Textarea
        aria-label="Edit note"
        value={body}
        maxLength={4000}
        onChange={(event) => setBody(event.target.value)}
        className="resize-none min-h-[100px]"
      />
      <div className="flex items-center gap-2">
        <div className="w-40">
          <CategorySelect id={`note-${note.id}-category`} value={category} onChange={setCategory} />
        </div>
        <Button size="sm" onClick={save} disabled={update.isPending || !body.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The project's note feed: anyone posts; authors and admins edit or delete. */
export default function ProjectNotesView() {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const currentUserId = useCurrentUser().data?.data.user.id;
  const notesQuery = useNotes(project.id);
  const create = useCreateNote();
  const remove = useDeleteNote();

  const [draft, setDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState<NoteCategory>("script");
  const [filter, setFilter] = useState<NoteCategory | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const notes = notesQuery.data?.data.items ?? [];
  const visible = filter === "all" ? notes : notes.filter((n) => n.category === filter);

  const post = async () => {
    try {
      await create.mutateAsync({
        projectId: project.id,
        input: { body: draft.trim(), category: draftCategory },
      });
      setDraft("");
    } catch {
      // Reported by the mutation hook; keep the draft.
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 w-full">
      <div>
        <h2 className="text-3xl font-display font-bold tracking-tight">Project Notes</h2>
        <p className="text-muted-foreground mt-1">
          High-level creative discussion and strategic notes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-1 space-y-6">
          <Card className="border-border/50 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Add New Note</CardTitle>
              <CardDescription>Post a note to the project feed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-note-body" className="sr-only">
                  Note
                </Label>
                <Textarea
                  id="new-note-body"
                  placeholder="Write your note here…"
                  className="resize-none min-h-[120px] bg-background"
                  value={draft}
                  maxLength={4000}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-note-category" className="text-xs font-medium text-muted-foreground ml-1">
                  Category
                </Label>
                <CategorySelect id="new-note-category" value={draftCategory} onChange={setDraftCategory} />
              </div>
              <Button className="w-full" onClick={post} disabled={!draft.trim() || create.isPending}>
                {create.isPending ? "Posting…" : "Post Note"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-3 space-y-6">
          <div className="flex items-center gap-2 pb-2 overflow-x-auto border-b border-border/40">
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mr-2">
              Filter:
            </span>
            {(["all", ...noteCategories] as const).map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={filter === category}
                onClick={() => setFilter(category)}
                className={cn(
                  "text-sm px-4 py-1.5 rounded-full border transition-all whitespace-nowrap",
                  filter === category
                    ? "bg-primary text-primary-foreground border-primary font-medium shadow-sm"
                    : "bg-background text-muted-foreground hover:bg-secondary hover:text-foreground border-border",
                )}
              >
                {category === "all" ? "All" : noteCategoryLabels[category]}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <QueryState queries={[notesQuery]} loading="Loading notes…" error="Project notes could not be loaded.">
            {visible.length > 0 ? (
              visible.map((note) => {
                const canManage = note.author.id === currentUserId || isStudioAdmin;
                const edited = note.updatedAt !== note.createdAt;
                return (
                  <Card
                    key={note.id}
                    data-testid="project-note"
                    className="border-border/40 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {note.author.displayName.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-medium leading-none">
                              {note.author.displayName}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(new Date(note.createdAt), "MMM d, yyyy • h:mm a")}
                              {edited && " • edited"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-normal bg-secondary/30">
                            {noteCategoryLabels[note.category]}
                          </Badge>
                          {canManage && editingId !== note.id && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit note"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditingId(note.id)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Delete note"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive -mr-2"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Note?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This note will be removed for everyone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        remove.mutate({
                                          projectId: project.id,
                                          noteId: note.id,
                                          version: note.version,
                                        })
                                      }
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </div>

                      {editingId === note.id ? (
                        <NoteEditor
                          note={note}
                          projectId={project.id}
                          onDone={() => setEditingId(null)}
                        />
                      ) : (
                        <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap pl-11">
                          {note.body}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl border-border/50 bg-secondary/5">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <h3 className="text-lg font-medium text-foreground">No notes yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  {filter !== "all"
                    ? `No notes in the ${noteCategoryLabels[filter]} category.`
                    : "Start the discussion by posting the first note."}
                </p>
              </div>
            )}
            </QueryState>
          </div>
        </div>
      </div>
    </div>
  );
}
