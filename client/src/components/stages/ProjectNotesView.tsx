import { useState } from "react";
import { Project, useStore, ProjectNoteCategory } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  MessageSquare,
  Filter,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
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

interface ProjectNotesViewProps {
  project: Project;
}

export default function ProjectNotesView({ project }: ProjectNotesViewProps) {
  const { 
    getProjectNotes, 
    addProjectNote, 
    deleteProjectNote,
    user 
  } = useStore();

  // Notes State
  const notes = getProjectNotes(project.id);
  const [newNote, setNewNote] = useState("");
  const [noteCategory, setNoteCategory] = useState<ProjectNoteCategory>("Script");
  const [filterCategory, setFilterCategory] = useState<ProjectNoteCategory | "All">("All");

  const filteredNotes = filterCategory === "All" 
    ? notes 
    : notes.filter(n => n.category === filterCategory);

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    
    addProjectNote({
      projectId: project.id,
      text: newNote,
      category: noteCategory
    });
    
    setNewNote("");
    toast.success("Note added");
  };

  const handleDeleteNote = (noteId: string) => {
    deleteProjectNote(noteId);
    toast.success("Note deleted");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      
      {/* Header */}
      <div>
        <h2 className="text-3xl font-display font-bold tracking-tight">Project Notes</h2>
        <p className="text-muted-foreground mt-1">High-level creative discussion and strategic notes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Input Form */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-border/50 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Add New Note</CardTitle>
              <CardDescription>Post a note to the project feed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                 <Textarea 
                    placeholder="Write your note here..." 
                    className="resize-none min-h-[120px] bg-background"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                  />
              </div>
              
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground ml-1">Category</span>
                <Select value={noteCategory} onValueChange={(v: any) => setNoteCategory(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Script">Script</SelectItem>
                    <SelectItem value="Financing">Financing</SelectItem>
                    <SelectItem value="Cast">Cast</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" onClick={handleAddNote} disabled={!newNote.trim()}>
                Post Note
              </Button>
            </CardContent>
          </Card>

          {/* Filter Panel (Desktop) */}
          <div className="hidden md:block space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground px-1 uppercase tracking-wider">Filter Feed</h3>
            <div className="flex flex-col gap-1">
               {["All", "Script", "Financing", "Cast", "Other"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat as any)}
                    className={cn(
                      "text-sm px-3 py-2 rounded-md text-left transition-colors flex justify-between items-center group",
                      filterCategory === cat 
                        ? "bg-secondary text-foreground font-medium" 
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    )}
                  >
                    {cat}
                    {filterCategory === cat && <Filter className="h-3 w-3 opacity-50" />}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Right Column: Feed */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Mobile Filter */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-2">
            {["All", "Script", "Financing", "Cast", "Other"].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat as any)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap",
                  filterCategory === cat 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "bg-background text-muted-foreground hover:bg-secondary"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredNotes.length > 0 ? (
              filteredNotes.map((note) => {
                // Check if current user is author (using mock user ID match or just simplistic for now)
                // In mock mode, we assume 'u1' is current user or check against user object
                const isAuthor = user?.id === note.authorId; 

                return (
                  <Card key={note.id} className="border-border/40 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {note.authorName.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-medium leading-none">{note.authorName}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(new Date(note.timestamp), 'MMM d, yyyy • h:mm a')}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                           <Badge variant="outline" className="font-normal bg-secondary/30">
                              {note.category}
                           </Badge>
                           {isAuthor && (
                             <AlertDialog>
                               <AlertDialogTrigger asChild>
                                 <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive -mr-2">
                                   <Trash2 className="h-3.5 w-3.5" />
                                 </Button>
                               </AlertDialogTrigger>
                               <AlertDialogContent>
                                 <AlertDialogHeader>
                                   <AlertDialogTitle>Delete Note?</AlertDialogTitle>
                                   <AlertDialogDescription>
                                     This action cannot be undone. This note will be removed for everyone.
                                   </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel>Cancel</AlertDialogCancel>
                                   <AlertDialogAction onClick={() => handleDeleteNote(note.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                     Delete
                                   </AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                             </AlertDialog>
                           )}
                        </div>
                      </div>
                      
                      <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap pl-11">
                        {note.text}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl border-border/50 bg-secondary/5">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <h3 className="text-lg font-medium text-foreground">No notes yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  {filterCategory !== "All" 
                    ? `No notes found in the ${filterCategory} category.` 
                    : "Start the discussion by posting the first note."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
