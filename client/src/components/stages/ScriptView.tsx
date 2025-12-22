import { useState } from "react";
import { Project, useStore, Document, ProjectNoteCategory } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { 
  FileText, 
  Calendar, 
  User, 
  Clock, 
  ArrowRight,
  Upload,
  MessageSquare,
  Filter,
  Search,
  BookOpen,
  Plus
} from "lucide-react";
import { format } from "date-fns";
import { UploadDocumentDialog } from "@/components/features/UploadDocumentDialog";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "wouter";

interface ScriptViewProps {
  project: Project;
}

export default function ScriptView({ project }: ScriptViewProps) {
  const { 
    getProjectDocuments, 
    getProjectNotes, 
    addProjectNote, 
    user 
  } = useStore();

  // Documents
  const documents = getProjectDocuments(project.id);
  
  // Filter for scripts
  const scriptDocs = documents.filter(d => 
    d.title.toLowerCase().includes('script') && d.type === 'PDF'
  ).sort((a, b) => b.version - a.version);

  const activeScript = scriptDocs[0];
  const previousScripts = scriptDocs.slice(1);

  // Other Related Documents
  const castDocs = documents.filter(d => 
    !d.title.toLowerCase().includes('script') && 
    (d.tags?.includes('cast') || d.title.toLowerCase().includes('cast') || d.categoryId === 'c8')
  );
  
  const devDocs = documents.filter(d => 
    !d.title.toLowerCase().includes('script') && 
    !castDocs.includes(d) &&
    (d.stageContext === 'Development' || d.tags?.includes('research'))
  );

  const otherDocs = documents.filter(d => 
    !scriptDocs.includes(d) && !castDocs.includes(d) && !devDocs.includes(d)
  );

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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div>
        <h2 className="text-3xl font-display font-bold tracking-tight">Script & Story</h2>
        <p className="text-muted-foreground mt-1">Manage script versions, analysis, and creative development notes.</p>
      </div>

      {/* 1. Primary Script Section */}
      <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Visual Preview Placeholder */}
            <div className="w-full md:w-48 aspect-[3/4] bg-white dark:bg-zinc-900 rounded shadow-md border flex items-center justify-center relative group cursor-pointer transition-transform hover:scale-[1.02]">
               <div className="absolute inset-x-0 bottom-0 top-4 bg-white dark:bg-zinc-900 shadow-sm -z-10 translate-y-2 scale-95 rounded border" />
               <div className="absolute inset-x-0 bottom-0 top-8 bg-white dark:bg-zinc-900 shadow-sm -z-20 translate-y-4 scale-90 rounded border" />
               <FileText className="h-12 w-12 text-muted-foreground/50" />
               {activeScript && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded text-white font-medium backdrop-blur-sm">
                   <BookOpen className="h-8 w-8 mb-2" />
                   Open Reader
                 </div>
               )}
            </div>

            <div className="flex-1 space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Current Version</Badge>
                  {activeScript && <span className="text-sm text-muted-foreground font-mono">v{activeScript.version}.0</span>}
                </div>
                <h3 className="text-2xl font-bold text-foreground">
                  {activeScript ? activeScript.title : "No Script Uploaded"}
                </h3>
                <p className="text-muted-foreground mt-2 max-w-2xl">
                  {activeScript 
                    ? `Uploaded by ${activeScript.uploadedBy} on ${format(new Date(activeScript.uploadedAt), 'MMMM d, yyyy')}` 
                    : "Upload a script to begin analysis and development tracking."}
                </p>
              </div>

              {activeScript && (
                <div className="flex flex-wrap gap-3">
                  <Link href={`/project/${project.id}/script-analysis/${activeScript.id}`}>
                    <Button size="lg" className="shadow-lg shadow-primary/20">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Open Script Analysis
                    </Button>
                  </Link>
                  <Button variant="outline" size="lg">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload New Version
                  </Button>
                </div>
              )}
              
              {!activeScript && (
                <UploadDocumentDialog projectId={project.id} defaultCategoryId="c1">
                  <Button size="lg">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload First Draft
                  </Button>
                </UploadDocumentDialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Versions & Docs */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* 2. Script Versions */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Version History
              </h3>
            </div>
            
            <div className="space-y-3">
              {previousScripts.length > 0 ? (
                previousScripts.map((script) => (
                  <div key={script.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-secondary/20 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-secondary/30 rounded flex items-center justify-center">
                        <span className="font-mono font-bold text-muted-foreground">v{script.version}</span>
                      </div>
                      <div>
                        <div className="font-medium">{script.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(script.uploadedAt), 'MMM d, yyyy')} • by {script.uploadedBy}
                        </div>
                      </div>
                    </div>
                    <Link href={`/project/${project.id}/script-analysis/${script.id}`}>
                      <Button variant="ghost" size="sm">Review Script</Button>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground italic py-2">No previous versions available.</div>
              )}
            </div>
          </section>

          <Separator />

          {/* 3. Related Documents */}
          <section>
             <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Related Documents
              </h3>
              <UploadDocumentDialog projectId={project.id}>
                <Button variant="outline" size="sm">
                  <Plus className="mr-2 h-3 w-3" />
                  Add Document
                </Button>
              </UploadDocumentDialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cast Documents */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Cast & Characters</h4>
                {castDocs.length > 0 ? (
                  castDocs.map(doc => (
                    <div key={doc.id} className="p-3 border rounded-md bg-secondary/10 flex items-start gap-3">
                      <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{doc.title}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(doc.uploadedAt), 'MMM d')}</div>
                      </div>
                    </div>
                  ))
                ) : <span className="text-xs text-muted-foreground italic">No documents</span>}
              </div>

              {/* Research & Dev */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Research & Development</h4>
                {devDocs.length > 0 ? (
                  devDocs.map(doc => (
                    <div key={doc.id} className="p-3 border rounded-md bg-secondary/10 flex items-start gap-3">
                      <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{doc.title}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(doc.uploadedAt), 'MMM d')}</div>
                      </div>
                    </div>
                  ))
                ) : <span className="text-xs text-muted-foreground italic">No documents</span>}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Project Notes */}
        <div className="lg:col-span-1">
          <Card className="h-full border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-lg flex items-center justify-between">
                Project Notes
                <Badge variant="outline" className="ml-2 font-normal text-muted-foreground">
                  {notes.length}
                </Badge>
              </CardTitle>
              <CardDescription>High-level discussion and creative notes.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 space-y-6">
              
              {/* Add Note Form */}
              <div className="space-y-3 p-4 border rounded-xl bg-card/50">
                <Textarea 
                  placeholder="Add a high-level note..." 
                  className="resize-none min-h-[80px] bg-background"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
                <div className="flex items-center justify-between gap-2">
                  <Select value={noteCategory} onValueChange={(v: any) => setNoteCategory(v)}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Script">Script</SelectItem>
                      <SelectItem value="Financing">Financing</SelectItem>
                      <SelectItem value="Cast">Cast</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>Post Note</Button>
                </div>
              </div>

              {/* Filter */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {["All", "Script", "Financing", "Cast", "Other"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat as any)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap",
                      filterCategory === cat 
                        ? "bg-primary text-primary-foreground border-primary" 
                        : "bg-background text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Notes Feed */}
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {filteredNotes.length > 0 ? (
                  filteredNotes.map((note) => (
                    <div key={note.id} className="space-y-2 group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                            {note.authorName.charAt(0)}
                          </div>
                          <span className="text-xs font-medium">{note.authorName}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(note.timestamp), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <div className="pl-8">
                        <div className="text-sm leading-relaxed text-foreground/90 bg-secondary/20 p-3 rounded-lg rounded-tl-none">
                          {note.text}
                        </div>
                        <div className="mt-1 flex gap-2">
                           <Badge variant="outline" className="text-[10px] py-0 h-5 border-transparent bg-secondary/50 text-muted-foreground">
                             {note.category}
                           </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    No notes found.
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
