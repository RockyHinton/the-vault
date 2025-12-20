import { useState, useRef, useEffect } from "react";
import { useStore, NoteType, NoteTag, Document } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  StickyNote 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ScriptViewerProps {
  activeScript: Document;
  currentPage: number;
  onPageChange: (page: number) => void;
  onSelection: (x: number, y: number) => void;
  onAnnotationClick: (id: string) => void;
  onBackgroundClick: () => void;
  selectionPos: { x: number, y: number } | null;
  selectedAnnotationIds: string[];
}

// Mock script pages as images (placeholder)
const MOCK_PAGES = 3; 

export default function ScriptViewer({ 
  activeScript, 
  currentPage, 
  onPageChange,
  onSelection,
  onAnnotationClick,
  onBackgroundClick,
  selectionPos,
  selectedAnnotationIds
}: ScriptViewerProps) {
  const { getScriptAnnotations } = useStore();
  const annotations = getScriptAnnotations(activeScript.id);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePageClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop propagation to background
    if (!containerRef.current) return;
    
    // Get relative coordinates
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    onSelection(x, y);
  };

  const handleAnnotationClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent triggering page selection
    onAnnotationClick(id);
  };

  const pageAnnotations = annotations.filter(a => a.pageNumber === currentPage);

  // Auto-scroll to selected annotation in the script view
  useEffect(() => {
    // Scroll to the first selected annotation on the current page
    const firstSelectedId = selectedAnnotationIds[0];
    if (firstSelectedId && containerRef.current) {
      const annotation = annotations.find(a => a.id === firstSelectedId);
      if (annotation && annotation.pageNumber === currentPage) {
        const rect = containerRef.current.getBoundingClientRect();
        const pixelY = (annotation.y / 100) * rect.height;
        
        const scrollContainer = containerRef.current.parentElement;
        if (scrollContainer) {
          scrollContainer.scrollTo({
            top: pixelY - 100, // Scroll with some offset
            behavior: 'smooth'
          });
        }
      }
    }
  }, [selectedAnnotationIds, currentPage, annotations]);

  return (
    <div 
      className="flex flex-col h-full bg-zinc-900/50 relative overflow-hidden"
      onClick={onBackgroundClick} // Handle background clicks
    >
      
      {/* Toolbar / Page Controls */}
      <div 
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full border border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()} // Prevent clicking toolbar from deselecting
      >
         <Button 
           variant="ghost" 
           size="sm" 
           disabled={currentPage <= 1}
           onClick={() => onPageChange(currentPage - 1)}
         >
           Prev
         </Button>
         <span className="text-sm font-mono text-foreground">Page {currentPage} of {MOCK_PAGES}</span>
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
      <div className="flex-1 overflow-auto flex justify-center p-8 custom-scrollbar bg-[#1a1a1a]">
        <div 
          ref={containerRef}
          className="relative w-[850px] min-h-[1100px] bg-white shadow-2xl cursor-text transition-shadow"
          onClick={handlePageClick}
        >
           {/* Mock PDF Content (Text Lines) */}
           <div className="p-16 font-mono text-xs text-black space-y-4 select-none pointer-events-none opacity-90 leading-relaxed">
              <div className="text-center font-bold text-lg mb-8 underline uppercase">{activeScript.title.replace(/_/g, ' ').replace('.PDF', '')}</div>
              <p>SCENE {currentPage} - EXT. LOCATION - NIGHT</p>
              <p>The rain continues to fall. It's heavier now. The city lights blur into streaks of neon.</p>
              <p className="pl-16 font-bold mt-4">CHARACTER A</p>
              <p className="pl-8 w-2/3">This is where it happens. Right here on page {currentPage}.</p>
              <p className="mt-4">Action line describing something intense. The camera pans to reveal a hidden detail.</p>
              <p className="pl-16 font-bold mt-4">CHARACTER B</p>
              <p className="pl-8 w-2/3">I didn't think we'd make it this far.</p>
              
              {/* Fake Content Filler for Visuals */}
              {Array.from({ length: 25 }).map((_, i) => (
                 <div key={i} className="h-2 bg-gray-100 rounded w-full opacity-60 my-3" />
              ))}
           </div>

           {/* Annotations Overlay - Non Blocking */}
           {pageAnnotations.map((a) => (
             <div
               key={a.id}
               className={cn(
                 "absolute w-full h-6 border-l-4 transition-colors cursor-pointer group z-10",
                 selectedAnnotationIds.includes(a.id)
                   ? "border-primary bg-primary/30" 
                   : "border-primary/50 bg-primary/10 hover:bg-primary/20"
               )}
               style={{ top: `${a.y}%`, left: 0 }}
               title={a.text}
               onClick={(e) => handleAnnotationClick(e, a.id)}
             >
               {/* Margin Indicator */}
               <div className="absolute -left-12 top-0 h-6 w-6 flex items-center justify-center">
                 <div className={cn(
                   "h-2 w-2 rounded-full transition-transform", 
                   selectedAnnotationIds.includes(a.id) ? "bg-primary scale-125 ring-2 ring-background" : "bg-primary"
                 )} />
               </div>
             </div>
           ))}

           {/* Active Selection Marker */}
           {selectionPos && (
             <div 
               className="absolute w-full h-6 border-l-4 border-dashed border-primary/50 bg-primary/5 z-10 pointer-events-none"
               style={{ top: `${selectionPos.y}%`, left: 0 }}
             >
                <div className="absolute -left-4 top-0 bg-primary text-primary-foreground text-[10px] px-1 rounded animate-pulse">
                  New Note
                </div>
             </div>
           )}
        </div>
      </div>

    </div>
  );
}

