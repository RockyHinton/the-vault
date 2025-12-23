import { Project, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { 
  Scale, 
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LegalViewProps {
  project: Project;
  currentSubcategory?: string;
  subcategoryId?: string;
}

export default function LegalView({ project, currentSubcategory, subcategoryId }: LegalViewProps) {
  const { getCategorySubcategories, updateDocumentationChecklist } = useStore();
  
  // Drill-down view
  if (subcategoryId) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
             <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">
               {currentSubcategory}
             </h2>
             <p className="text-muted-foreground mt-1">
               Legal documentation and executed agreements.
             </p>
          </div>
        </div>
        <DocumentLibrary 
           projectId={project.id} 
           categoryId="c9" // Hardcoded for Documentation/Legal category
           subcategoryId={subcategoryId} 
         />
      </div>
    );
  }

  // Dashboard View - Checklist
  const documentationSubcategories = getCategorySubcategories("c9"); // 'c9' is the Documentation category ID
  const checklist = project.documentationChecklist || {};

  const handleCheck = (subcategoryId: string, checked: boolean) => {
    updateDocumentationChecklist(project.id, { [subcategoryId]: checked });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div>
        <h2 className="text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
          <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center p-0 border-blue-500/20 bg-blue-500/10 text-blue-500">
            <FileText className="h-4 w-4" />
          </Badge>
          Documentation
        </h2>
        <p className="text-muted-foreground mt-1 ml-11">
          Manage and track completion of all required project documentation.
        </p>
      </div>

      {/* Documentation Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-muted-foreground" />
            Documentation Checklist
          </CardTitle>
          <CardDescription>Track the status of required documentation sections.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {documentationSubcategories.map((sub) => {
              const isChecked = checklist[sub.id] || false;
              return (
                <div 
                  key={sub.id}
                  className={cn(
                    "flex items-center space-x-3 p-4 rounded-lg transition-colors border",
                    isChecked 
                      ? "bg-secondary/30 border-transparent" 
                      : "bg-card border-border hover:border-primary/30"
                  )}
                >
                  <Checkbox 
                    id={sub.id} 
                    checked={isChecked} 
                    onCheckedChange={(checked) => handleCheck(sub.id, checked as boolean)}
                    className={cn(
                       isChecked ? "border-primary text-primary" : "border-muted-foreground/50"
                    )}
                  />
                  <div className="flex-1">
                    <label 
                      htmlFor={sub.id} 
                      className={cn(
                        "text-base font-medium leading-none cursor-pointer block mb-1",
                        isChecked ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"
                      )}
                    >
                      {sub.name}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {isChecked ? "Section marked as complete" : "Pending completion"}
                    </p>
                  </div>
                  {isChecked && (
                    <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-transparent">
                      Completed
                    </Badge>
                  )}
                </div>
              );
            })}
            
            {documentationSubcategories.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No documentation sections found.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
