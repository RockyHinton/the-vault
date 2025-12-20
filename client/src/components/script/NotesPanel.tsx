import { useState } from "react";
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
  Save
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

interface NotesPanelProps {
  scriptId: string;
  onAnnotationClick: (page: number) => void;
  isCreating: boolean;
  onCancelCreate: () => void;
  onCreateNote: (text: string, type: NoteType, tag: NoteTag) => void;
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
  isCreating,
  onCancelCreate,
  onCreateNote
}: NotesPanelProps) {
  const { getScriptAnnotations, deleteAnnotation } = useStore();
  const annotations = getScriptAnnotations(scriptId);
  
  const [filterType, setFilterType] = useState<NoteType | 'All'>('All');
  
  // Create Form State
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("Creative");
  const [noteTag, setNoteTag] = useState<NoteTag>("Dialogue");

  const filteredAnnotations = annotations.filter(a => {
    if (filterType !== 'All' && a.type !== filterType) return false;
    return true;
  });

  const handleSave = () => {
    if (!noteText.trim()) return;
    onCreateNote(noteText, noteType, noteTag);
    setNoteText("");
  };

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0 h-16">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Notes
          <Badge variant="secondary" className="ml-2 text-xs">{filteredAnnotations.length}</Badge>
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
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {filteredAnnotations.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <p>No notes found for this filter.</p>
            </div>
          ) : (
            filteredAnnotations.map((note) => {
              const Icon = typeIcons[note.type] || MessageSquare;
              return (
                <div 
                  key={note.id} 
                  className="bg-card hover:bg-secondary/40 border border-border rounded-lg p-3 transition-colors cursor-pointer group relative"
                  onClick={() => onAnnotationClick(note.pageNumber)}
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

                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {note.text}
                  </p>

                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <Button 
                       variant="ghost" 
                       size="icon" 
                       className="h-6 w-6 text-muted-foreground hover:text-destructive"
                       onClick={(e) => {
                         e.stopPropagation();
                         if(confirm("Delete this note?")) deleteAnnotation(note.id);
                       }}
                     >
                       <Trash2 className="h-3 w-3" />
                     </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

    </div>
  );
}
