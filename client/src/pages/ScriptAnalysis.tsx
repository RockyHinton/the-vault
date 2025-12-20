import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useStore, Document } from "@/lib/store";
import { Shell } from "@/components/layout/Shell";
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
import { ChevronLeft, Share2, Download, CheckCircle, FileText } from "lucide-react";

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
  const { documents, projects, addReview } = useStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // Review Form State
  const [creativeScore, setCreativeScore] = useState(5);
  const [commercialScore, setCommercialScore] = useState(5);
  const [budgetScore, setBudgetScore] = useState(5);
  const [rec, setRec] = useState<"Pass" | "Consider" | "Develop">("Consider");
  const [summary, setSummary] = useState("");

  const scriptId = params?.id;
  const document = documents.find(d => d.id === scriptId);
  const project = document ? projects.find(p => p.id === document.projectId) : null;

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

  return (
    <Shell>
      <div className="flex flex-col h-[calc(100vh-80px)] -m-6">
        
        {/* Header Bar */}
        <header className="h-16 bg-background border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
             <Link href={`/project/${project.id}/script`}>
               <Button variant="ghost" size="icon">
                 <ChevronLeft className="h-5 w-5" />
               </Button>
             </Link>
             <div>
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href={`/project/${project.id}`}>{project.title}</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-semibold text-foreground">{document.title}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                   <Badge variant="outline" className="text-[10px] py-0 h-4">v{document.version}</Badge>
                   <span>Last updated {new Date(document.uploadedAt).toLocaleDateString()}</span>
                </div>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
            <Button variant="ghost" size="sm">
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
              <DialogTrigger asChild>
                <Button>
                  <CheckCircle className="mr-2 h-4 w-4" /> Submit Review
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
          <main className="flex-1 relative flex flex-col min-w-0">
             <div className="p-4 z-10 bg-background/50 backdrop-blur-sm">
                <ReviewSummary scriptId={document.id} />
             </div>
             <ScriptViewer 
               scriptId={document.id} 
               currentPage={currentPage} 
               onPageChange={setCurrentPage} 
             />
          </main>

          {/* Right Panel: Notes */}
          <aside className="w-[350px] shrink-0 z-20 shadow-xl">
             <NotesPanel 
               scriptId={document.id} 
               onAnnotationClick={setCurrentPage} 
             />
          </aside>
        </div>

      </div>
    </Shell>
  );
}
