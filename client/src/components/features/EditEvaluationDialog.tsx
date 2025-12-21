import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { useStore, Project } from "@/lib/store";

interface EditEvaluationDialogProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

const FINANCE_OPTIONS = [
  "Grant", "Subsidy", "Equity", "Loan", "Pre-sale", "Deferral"
];

export function EditEvaluationDialog({ project, isOpen, onClose }: EditEvaluationDialogProps) {
  const { updateEvaluation } = useStore();
  
  const [writer, setWriter] = useState(project.evaluation.writer || "");
  const [director, setDirector] = useState(project.evaluation.director || "");
  const [plannedBudget, setPlannedBudget] = useState(project.evaluation.plannedBudget || "");
  
  // Handle migration from single financeType to financeTypes array
  const [selectedFinanceTypes, setSelectedFinanceTypes] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setWriter(project.evaluation.writer || "");
      setDirector(project.evaluation.director || "");
      setPlannedBudget(project.evaluation.plannedBudget || "");
      
      let initialTypes: string[] = [];
      if (project.evaluation.financeTypes && project.evaluation.financeTypes.length > 0) {
        initialTypes = project.evaluation.financeTypes;
      } else if (project.evaluation.financeType) {
        initialTypes = [project.evaluation.financeType];
      }
      setSelectedFinanceTypes(initialTypes);
    }
  }, [isOpen, project]);

  const handleToggleFinance = (type: string) => {
    if (selectedFinanceTypes.includes(type)) {
      setSelectedFinanceTypes(prev => prev.filter(t => t !== type));
    } else {
      setSelectedFinanceTypes(prev => [...prev, type]);
    }
  };

  const handleSave = () => {
    updateEvaluation(project.id, {
      writer,
      director,
      plannedBudget,
      financeTypes: selectedFinanceTypes,
      financeType: selectedFinanceTypes[0] // Keep legacy field in sync with first option for backward compat if needed
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Project Details</DialogTitle>
          <DialogDescription>Update the core project information and financing structure.</DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="writer">Writer</Label>
            <Input 
              id="writer" 
              value={writer} 
              onChange={(e) => setWriter(e.target.value)} 
              placeholder="Screenwriter Name"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="director">Director</Label>
            <Input 
              id="director" 
              value={director} 
              onChange={(e) => setDirector(e.target.value)} 
              placeholder="Director Name"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="budget">Est. Budget</Label>
            <Input 
              id="budget" 
              value={plannedBudget} 
              onChange={(e) => setPlannedBudget(e.target.value)} 
              placeholder="$5M"
            />
          </div>

          <div className="grid gap-3">
            <Label>Finance Structure</Label>
            <div className="flex flex-wrap gap-2">
              {FINANCE_OPTIONS.map((type) => {
                const isSelected = selectedFinanceTypes.includes(type);
                return (
                  <Badge 
                    key={type}
                    variant={isSelected ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary/90 transition-colors"
                    onClick={() => handleToggleFinance(type)}
                  >
                    {type}
                    {isSelected && <X className="ml-1 h-3 w-3" />}
                    {!isSelected && <Plus className="ml-1 h-3 w-3 opacity-50" />}
                  </Badge>
                );
              })}
            </div>
            {selectedFinanceTypes.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Select at least one financing source.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
