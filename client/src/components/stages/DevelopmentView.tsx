import { useState } from "react";
import { Project, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { 
  Briefcase, 
  FileCheck, 
  Landmark, 
  PenTool, 
  CheckSquare, 
  ChevronDown, 
  ChevronRight,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileText,
  Users,
  CircleDollarSign,
  Scale,
  ListTodo
} from "lucide-react";
import { TaskManager } from "@/components/features/TaskManager";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";

interface DevelopmentViewProps {
  project: Project;
}

// Workstream Accordion Component
const WorkstreamAccordion = ({ 
  title, 
  icon: Icon, 
  summary, 
  isOpen, 
  onToggle, 
  children 
}: { 
  title: string; 
  icon: any; 
  summary: string; 
  isOpen: boolean; 
  onToggle: () => void; 
  children: React.ReactNode; 
}) => {
  return (
    <Card className={cn("transition-all duration-200 border-l-4", isOpen ? "border-l-primary shadow-md" : "border-l-transparent hover:border-l-primary/30")}>
      <div 
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <div className={cn("p-2 rounded-lg", isOpen ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{title}</h3>
            {!isOpen && <p className="text-sm text-muted-foreground">{summary}</p>}
          </div>
        </div>
        <div className="flex items-center gap-4">
           {!isOpen && <Badge variant="secondary" className="font-normal">Open</Badge>}
           {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
        </div>
      </div>
      
      {isOpen && (
        <>
          <Separator />
          <div className="p-6 bg-card/50 animate-in slide-in-from-top-2 duration-200">
            {children}
          </div>
        </>
      )}
    </Card>
  );
};

export default function DevelopmentView({ project }: DevelopmentViewProps) {
  const { setProjectStage, updateClosingChecklist, tasks } = useStore();
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  
  // Accordion State
  const [openSection, setOpenSection] = useState<string | null>(null);
  
  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  // Data Logic
  const checklist = project.closingChecklist || {
    financeClosed: false,
    talentConfirmed: false,
    legalDocsClosed: false
  };

  const checklistItems = [
    { key: 'financeClosed', label: 'Finance Closed' },
    { key: 'talentConfirmed', label: 'Talent Confirmed' },
    { key: 'legalDocsClosed', label: 'Legal Documentation Closed' },
  ];

  const completedCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = checklistItems.length;
  const progress = (completedCount / totalCount) * 100;
  
  const isReadyForProduction = completedCount === totalCount;
  
  // Determine Readiness State
  let readinessState: 'Ready' | 'Nearly Ready' | 'Blocked' = 'Blocked';
  if (isReadyForProduction) readinessState = 'Ready';
  else if (progress >= 60) readinessState = 'Nearly Ready';

  // Task Summary
  const projectTasks = tasks.filter(t => t.projectId === project.id && t.status !== 'Done');
  const taskCount = projectTasks.length;

  const handleCheck = (key: keyof typeof checklist) => {
    updateClosingChecklist(project.id, { [key]: !checklist[key] });
  };

  const handlePromote = () => {
    setShowPromoteDialog(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 w-full px-4 lg:px-8 py-6">
      
      {/* 2. Greenlight Requirements (Checklist as Core Driver) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-4 lg:col-span-3 space-y-6">
           <div>
             <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
               <CheckSquare className="h-5 w-5 text-primary" />
               Greenlight Requirements
             </h3>
             <Card className="border-border shadow-sm">
                <CardContent className="p-4 space-y-3">
                  {checklistItems.map((item) => {
                    const isChecked = checklist[item.key as keyof typeof checklist];
                    return (
                      <div 
                        key={item.key} 
                        className={cn(
                          "flex items-center space-x-3 p-3 rounded-lg transition-colors border",
                          isChecked 
                            ? "bg-secondary/30 border-transparent" 
                            : "bg-background border-border hover:border-primary/30"
                        )}
                      >
                        <Checkbox 
                          id={item.key} 
                          checked={isChecked} 
                          onCheckedChange={() => handleCheck(item.key as keyof typeof checklist)}
                          className={cn(
                             isChecked ? "border-primary text-primary" : "border-muted-foreground/50"
                          )}
                        />
                        <label 
                          htmlFor={item.key} 
                          className={cn(
                            "text-sm font-medium leading-none cursor-pointer flex-1",
                            isChecked ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"
                          )}
                        >
                          {item.label}
                        </label>
                      </div>
                    );
                  })}

                  <Button 
                    className={cn(
                      "w-full mt-6 font-semibold shadow-lg transition-all duration-300",
                      isReadyForProduction 
                        ? "bg-green-600 hover:bg-green-700 text-white shadow-green-500/20" 
                        : ""
                    )}
                    disabled={!isReadyForProduction}
                    onClick={handlePromote}
                    size="lg"
                    variant={isReadyForProduction ? "default" : "outline"}
                  >
                    {isReadyForProduction ? "Greenlight Production" : "Complete Requirements"}
                  </Button>
                </CardContent>
             </Card>
           </div>
        </div>

        {/* 3. Task Board (Right Side) */}
        <div className="md:col-span-8 lg:col-span-9 space-y-4">
           <div className="h-[600px]">
             <TaskManager projectId={project.id} />
           </div>
        </div>
      </div>

      <AlertDialog open={showPromoteDialog} onOpenChange={setShowPromoteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Greenlight Production</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to move this project to Production? Ensure all checklist items are verified. This action will update the project stage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                setProjectStage(project.id, 'Production');
                setShowPromoteDialog(false);
              }}
            >
              Confirm Greenlight
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
