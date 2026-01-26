import { useState } from "react";
import { Project, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, User, Users, DollarSign, BarChart3, Upload, CheckCircle, XCircle, CheckSquare, Square, Star, Plus, Pencil, MessageSquare } from "lucide-react";
import { UploadDocumentDialog } from "@/components/features/UploadDocumentDialog";
import { EditEvaluationDialog } from "@/components/features/EditEvaluationDialog";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import EvaluationScoringView from "./EvaluationScoringView";
import { Link } from "wouter";

interface EvaluationViewProps {
  project: Project;
}

export default function EvaluationView({ project }: EvaluationViewProps) {
  const { setProjectStage, getProjectReviews } = useStore();
  const [isScoringMode, setIsScoringMode] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  
  // Calculate Scores from Reviews
  const reviews = getProjectReviews(project.id);
  const reviewCount = reviews.length;
  
  const avgScript = reviewCount > 0 
    ? (reviews.reduce((acc, r) => acc + r.scriptScore, 0) / reviewCount).toFixed(1)
    : "0.0";
    
  const avgDirector = reviewCount > 0 
    ? (reviews.reduce((acc, r) => acc + r.directorScore, 0) / reviewCount).toFixed(1)
    : "0.0";
    
  const avgCast = reviewCount > 0 
    ? (reviews.reduce((acc, r) => acc + r.castScore, 0) / reviewCount).toFixed(1)
    : "0.0";

  const avgFinancing = reviewCount > 0 
    ? (reviews.reduce((acc, r) => acc + (r.financingScore || 0), 0) / reviewCount).toFixed(1)
    : "0.0";
    
  // Overall Weighted Average
  const overallScore = reviewCount > 0
    ? ((parseFloat(avgScript) + parseFloat(avgDirector) + parseFloat(avgCast) + parseFloat(avgFinancing)) / 4).toFixed(1)
    : "0.0";

  // Local state for the evaluation checklist
  const [checklist, setChecklist] = useState({
    scriptApproved: false,
    budgetApproved: false,
    financeApproved: false,
    talentAttached: false
  });

  const toggleChecklist = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checklist).every(Boolean);

  const handleApprove = () => {
    if (!allChecked) return;
    setShowApproveDialog(true);
  };

  const handleReject = () => {
    setShowRejectDialog(true);
  };

  if (isScoringMode) {
    return <EvaluationScoringView project={project} onBack={() => setIsScoringMode(false)} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Overview Panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-3 bg-secondary/5 border-secondary">
          <CardHeader>
             <CardTitle className="text-lg flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <BarChart3 className="h-5 w-5 text-primary" />
                 Project Evaluation Overview
               </div>
               <div className="flex items-center gap-2">
                 <Button variant="ghost" size="sm" onClick={() => setIsEditDialogOpen(true)} className="h-8 w-8 p-0">
                   <Pencil className="h-4 w-4" />
                 </Button>
                 {reviewCount > 0 && (
                   <Badge variant="outline" className="bg-background text-foreground font-mono">
                     {reviewCount} Reviews
                   </Badge>
                 )}
               </div>
             </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Writer</span>
                <div className="font-medium text-lg text-foreground truncate" title={project.evaluation.writer || 'Unassigned'}>
                  {project.evaluation.writer || 'Unassigned'}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Director</span>
                <div className="font-medium text-lg text-foreground truncate" title={project.evaluation.director || 'Searching...'}>
                  {project.evaluation.director || 'Searching...'}
                </div>
              </div>
               <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Est. Budget</span>
                <div className="font-medium text-lg text-foreground font-mono">{project.evaluation.plannedBudget || 'TBD'}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Finance</span>
                <div className="flex flex-wrap gap-1">
                  {project.evaluation.financeTypes && project.evaluation.financeTypes.length > 0 ? (
                    project.evaluation.financeTypes.map(type => (
                      <Badge key={type} variant="outline" className="text-[10px] h-5 px-1.5">{type}</Badge>
                    ))
                  ) : (
                    <Badge variant="outline">{project.evaluation.financeType || 'Unknown'}</Badge>
                  )}
                  {project.evaluation.financeStatus === 'Committed' && (
                    <Badge className="bg-green-500/20 text-green-500 border-transparent text-[10px] h-5 px-1.5">Committed</Badge>
                  )}
                </div>
              </div>
            </div>
            
            <EditEvaluationDialog 
              project={project} 
              isOpen={isEditDialogOpen} 
              onClose={() => setIsEditDialogOpen(false)} 
            />

            <Separator className="my-6" />

            {/* Scores Display */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-6">
              
              {/* Score Bars */}
              <div className="lg:col-span-8 space-y-5">
                 <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Script Quality</span>
                      <span className="font-bold">{avgScript}/10</span>
                    </div>
                    <Progress value={parseFloat(avgScript) * 10} className="h-2" />
                 </div>
                 
                 <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Director</span>
                      <span className="font-bold">{avgDirector}/10</span>
                    </div>
                    <Progress value={parseFloat(avgDirector) * 10} className="h-2" />
                 </div>

                 <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cast</span>
                      <span className="font-bold">{avgCast}/10</span>
                    </div>
                    <Progress value={parseFloat(avgCast) * 10} className="h-2" />
                 </div>

                 <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Financing</span>
                      <span className="font-bold">{avgFinancing}/10</span>
                    </div>
                    <Progress value={parseFloat(avgFinancing) * 10} className="h-2" />
                 </div>
                 
                 <div className="pt-2 flex gap-3">
                   <Button 
                     size="sm" 
                     variant="outline" 
                     className="gap-2 border-primary/20 hover:border-primary hover:bg-primary/5 text-primary"
                     onClick={() => setIsScoringMode(true)}
                   >
                     <Star className="h-4 w-4" />
                     Project Scoring
                   </Button>
                   <Link href={`/project/${project.id}/project-notes`}>
                     <Button 
                       size="sm" 
                       variant="outline" 
                       className="gap-2 border-primary/20 hover:border-primary hover:bg-primary/5 text-primary"
                     >
                       <MessageSquare className="h-4 w-4" />
                       Project Notes
                     </Button>
                   </Link>
                 </div>
              </div>

              {/* Overall Score Circle */}
              <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 bg-background/50 rounded-xl border border-border/50">
                 <div className="relative flex items-center justify-center h-24 w-24 rounded-full border-4 border-primary/20 mb-2">
                    <span className="text-3xl font-black text-foreground">{overallScore}</span>
                    <div className="absolute inset-0 rounded-full border-t-4 border-primary opacity-50 rotate-45" />
                 </div>
                 <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Overall Score</span>
                 <p className="text-[10px] text-muted-foreground mt-1 text-center">Average across all criteria</p>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Action Panel / Checklist */}
        <Card className="border-primary/20 bg-primary/5 shadow-lg shadow-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Decision Checklist</CardTitle>
            <CardDescription>Required for Development</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="space-y-3">
                {[
                  { key: 'scriptApproved', label: 'Script approved' },
                  { key: 'budgetApproved', label: 'Budget approved' },
                  { key: 'financeApproved', label: 'Finance approved' },
                  { key: 'talentAttached', label: 'Talent attached' }
                ].map((item) => (
                  <div 
                    key={item.key} 
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => toggleChecklist(item.key as keyof typeof checklist)}
                  >
                    <div className={cn(
                      "h-5 w-5 rounded border flex items-center justify-center transition-colors",
                      checklist[item.key as keyof typeof checklist] 
                        ? "bg-primary border-primary text-primary-foreground" 
                        : "border-muted-foreground group-hover:border-primary"
                    )}>
                      {checklist[item.key as keyof typeof checklist] && <CheckSquare className="h-3.5 w-3.5" />}
                    </div>
                    <span className={cn(
                      "text-sm",
                      checklist[item.key as keyof typeof checklist] ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>{item.label}</span>
                  </div>
                ))}
             </div>
             
             <Separator />

             <div className="flex flex-col gap-2 pt-2">
               <Button 
                 className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" 
                 onClick={handleApprove}
                 disabled={!allChecked}
               >
                 <CheckCircle className="mr-2 h-4 w-4" />
                 Approve for Dev
               </Button>
               <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/10" onClick={handleReject}>
                 <XCircle className="mr-2 h-4 w-4" />
                 Reject & Archive
               </Button>
             </div>
          </CardContent>
        </Card>
      </div>

      {/* Primary Zone: Script & Docs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
           <h3 className="text-xl font-display font-bold text-foreground">Script & Creative Materials</h3>
           <UploadDocumentDialog projectId={project.id} defaultCategoryId="c1">
             <Button variant="outline" size="sm">
               <Upload className="mr-2 h-4 w-4" />
               Upload File
             </Button>
           </UploadDocumentDialog>
        </div>
        
        {/* We reuse DocumentLibrary but strictly filtered for Script stuff */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
           <DocumentLibrary projectId={project.id} categoryId="c1" />
        </div>
      </div>

      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve for Development</AlertDialogTitle>
            <AlertDialogDescription>
              Move this project to Development? This will unlock packaging tools and allow you to begin the next phase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-primary hover:bg-primary/90"
              onClick={() => {
                setProjectStage(project.id, 'Development');
                setShowApproveDialog(false);
              }}
            >
              Approve Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this project? All data will be saved, but it will be moved to the Archived stage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                setProjectStage(project.id, 'Archived');
                setShowRejectDialog(false);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
