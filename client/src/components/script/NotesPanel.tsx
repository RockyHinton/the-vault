import { useState, useRef } from "react";
import { useStore, NoteType, NoteTag } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { 
  MessageSquare, 
  Filter, 
  Tag, 
  Plus, 
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Palette
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

export default function NotesPanel({ scriptId, onAnnotationClick }: NotesPanelProps) {
  const { getScriptAnnotations, user } = useStore();
  const annotations = getScriptAnnotations(scriptId);
  
  const [filterType, setFilterType] = useState<NoteType | 'All'>('All');
  const [filterUser, setFilterUser] = useState<string | 'All'>('All'); // User ID

  const filteredAnnotations = annotations.filter(a => {
    if (filterType !== 'All' && a.type !== filterType) return false;
    if (filterUser !== 'All' && a.authorId !== filterUser) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Notes & Annotations
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
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">By Type</DropdownMenuLabel>
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
            {/* Can add User filter logic here later */}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
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
                  className="bg-secondary/20 hover:bg-secondary/40 border border-border rounded-lg p-3 transition-colors cursor-pointer group"
                  onClick={() => onAnnotationClick(note.pageNumber)}
                >
                  <div className="flex items-start justify-between mb-2">
                     <div className="flex items-center gap-2">
                       <Avatar className="h-6 w-6">
                         <AvatarImage />
                         <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
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
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto text-muted-foreground">
                      Pg {note.pageNumber}
                    </Badge>
                  </div>

                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {note.text}
                  </p>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

    </div>
  );
}
