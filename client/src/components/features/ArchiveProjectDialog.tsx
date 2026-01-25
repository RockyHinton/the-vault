import { useState } from "react";
import { useStore, Project } from "@/lib/store";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Star, Archive } from "lucide-react";

interface ArchiveProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
}

export function ArchiveProjectDialog({ isOpen, onClose, projectId, projectTitle }: ArchiveProjectDialogProps) {
  const { archiveProject } = useStore();
  
  const [reason, setReason] = useState<'Completed' | 'Shelved' | 'Pass'>('Completed');
  const [starred, setStarred] = useState(false);
  const [tags, setTags] = useState("");

  const handleArchive = () => {
    // Parse tags (comma separated)
    const tagList = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    archiveProject(projectId, {
      reason,
      starred,
      tags: tagList
    });
    
    onClose();
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
            You are about to archive "{projectTitle}". Please provide some details for the records.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          
          {/* Reason Selection */}
          <div className="space-y-3">
            <Label className="text-base">Why is this project being archived?</Label>
            <RadioGroup 
              value={reason} 
              onValueChange={(val) => setReason(val as any)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center space-x-2 border p-3 rounded-md hover:bg-secondary/10 transition-colors">
                <RadioGroupItem value="Completed" id="r-completed" />
                <Label htmlFor="r-completed" className="cursor-pointer flex-1">Completed Production</Label>
              </div>
              <div className="flex items-center space-x-2 border p-3 rounded-md hover:bg-secondary/10 transition-colors">
                <RadioGroupItem value="Shelved" id="r-shelved" />
                <Label htmlFor="r-shelved" className="cursor-pointer flex-1">Shelved / On Hold Indefinitely</Label>
              </div>
              <div className="flex items-center space-x-2 border p-3 rounded-md hover:bg-secondary/10 transition-colors">
                <RadioGroupItem value="Pass" id="r-pass" />
                <Label htmlFor="r-pass" className="cursor-pointer flex-1">Pass / Did Not Proceed</Label>
              </div>
            </RadioGroup>
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
              Add to Starred / Highlights
            </Label>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma separated)</Label>
            <Input 
              id="tags" 
              placeholder="e.g. Good Script, Budget Issues, Rights Expired"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleArchive}>Confirm Archive</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
