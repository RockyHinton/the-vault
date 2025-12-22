import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const FINANCE_OPTIONS = [
  "Grant", "Subsidy", "Equity", "Loan", "Pre-sale", "Deferral"
];

export function NewProjectDialog({ isOpen, onClose }: NewProjectDialogProps) {
  const { addProject, setCurrentProject, projects } = useStore();
  
  const [title, setTitle] = useState("");
  const [writer, setWriter] = useState("");
  const [director, setDirector] = useState("");
  const [plannedBudget, setPlannedBudget] = useState("");
  const [selectedFinanceTypes, setSelectedFinanceTypes] = useState<string[]>([]);

  const handleToggleFinance = (type: string) => {
    if (selectedFinanceTypes.includes(type)) {
      setSelectedFinanceTypes(prev => prev.filter(t => t !== type));
    } else {
      setSelectedFinanceTypes(prev => [...prev, type]);
    }
  };

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Project title is required");
      return;
    }

    addProject({
      title,
      logline: "New project in evaluation.",
      synopsis: "",
      genre: "Drama", // Default
      status: "Active",
      evaluation: {
        writer,
        director,
        plannedBudget,
        financeTypes: selectedFinanceTypes,
        financeType: selectedFinanceTypes[0]
      }
    });

    toast.success("Project created successfully");
    // Optionally set current project or navigate
    
    // Reset form
    setTitle("");
    setWriter("");
    setDirector("");
    setPlannedBudget("");
    setSelectedFinanceTypes([]);
    
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Project Evaluation</DialogTitle>
          <DialogDescription>Start a new project by defining the core package.</DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Project Title</Label>
            <Input 
              id="title" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g. The Last Harvest"
              autoFocus
            />
          </div>

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
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!title.trim()}>Create Project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
