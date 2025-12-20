import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useStore, Document, NoteType, NoteTag } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ChevronLeft, Share2, Download, CheckCircle, FileText, X } from "lucide-react";

import ScriptViewer from "@/components/script/ScriptViewer";
import NotesPanel from "@/components/script/NotesPanel";
import ReviewSummary from "@/components/script/ReviewSummary";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ScriptAnalysisPage() {
  const [match, params] = useRoute("/script/:id");
  const [location, setLocation] = useLocation();
  const { documents, projects, addReview, addAnnotation } = useStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // New Note State
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [draftPos, setDraftPos] = useState<{x: number, y: number} | null>(null);
  
  // Selection State
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);

  // Review Form State
  const [creativeScore, setCreativeScore] = useState(5);
  const [commercialScore, setCommercialScore] = useState(5);
  const [budgetScore, setBudgetScore] = useState(5);
  const [rec, setRec] = useState<"Pass" | "Consider" | "Develop">("Consider");
  const [summary, setSummary] = useState("");

  const scriptId = params?.id;
  const document = documents.find(d => d.id === scriptId);
  const project = document ? projects.find(p => p.id === document.projectId) : null;
  const annotations = documents && document ? useStore.getState().getScriptAnnotations(document.id) : [];

  if (!document || !project) return <div>Script not found</div>;

  const handleSubmitReview = () => {
    addReview({
      scriptVersionId: document.id,
      creativeScore,
      commercialScore,
      budgetScore,
      recommendation: rec,
      summaryNotes: summary,
    });
    setIsReviewOpen(false);
  };

  const handleSelection = (x: number, y: number) => {
    // If we're selecting a new area, clear previous selection
    setSelectedAnnotationIds([]);
    setDraftPos({ x, y });
    setIsCreatingNote(true);
  };

  const handleAnnotationClick = (id: string) => {
    const clickedNote = annotations.find(a => a.id === id);
    if (!clickedNote) return;

    // Find all notes on the same page within a close Y proximity (e.g. 2%)
    // This groups notes that are visually "at the same section"
    const nearbyNotes = annotations.filter(a => 
      a.pageNumber === clickedNote.pageNumber && 
      Math.abs(a.y - clickedNote.y) < 2
    ).map(a => a.id);

    setSelectedAnnotationIds(nearbyNotes);
    setIsCreatingNote(false);
    setDraftPos(null);
  };

  const handleAddNoteAtLocation = (x: number, y: number) => {
    setDraftPos({ x, y });
    setIsCreatingNote(true);
  };

  const handleCreateNote = (text: string, type: NoteType, tag: NoteTag) => {
    if (!draftPos) return;
    addAnnotation({
      scriptVersionId: document.id,
      pageNumber: currentPage,
      x: draftPos.x,
      y: draftPos.y,
      text,
      type,
      tag,
    });
    setIsCreatingNote(false);
    setDraftPos(null);
  };

  const handleCancelNote = () => {
    setIsCreatingNote(false);
    setDraftPos(null);
  };

  const handleDeselectAll = () => {
    setSelectedAnnotationIds([]);
    setIsCreatingNote(false);
    setDraftPos(null);
  };

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
        
        {/* Full Screen Header */}
        <header className="h-16 bg-background border-b border-border flex items-center justify-between px-6 shrink-0 z-50">
          <div className="flex items-center gap-4">
             <Link href={`/project/${project.id}/script`}>
               <Button variant="ghost" className="gap-2">
                 <ChevronLeft className="h-4 w-4" />
                 Exit Review
               </Button>
             </Link>
             <div className="h-6 w-[1px] bg-border" />
             <div className="flex items-center gap-3">
               <h1 className="text-lg font-bold font-display">{document.title}</h1>
               <Badge variant="outline" className="font-mono text-xs">v{document.version}</Badge>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
              <DialogTrigger asChild>
                <Button>
                  <CheckCircle className="mr-2 h-4 w-4" /> Submit Score
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                 <DialogHeader>
                   <DialogTitle>Submit Script Review</DialogTitle>
                   <DialogDescription>Your structured evaluation for this draft.</DialogDescription>
                 </DialogHeader>
                 <div className="space-y-6 py-4">
                   <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label>Creative Score</Label>
                          <span className="font-mono text-sm">{creativeScore}/10</span>
                        </div>
                        <Slider value={[creativeScore]} max={10} min={1} step={1} onValueChange={([v]) => setCreativeScore(v)} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label>Commercial Score</Label>
                          <span className="font-mono text-sm">{commercialScore}/10</span>
                        </div>
                        <Slider value={[commercialScore]} max={10} min={1} step={1} onValueChange={([v]) => setCommercialScore(v)} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label>Budget Feasibility</Label>
                          <span className="font-mono text-sm">{budgetScore}/10</span>
                        </div>
                        <Slider value={[budgetScore]} max={10} min={1} step={1} onValueChange={([v]) => setBudgetScore(v)} />
                      </div>
                   </div>

                   <div className="space-y-2">
                     <Label>Recommendation</Label>
                     <Select value={rec} onValueChange={(v: any) => setRec(v)}>
                       <SelectTrigger>
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Pass">Pass</SelectItem>
                         <SelectItem value="Consider">Consider</SelectItem>
                         <SelectItem value="Develop">Develop</SelectItem>
                       </SelectContent>
                     </Select>
                   </div>

                   <div className="space-y-2">
                     <Label>Summary Notes</Label>
                     <Textarea 
                       placeholder="High-level thoughts..." 
                       value={summary}
                       onChange={(e) => setSummary(e.target.value)}
                       className="h-24"
                     />
                   </div>
                 </div>
                 <DialogFooter>
                   <Button variant="outline" onClick={() => setIsReviewOpen(false)}>Cancel</Button>
                   <Button onClick={handleSubmitReview}>Submit Review</Button>
                 </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {/* Content Layout */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Main Panel: PDF Viewer */}
          <main className="flex-1 relative flex flex-col min-w-0 bg-secondary/5">
             <div className="p-4 z-10">
                <ReviewSummary scriptId={document.id} />
             </div>
             <ScriptViewer 
               activeScript={document}
               currentPage={currentPage} 
               onPageChange={setCurrentPage} 
               onSelection={handleSelection}
               onAnnotationClick={handleAnnotationClick}
               onBackgroundClick={handleDeselectAll}
               selectionPos={draftPos}
               selectedAnnotationIds={selectedAnnotationIds}
             />
          </main>

          {/* Right Panel: Notes */}
          <aside className="w-[400px] shrink-0 z-20 shadow-2xl bg-card">
             <NotesPanel 
               scriptId={document.id} 
               onAnnotationClick={(page, id) => {
                 setCurrentPage(page);
                 handleAnnotationClick(id);
               }} 
               selectedAnnotationIds={selectedAnnotationIds}
               isCreating={isCreatingNote}
               onCancelCreate={handleCancelNote}
               onCreateNote={handleCreateNote}
               onAddNoteAtLocation={handleAddNoteAtLocation}
             />
          </aside>
        </div>

    </div>
  );
}

