import { useEffect, useState } from "react";
import { financeTypeSchema, type Evaluation, type FinanceType } from "@shared/contracts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import {
  toSaveEvaluationInput,
  useSaveEvaluation,
} from "@/features/evaluation/use-evaluation";
import { financeTypeLabels } from "@/features/evaluation/labels";

interface EditEvaluationDialogProps {
  projectId: string;
  evaluation: Evaluation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const financeOptions = financeTypeSchema.options;

/** studio_admin edits the evaluation profile; the gates are edited on the overview. */
export function EditEvaluationDialog({
  projectId,
  evaluation,
  open,
  onOpenChange,
}: EditEvaluationDialogProps) {
  const save = useSaveEvaluation();
  const [writer, setWriter] = useState(evaluation.writer ?? "");
  const [director, setDirector] = useState(evaluation.director ?? "");
  const [plannedBudget, setPlannedBudget] = useState(
    evaluation.plannedBudget ?? "",
  );
  const [financeTypes, setFinanceTypes] = useState<FinanceType[]>(
    evaluation.financeTypes,
  );

  // Reset the draft from the server copy each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setWriter(evaluation.writer ?? "");
    setDirector(evaluation.director ?? "");
    setPlannedBudget(evaluation.plannedBudget ?? "");
    setFinanceTypes(evaluation.financeTypes);
  }, [open, evaluation]);

  const toggleFinanceType = (type: FinanceType) =>
    setFinanceTypes((current) =>
      current.includes(type)
        ? current.filter((candidate) => candidate !== type)
        : [...current, type],
    );

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        projectId,
        input: toSaveEvaluationInput(evaluation, {
          writer: writer.trim() || null,
          director: director.trim() || null,
          plannedBudget: plannedBudget.trim() || null,
          financeTypes,
        }),
      });
      onOpenChange(false);
    } catch {
      // The mutation hook already reported the failure; keep the dialog open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Project Details</DialogTitle>
          <DialogDescription>
            Update the core project information and financing structure.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="evaluation-writer">Writer</Label>
            <Input
              id="evaluation-writer"
              value={writer}
              maxLength={200}
              onChange={(event) => setWriter(event.target.value)}
              placeholder="Screenwriter name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="evaluation-director">Director</Label>
            <Input
              id="evaluation-director"
              value={director}
              maxLength={200}
              onChange={(event) => setDirector(event.target.value)}
              placeholder="Director name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="evaluation-budget">Est. Budget</Label>
            <Input
              id="evaluation-budget"
              value={plannedBudget}
              maxLength={80}
              onChange={(event) => setPlannedBudget(event.target.value)}
              placeholder="$5M"
            />
          </div>
          <div className="grid gap-3">
            <Label>Finance Structure</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Finance structure">
              {financeOptions.map((type) => {
                const selected = financeTypes.includes(type);
                return (
                  <Badge
                    key={type}
                    role="checkbox"
                    aria-checked={selected}
                    tabIndex={0}
                    variant={selected ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary/90 transition-colors"
                    onClick={() => toggleFinanceType(type)}
                    onKeyDown={(event) => {
                      if (event.key === " " || event.key === "Enter") {
                        event.preventDefault();
                        toggleFinanceType(type);
                      }
                    }}
                  >
                    {financeTypeLabels[type]}
                    {selected ? (
                      <X className="ml-1 h-3 w-3" />
                    ) : (
                      <Plus className="ml-1 h-3 w-3 opacity-50" />
                    )}
                  </Badge>
                );
              })}
            </div>
            {financeTypes.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No financing source selected yet.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
