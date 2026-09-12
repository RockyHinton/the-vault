import { useState } from "react";
import type { Project } from "@shared/contracts";
import { useArchiveProject } from "@/features/projects/use-projects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Star, Archive } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ArchiveProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  projectTitle: string;
}

type ArchiveReason = 'Creative pass' | 'Commercial viability' | 'Financing not secured' | 'Rights / legal issues' | 'Packaging fell through' | 'Paused (strategic / timing)' | 'Produced / completed' | 'Withdrawn';
type RevisitStatus = 'Yes' | 'Maybe' | 'No';

export function ArchiveProjectDialog({ isOpen, onClose, project, projectTitle }: ArchiveProjectDialogProps) {
  const archiveProject = useArchiveProject();
  
  const [reason, setReason] = useState<ArchiveReason | ''>('');
  const [revisit, setRevisit] = useState<RevisitStatus | ''>('');
  const [starred, setStarred] = useState(false);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{reason?: boolean; revisit?: boolean}>({});

  const handleArchive = async () => {
    const newErrors = {
      reason: !reason,
      revisit: !revisit
    };

    if (newErrors.reason || newErrors.revisit) {
      setErrors(newErrors);
      return;
    }
    
    try {
      await archiveProject.mutateAsync({
        id: project.id,
        input: {
          reason: reason === "Creative pass" ? "creative_pass" : reason === "Commercial viability" ? "commercial_viability" : reason === "Financing not secured" ? "financing_not_secured" : reason === "Rights / legal issues" ? "rights_legal_issues" : reason === "Packaging fell through" ? "packaging_fell_through" : reason === "Paused (strategic / timing)" ? "paused_strategic_timing" : reason === "Produced / completed" ? "produced_completed" : "withdrawn",
          revisit: revisit.toLowerCase() as "yes" | "maybe" | "no",
          starred,
          notes: notes || undefined,
          version: project.version,
        },
      });
      onClose();
    } catch {
      setErrors({ reason: true });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-muted-foreground" />
            Archive Project
          </DialogTitle>
          <DialogDescription>
            You are about to archive "{projectTitle}". This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          
          {/* Reason Selection */}
          <div className="space-y-3">
            <Label className={`text-base ${errors.reason ? 'text-destructive' : ''}`}>
              Reason for archiving *
            </Label>
            <Select onValueChange={(val) => {
              setReason(val as ArchiveReason);
              setErrors(prev => ({...prev, reason: false}));
            }}>
              <SelectTrigger className={errors.reason ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Creative pass">Creative pass</SelectItem>
                <SelectItem value="Commercial viability">Commercial viability</SelectItem>
                <SelectItem value="Financing not secured">Financing not secured</SelectItem>
                <SelectItem value="Rights / legal issues">Rights / legal issues</SelectItem>
                <SelectItem value="Packaging fell through">Packaging fell through</SelectItem>
                <SelectItem value="Paused (strategic / timing)">Paused (strategic / timing)</SelectItem>
                <SelectItem value="Produced / completed">Produced / completed</SelectItem>
                <SelectItem value="Withdrawn">Withdrawn</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Likely to Revisit */}
          <div className="space-y-3">
            <Label className={`text-base ${errors.revisit ? 'text-destructive' : ''}`}>
              Likely to revisit? *
            </Label>
            <ToggleGroup 
              type="single" 
              value={revisit} 
              onValueChange={(val) => {
                if (val) {
                  setRevisit(val as RevisitStatus);
                  setErrors(prev => ({...prev, revisit: false}));
                }
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="Yes" className="flex-1 data-[state=on]:bg-green-500/10 data-[state=on]:text-green-600 data-[state=on]:border-green-500/20 border border-transparent">Yes</ToggleGroupItem>
              <ToggleGroupItem value="Maybe" className="flex-1 data-[state=on]:bg-blue-500/10 data-[state=on]:text-blue-600 data-[state=on]:border-blue-500/20 border border-transparent">Maybe</ToggleGroupItem>
              <ToggleGroupItem value="No" className="flex-1 data-[state=on]:bg-secondary data-[state=on]:text-foreground border border-transparent">No</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Star Option */}
          <div className="flex items-center space-x-2 bg-yellow-500/10 p-3 rounded-md border border-yellow-500/20">
            <Checkbox 
              id="starred" 
              checked={starred}
              onCheckedChange={(checked) => setStarred(checked as boolean)}
            />
            <Label htmlFor="starred" className="cursor-pointer flex-1 flex items-center gap-2 text-yellow-600 dark:text-yellow-400 font-medium">
              <Star className="h-4 w-4 fill-current" />
              Star this project
            </Label>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input 
              id="notes" 
              placeholder="Add context (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleArchive} disabled={archiveProject.isPending}>Archive Project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
