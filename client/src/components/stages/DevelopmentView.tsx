import { useState } from "react";
import { Project, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  
  // Accordion State
  const [openSection, setOpenSection] = useState<string | null>(null);
  
  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  // Data Logic
  const checklist = project.closingChecklist || {
    keyAgreementsSigned: false,
    financeClosed: false,
    talentConfirmed: false,
    bankingReady: false,
    legalDocsInPlace: false
  };

  const checklistItems = [
    { key: 'keyAgreementsSigned', label: 'Key Agreements Signed' },
    { key: 'financeClosed', label: 'Finance Closed' },
    { key: 'talentConfirmed', label: 'Talent Confirmed' },
    { key: 'bankingReady', label: 'Banking & Cashflow Ready' },
    { key: 'legalDocsInPlace', label: 'Legal Documentation' },
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
    if (confirm("Move to Production? Ensure all checklist items are verified.")) {
      setProjectStage(project.id, 'Production');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 w-full px-4 lg:px-8 py-6">
      
      {/* 1. Status Overview Card (Visual Anchor) */}
      <Card className="border-none shadow-md bg-gradient-to-r from-slate-900 to-slate-800 text-white overflow-hidden relative">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 h-full w-1/3 bg-white/5 skew-x-12 transform origin-bottom-right" />
        
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
            
            {/* Left: Stage & Timestamp */}
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-2">
                 <Badge className="bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 border-blue-500/30 px-3 py-1">In Development</Badge>
                 <span className="text-xs text-slate-400 flex items-center gap-1">
                   <Clock className="h-3 w-3" /> Updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                 </span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white">
                {project.title}
              </h2>
            </div>

            {/* Middle: Checklist Progress */}
            <div className="flex-1 w-full lg:max-w-md space-y-3 bg-white/5 p-4 rounded-lg border border-white/10">
               <div className="flex justify-between text-sm font-medium text-slate-200">
                 <span className="text-slate-400">Greenlight Readiness</span>
                 <span>{Math.round(progress)}% Complete</span>
               </div>
               <Progress value={progress} className="h-2 bg-white/10" indicatorClassName="bg-blue-400" />
               <div className="flex justify-between text-xs text-slate-500">
                  <span>{completedCount} tasks done</span>
                  <span>{totalCount - completedCount} remaining</span>
               </div>
            </div>

            {/* Right: Readiness State */}
            <div className="flex flex-col items-end">
               <span className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Current Status</span>
               <div className={cn(
                 "flex items-center gap-2 font-bold text-lg px-5 py-2 rounded-full border shadow-sm",
                 readinessState === 'Ready' && "bg-green-500 text-white border-green-400",
                 readinessState === 'Nearly Ready' && "bg-amber-500 text-white border-amber-400",
                 readinessState === 'Blocked' && "bg-slate-700 text-slate-300 border-slate-600",
               )}>
                 {readinessState === 'Ready' && <CheckCircle2 className="h-5 w-5" />}
                 {readinessState === 'Nearly Ready' && <Briefcase className="h-5 w-5" />}
                 {readinessState === 'Blocked' && <AlertCircle className="h-5 w-5" />}
                 {readinessState}
               </div>
            </div>

          </div>
        </CardContent>
      </Card>

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
                    className="w-full mt-6 font-semibold shadow-lg" 
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

        {/* 3. Operational Workstreams (Right Side) */}
        <div className="md:col-span-8 lg:col-span-9 space-y-4">
           <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
             <Briefcase className="h-5 w-5 text-primary" />
             Operational Workstreams
           </h3>
           
           {/* Workstream 1: Packaging & Agreements */}
           <WorkstreamAccordion 
             title="Packaging & Agreements" 
             icon={Users}
             summary="Manage Cast, Crew, and Location Agreements"
             isOpen={openSection === 'packaging'}
             onToggle={() => toggleSection('packaging')}
           >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                   <h4 className="font-semibold mb-2">Talent Agreements</h4>
                   {/* Using DocumentLibrary with specific filters */}
                   <DocumentLibrary projectId={project.id} categoryId="c1" subcategoryId="sc2" />
                 </div>
                 <div>
                   <h4 className="font-semibold mb-2">Location Contracts</h4>
                   <DocumentLibrary projectId={project.id} categoryId="c9" subcategoryId="sc13" />
                 </div>
              </div>
           </WorkstreamAccordion>

           {/* Workstream 2: Financing */}
           <WorkstreamAccordion 
             title="Financing" 
             icon={CircleDollarSign}
             summary="Budget, Cashflow, and Investment Docs"
             isOpen={openSection === 'financing'}
             onToggle={() => toggleSection('financing')}
           >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <h4 className="font-semibold mb-2">Budget Top Sheet</h4>
                    <DocumentLibrary projectId={project.id} categoryId="c3" subcategoryId="sc4" />
                 </div>
                 <div>
                    <h4 className="font-semibold mb-2">Funding Confirmations</h4>
                    <DocumentLibrary projectId={project.id} categoryId="c3" subcategoryId="sc6" />
                 </div>
              </div>
           </WorkstreamAccordion>

           {/* Workstream 3: Legal & Banking */}
           <WorkstreamAccordion 
             title="Legal & Banking" 
             icon={Scale}
             summary="Corporate Structure, Bank Accounts, Insurance"
             isOpen={openSection === 'legal'}
             onToggle={() => toggleSection('legal')}
           >
              <div className="space-y-4">
                 <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                    <Landmark className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Banking setup and legal wrapper documentation area.</p>
                 </div>
                 <div>
                    <h4 className="font-semibold mb-2">Legal Documents</h4>
                    <DocumentLibrary projectId={project.id} categoryId="c9" />
                 </div>
              </div>
           </WorkstreamAccordion>

           {/* Workstream 4: Tasks & Coordination */}
           <WorkstreamAccordion 
             title="Tasks & Coordination" 
             icon={ListTodo}
             summary={`${taskCount} Open Tasks require attention`}
             isOpen={openSection === 'tasks'}
             onToggle={() => toggleSection('tasks')}
           >
              <div className="h-[500px]">
                <TaskManager projectId={project.id} />
              </div>
           </WorkstreamAccordion>

        </div>
      </div>
    </div>
  );
}
