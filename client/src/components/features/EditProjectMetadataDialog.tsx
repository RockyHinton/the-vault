import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUpdateProject } from "@/features/projects/use-projects";
import type { Project } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function EditProjectMetadataDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateProject = useUpdateProject();
  const [title, setTitle] = useState(project.title);
  const [logline, setLogline] = useState(project.logline ?? "");
  const [genre, setGenre] = useState(project.genre ?? "");

  useEffect(() => {
    if (open) {
      setTitle(project.title);
      setLogline(project.logline ?? "");
      setGenre(project.genre ?? "");
    }
  }, [open, project.genre, project.logline, project.title]);

  const save = async () => {
    if (!project.version) return;
    try {
      await updateProject.mutateAsync({
        id: project.id,
        input: { version: project.version, title, logline: logline || null, genre: genre || null },
      });
      toast.success("Project metadata updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Project metadata could not be updated");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project metadata</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="project-title">Title</Label>
            <Input id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-genre">Genre</Label>
            <Input id="project-genre" value={genre} onChange={(event) => setGenre(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-logline">Logline</Label>
            <Textarea id="project-logline" value={logline} onChange={(event) => setLogline(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!title.trim() || updateProject.isPending || !project.version} onClick={save}>
            Save metadata
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}