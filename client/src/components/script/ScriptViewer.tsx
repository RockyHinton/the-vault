import { useState, useRef, useEffect } from "react";
import { useStore, NoteType, NoteTag } from "@/lib/store";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, MessageSquare, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScriptViewerProps {
  scriptId: string;
  currentPage: number;
  onPageChange: (page: number) => void;
}

// Mock script pages as images (placeholder)
// In a real app, this would be a PDF Canvas or similar
const MOCK_PAGES = 3; 

export default function ScriptViewer({ scriptId, currentPage, onPageChange }: ScriptViewerProps) {
  const { getScriptAnnotations, addAnnotation } = useStore();
  const annotations = getScriptAnnotations(scriptId);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Annotation Creation State
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [clickPos, setClickPos] = useState<{x: number, y: number} | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("Creative");
  const [noteTag, setNoteTag] = useState<NoteTag>("Dialogue");

  const handlePageClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    // Get relative coordinates
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setClickPos({ x, y });
    setIsAddingNote(true);
  };

  const handleSaveNote = () => {
    if (!clickPos) return;
    
    addAnnotation({
      scriptVersionId: scriptId,
      pageNumber: currentPage,
      x: clickPos.x,
      y: clickPos.y,
      text: noteText,
      type: noteType,
      tag: noteTag,
    });

    setIsAddingNote(false);
    setNoteText("");
    setClickPos(null);
  };

  const pageAnnotations = annotations.filter(a => a.pageNumber === currentPage);

  return (
    <div className="flex flex-col h-full bg-secondary/10 relative overflow-hidden">
      
      {/* Toolbar / Page Controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-background/80 backdrop-blur-md px-4 py-2 rounded-full border border-border shadow-sm">
         <Button 
           variant="ghost" 
           size="sm" 
           disabled={currentPage <= 1}
           onClick={() => onPageChange(currentPage - 1)}
         >
           Prev
         </Button>
         <span className="text-sm font-mono">Page {currentPage} of {MOCK_PAGES}</span>
         <Button 
           variant="ghost" 
           size="sm" 
           disabled={currentPage >= MOCK_PAGES}
           onClick={() => onPageChange(currentPage + 1)}
         >
           Next
         </Button>
      </div>

      {/* Script Page Render */}
      <div className="flex-1 overflow-auto flex justify-center p-8 custom-scrollbar">
        <div 
          ref={containerRef}
          className="relative w-[850px] min-h-[1100px] bg-white shadow-xl cursor-text transition-shadow hover:shadow-2xl"
          onClick={handlePageClick}
        >
           {/* Mock PDF Content (Text Lines) */}
           <div className="p-16 font-mono text-xs text-black space-y-4 select-none pointer-events-none opacity-80">
              <div className="text-center font-bold text-lg mb-8 underline">NEON NIGHTS</div>
              <p>SCENE 1 - EXT. NEW TOKYO - NIGHT</p>
              <p>Rain lashes against the neon-soaked pavement. Steam rises from the vents, obscuring the towering holograms of the corporate district.</p>
              <p className="pl-16 font-bold mt-4">KAITO (V.O.)</p>
              <p className="pl-8 w-2/3">They say this city never sleeps. But it dreams. It dreams of electric sheep and synthetic gods.</p>
              <p className="mt-4">A black sedan hovers silently around the corner, its headlights cutting through the smog.</p>
              <p className="pl-16 font-bold mt-4">ELENA</p>
              <p className="pl-8 w-2/3">Are you seeing this? The signal is coming from the 42nd floor.</p>
              
              {/* Fake Content Filler for Visuals */}
              {Array.from({ length: 20 }).map((_, i) => (
                 <div key={i} className="h-2 bg-gray-100 rounded w-full opacity-50 my-2" />
              ))}
           </div>

           {/* Annotations Overlay */}
           {pageAnnotations.map((a) => (
             <div
               key={a.id}
               className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shadow-lg ring-2 ring-background z-10 hover:scale-110 transition-transform cursor-pointer"
               style={{ left: `${a.x}%`, top: `${a.y}%` }}
               title={a.text}
             >
               <StickyNote className="h-3 w-3" />
             </div>
           ))}

           {/* New Annotation Marker (Pending) */}
           {clickPos && (
             <div 
               className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-primary bg-transparent animate-ping z-20"
               style={{ left: `${clickPos.x}%`, top: `${clickPos.y}%` }}
             />
           )}
        </div>
      </div>

      {/* Add Note Dialog */}
      <Dialog open={isAddingNote} onOpenChange={(open) => !open && setIsAddingNote(false)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Annotation</DialogTitle>
            <DialogDescription>
              Page {currentPage} at {Math.round(clickPos?.y || 0)}%
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label>Type</Label>
                 <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                   <SelectTrigger>
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
               <div className="space-y-2">
                 <Label>Tag</Label>
                 <Select value={noteTag} onValueChange={(v) => setNoteTag(v as NoteTag)}>
                   <SelectTrigger>
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
             <div className="space-y-2">
               <Label>Note</Label>
               <Textarea 
                 placeholder="Type your observation here..." 
                 value={noteText}
                 onChange={(e) => setNoteText(e.target.value)}
                 className="resize-none h-24"
               />
             </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingNote(false)}>Cancel</Button>
            <Button onClick={handleSaveNote} disabled={!noteText}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
