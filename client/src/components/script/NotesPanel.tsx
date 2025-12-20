import { useState, useEffect, useRef } from "react";
import { useStore, NoteType, NoteTag } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  MessageSquare, 
  Filter, 
  Tag, 
  Clock,
  Trash2,
  X,
  Palette,
  AlertCircle,
  HelpCircle,
  Save,
  Plus
} from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface NotesPanelProps {
  scriptId: string;
  onAnnotationClick: (page: number, id: string) => void;
  selectedAnnotationIds: string[];
  isCreating: boolean;
  onCancelCreate: () => void;
  onCreateNote: (text: string, type: NoteType, tag: NoteTag) => void;
  onAddNoteAtLocation: (x: number, y: number) => void;
}

const typeIcons: Record<NoteType, any> = {
  Creative: Palette,
  Commercial: AlertCircle,
  Question: HelpCircle,
  Concern: AlertCircle,
};

const typeColors: Record<NoteType, string> = {
  Creative: "text-purple-500 bg-purple-500/10",
  Commercial: "text-blue-500 bg-blue-500/10",
  Question: "text-amber-500 bg-amber-500/10",
  Concern: "text-red-500 bg-red-500/10",
};

export default function NotesPanel({ 
  scriptId, 
  onAnnotationClick, 
  selectedAnnotationIds,
  isCreating,
  onCancelCreate,
  onCreateNote,
  onAddNoteAtLocation
}: NotesPanelProps) {
  const { getScriptAnnotations, deleteAnnotation, user } = useStore();
  const annotations = getScriptAnnotations(scriptId);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  const [filterType, setFilterType] = useState<NoteType | 'All'>('All');
  
  // Create Form State
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("Creative");
  const [noteTag, setNoteTag] = useState<NoteTag>("Dialogue");

  const filteredAnnotations = annotations.filter(a => {
    if (filterType !== 'All' && a.type !== filterType) return false;
    return true;
  });

  // Sort: Selected notes first, then by timestamp (newest first)
  const sortedAnnotations = [...filteredAnnotations].sort((a, b) => {
    const aSelected = selectedAnnotationIds.includes(a.id);
    const bSelected = selectedAnnotationIds.includes(b.id);
    
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    
    // If both selected or both not selected, sort by date (newest first)
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const handleSave = () => {
    if (!noteText.trim()) return;
    onCreateNote(noteText, noteType, noteTag);
    setNoteText("");
  };

  // Auto-scroll to selected annotation
  useEffect(() => {
    // Scroll to the first selected annotation
    const firstSelectedId = selectedAnnotationIds[0];
    if (firstSelectedId) {
      const element = document.getElementById(`note-${firstSelectedId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedAnnotationIds]);

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0 h-16">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Notes
          <Badge variant="secondary" className="ml-2 text-xs">{sortedAnnotations.length}</Badge>
        </h3>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Filter className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Filter Notes</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={filterType === 'All'} onCheckedChange={() => setFilterType('All')}>
              All Types
            </DropdownMenuCheckboxItem>
            {(['Creative', 'Commercial', 'Question', 'Concern'] as NoteType[]).map(type => (
              <DropdownMenuCheckboxItem 
                key={type} 
                checked={filterType === type}
                onCheckedChange={() => setFilterType(type)}
              >
                {type}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Creation Mode (Inline) */}
      {isCreating && (
        <div className="p-4 bg-primary/5 border-b border-primary/20 animate-in slide-in-from-right-4 duration-300">
           <div className="flex items-center justify-between mb-3">
             <span className="text-sm font-semibold text-primary flex items-center gap-2">
               <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
               New Note
             </span>
             <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2" onClick={onCancelCreate}>
               <X className="h-4 w-4" />
             </Button>
           </div>
           
           <div className="space-y-3">
             <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Type</Label>
                  <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                   <SelectTrigger className="h-8 text-xs">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="Creative">Creative</SelectItem>
                     <SelectItem value="Commercial">Commercial</SelectItem>
                     <SelectItem value="Question">Question</SelectItem>
                     <SelectItem value="Concern">Concern</SelectItem>
                   </SelectContent>
                 </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Tag</Label>
                  <Select value={noteTag} onValueChange={(v) => setNoteTag(v as NoteTag)}>
                   <SelectTrigger className="h-8 text-xs">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="Dialogue">Dialogue</SelectItem>
                     <SelectItem value="Structure">Structure</SelectItem>
                     <SelectItem value="Character">Character</SelectItem>
                     <SelectItem value="Pacing">Pacing</SelectItem>
                     <SelectItem value="Budget Impact">Budget Impact</SelectItem>
                     <SelectItem value="Other">Other</SelectItem>
                   </SelectContent>
                 </Select>
                </div>
             </div>
             
             <Textarea 
               placeholder="Write your note here..." 
               value={noteText}
               onChange={(e) => setNoteText(e.target.value)}
               className="resize-none h-24 text-sm focus-visible:ring-primary/20"
               autoFocus
             />
             
             <Button size="sm" className="w-full" onClick={handleSave} disabled={!noteText}>
               <Save className="mr-2 h-3 w-3" />
               Save Note
             </Button>
           </div>
        </div>
      )}

      {/* List */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-3">
          {sortedAnnotations.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <p>No notes found for this filter.</p>
            </div>
          ) : (
            sortedAnnotations.map((note) => {
              const Icon = typeIcons[note.type] || MessageSquare;
              const isSelected = selectedAnnotationIds.includes(note.id);
              const isMyNote = user?.id === note.authorId;

              return (
                <div 
                  id={`note-${note.id}`}
                  key={note.id} 
                  className={cn(
                    "border rounded-lg p-3 transition-all cursor-pointer group relative",
                    isSelected 
                      ? "bg-primary/5 border-primary shadow-sm" 
                      : "bg-card hover:bg-secondary/40 border-border"
                  )}
                  onClick={() => onAnnotationClick(note.pageNumber, note.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                     <div className="flex items-center gap-2">
                       <Avatar className="h-5 w-5">
                         <AvatarImage />
                         <AvatarFallback className="text-[9px] bg-primary/20 text-primary">
                           {note.authorName.charAt(0)}
                         </AvatarFallback>
                       </Avatar>
                       <span className="text-xs font-medium text-foreground">{note.authorName}</span>
                     </div>
                     <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                       <Clock className="h-3 w-3" />
                       {format(new Date(note.timestamp), 'MMM d, h:mm a')}
                     </span>
                  </div>
                  
                  <div className="flex gap-2 mb-2">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-transparent ${typeColors[note.type]}`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {note.type}
                    </Badge>
                    {note.tag && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        <Tag className="h-3 w-3 mr-1 opacity-50" />
                        {note.tag}
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-foreground/90 leading-relaxed mb-2">
                    {note.text}
                  </p>

                  {/* Actions when selected */}
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

                  {/* Delete Button - Top right but better positioned */}
                  {isMyNote && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         className="h-6 w-6 text-muted-foreground hover:text-destructive bg-card/80 backdrop-blur-sm"
                         onClick={(e) => {
                           e.stopPropagation();
                           if(confirm("Delete this note?")) deleteAnnotation(note.id);
                         }}
                       >
                         <Trash2 className="h-3 w-3" />
                       </Button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

    </div>
  );
}
