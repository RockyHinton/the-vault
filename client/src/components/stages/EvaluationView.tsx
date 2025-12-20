import { useState } from "react";
import { Project, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, User, Users, DollarSign, BarChart3, Upload, CheckCircle, XCircle, CheckSquare, Square } from "lucide-react";
import { UploadDocumentDialog } from "@/components/features/UploadDocumentDialog";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface EvaluationViewProps {
  project: Project;
}

export default function EvaluationView({ project }: EvaluationViewProps) {
  const { setProjectStage } = useStore();
  
  // Local state for the evaluation checklist
  const [checklist, setChecklist] = useState({
    scriptReviewed: false,
    budgetReviewed: false,
    financeAssessed: false,
    talentAssessed: false
  });

  const toggleChecklist = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checklist).every(Boolean);

  const handleApprove = () => {
    if (!allChecked) return;
    if (confirm("Move this project to Development? This will unlock packaging tools.")) {
      setProjectStage(project.id, 'Development');
    }
  };

  const handleReject = () => {
    if (confirm("Archive this project? All data will be saved.")) {
      setProjectStage(project.id, 'Archived');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Overview Panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-3 bg-secondary/5 border-secondary">
          <CardHeader>
             <CardTitle className="text-lg flex items-center gap-2">
               <BarChart3 className="h-5 w-5 text-primary" />
               Project Evaluation Overview
             </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Writer</span>
                <div className="font-medium text-lg text-foreground">{project.evaluation.writer || 'Unassigned'}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Director</span>
                <div className="font-medium text-lg text-foreground">{project.evaluation.director || 'Searching...'}</div>
              </div>
               <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Est. Budget</span>
                <div className="font-medium text-lg text-foreground font-mono">{project.evaluation.plannedBudget || 'TBD'}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Finance Type</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{project.evaluation.financeType || 'Unknown'}</Badge>
                  {project.evaluation.financeStatus === 'Committed' && (
                    <Badge className="bg-green-500/20 text-green-500 border-transparent">Committed</Badge>
                  )}
                </div>
              </div>
            </div>
            
            <Separator className="my-6" />

            {/* Scores Moved Here */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Creative Score</span>
                  <span className="font-bold">{project.evaluation.scores?.creative || 0}/10</span>
                </div>
                <Progress value={(project.evaluation.scores?.creative || 0) * 10} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Financial Score</span>
                  <span className="font-bold">{project.evaluation.scores?.financial || 0}/10</span>
                </div>
                <Progress value={(project.evaluation.scores?.financial || 0) * 10} className="h-2" />
              </div>
            </div>
            
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Attached Talent</span>
              <div className="flex flex-wrap gap-2">
                {project.evaluation.castAttached?.map((actor, i) => (
                  <Badge key={i} variant="secondary" className="px-3 py-1 text-sm bg-secondary/50">
                    <User className="h-3 w-3 mr-2 opacity-50" />
                    {actor.name} <span className="opacity-50 ml-1">as {actor.role}</span>
                  </Badge>
                )) || <span className="text-muted-foreground italic">No cast attached yet</span>}
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
                  { key: 'scriptReviewed', label: 'Script reviewed' },
                  { key: 'budgetReviewed', label: 'Budget reviewed' },
                  { key: 'financeAssessed', label: 'Finance assessed' },
                  { key: 'talentAssessed', label: 'Talent assessed' }
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

    </div>
  );
}
