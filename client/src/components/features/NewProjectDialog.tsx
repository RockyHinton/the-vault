import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject } from "@/features/projects/use-projects";
import { toast } from "sonner";

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewProjectDialog({ isOpen, onClose }: NewProjectDialogProps) {
  const createProject = useCreateProject();
  
  const [title, setTitle] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Project title is required");
      return;
    }

    try {
      await createProject.mutateAsync({
        title,
      });

      toast.success("Project created successfully");
    // Optionally set current project or navigate
    
    // Reset form
    setTitle("");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Project could not be created");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Project Evaluation</DialogTitle>
          <DialogDescription>
            Create a server-backed project. Title is saved now; package and finance tooling remain prototype-only.
          </DialogDescription>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!title.trim() || createProject.isPending}>Create Project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
