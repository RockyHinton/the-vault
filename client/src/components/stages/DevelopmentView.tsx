import { Project, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Briefcase, FileCheck, Landmark, PenTool, CheckSquare } from "lucide-react";
import { TaskManager } from "@/components/features/TaskManager";
import DocumentLibrary from "@/pages/DocumentLibrary";

interface DevelopmentViewProps {
  project: Project;
}

export default function DevelopmentView({ project }: DevelopmentViewProps) {
  const { setProjectStage, updateClosingChecklist } = useStore();
  const checklist = project.closingChecklist || {
    keyAgreementsSigned: false,
    financeClosed: false,
    talentConfirmed: false,
    bankingReady: false,
    legalDocsInPlace: false
  };

  const handleCheck = (key: keyof typeof checklist) => {
    updateClosingChecklist(project.id, { [key]: !checklist[key] });
  };

  const isReadyForProduction = Object.values(checklist).every(Boolean);

  const handlePromote = () => {
    if (confirm("Move to Production? Ensure all checklist items are verified.")) {
      setProjectStage(project.id, 'Production');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
      
      {/* Left Column: Tasks & Checklist */}
      <div className="space-y-8 lg:col-span-1">
        {/* Closing Checklist */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Closing Checklist
            </CardTitle>
            <CardDescription>Required before Greenlight</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                { key: 'keyAgreementsSigned', label: 'Key Agreements Signed' },
                { key: 'financeClosed', label: 'Finance Closed' },
                { key: 'talentConfirmed', label: 'Talent Confirmed' },
                { key: 'bankingReady', label: 'Banking & Cashflow Ready' },
                { key: 'legalDocsInPlace', label: 'Legal Documentation' },
              ].map((item) => (
                <div key={item.key} className="flex items-center space-x-2">
                  <Checkbox 
                    id={item.key} 
                    checked={checklist[item.key as keyof typeof checklist]} 
                    onCheckedChange={() => handleCheck(item.key as keyof typeof checklist)}
                  />
                  <label htmlFor={item.key} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                    {item.label}
                  </label>
                </div>
              ))}
            </div>
            
            <Button 
              className="w-full mt-4" 
              disabled={!isReadyForProduction}
              onClick={handlePromote}
              variant={isReadyForProduction ? "default" : "secondary"}
            >
              {isReadyForProduction ? "Greenlight Production" : "Complete Checklist to Proceed"}
            </Button>
          </CardContent>
        </Card>

        {/* Task Manager */}
        <div className="h-[500px]">
          <TaskManager projectId={project.id} />
        </div>
      </div>

      {/* Right Column: Documentation Workspace */}
      <div className="lg:col-span-2 space-y-8">
        
        {/* Agreements Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-display font-bold flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Packaging & Agreements
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Group 1: Talent */}
             <Card>
               <CardHeader className="pb-3">
                 <CardTitle className="text-base">Talent Agreements</CardTitle>
               </CardHeader>
               <CardContent className="p-0">
                  <DocumentLibrary projectId={project.id} categoryId="c1" subcategoryId="sc2" /> 
                  {/* Note: Mapping to sc2 (Cast Wishlist) for demo, real app would have specific Agreement cats */}
               </CardContent>
             </Card>

             {/* Group 2: Financing */}
             <Card>
               <CardHeader className="pb-3">
                 <CardTitle className="text-base">Financing Docs</CardTitle>
               </CardHeader>
               <CardContent className="p-0">
                  <DocumentLibrary projectId={project.id} categoryId="c3" subcategoryId="sc6" />
               </CardContent>
             </Card>
          </div>
        </div>

        {/* Banking & Legal */}
        <div className="space-y-4">
           <h3 className="text-xl font-display font-bold flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              Banking & Legal
            </h3>
            <div className="bg-card border border-border rounded-xl overflow-hidden p-6 text-center text-muted-foreground border-dashed">
               <p>Banking setup and legal wrapper documentation area.</p>
               {/* Placeholder for specific document categories */}
            </div>
        </div>

      </div>
    </div>
  );
}
