import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import type { Evaluation, EvaluationGates } from "@shared/contracts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3,
  CheckCircle,
  CheckSquare,
  MessageSquare,
  Pencil,
  Star,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EditEvaluationDialog } from "@/components/features/EditEvaluationDialog";
import DocumentLibrary from "@/pages/DocumentLibrary";
import EvaluationScoringView from "./EvaluationScoringView";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useTransitionProjectStage } from "@/features/projects/use-projects";
import {
  toSaveEvaluationInput,
  useEvaluation,
  useReviews,
  useSaveEvaluation,
} from "@/features/evaluation/use-evaluation";
import { averageScores, financeTypeLabels } from "@/features/evaluation/labels";

const gateLabels: Record<keyof EvaluationGates, string> = {
  scriptApproved: "Script approved",
  budgetApproved: "Budget approved",
  financeApproved: "Finance approved",
  talentAttached: "Talent attached",
};
const gateKeys = Object.keys(gateLabels) as (keyof EvaluationGates)[];

/**
 * The Evaluation stage home: the project's evaluation profile and gates
 * (studio_admin edits), team score averages, and the script folder.
 */
export default function EvaluationView() {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const evaluationQuery = useEvaluation(project.id);
  const reviewsQuery = useReviews(project.id);
  const saveEvaluation = useSaveEvaluation();
  const transition = useTransitionProjectStage();
  const [isScoringMode, setIsScoringMode] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  if (isScoringMode) {
    return <EvaluationScoringView onBack={() => setIsScoringMode(false)} />;
  }
  if (evaluationQuery.isLoading || reviewsQuery.isLoading) {
    return <div className="text-muted-foreground">Loading evaluation…</div>;
  }
  const evaluation: Evaluation | undefined = evaluationQuery.data?.data;
  if (!evaluation || reviewsQuery.isError) {
    return (
      <div className="text-destructive">
        The evaluation could not be loaded. Refresh to try again.
      </div>
    );
  }

  const reviews = reviewsQuery.data?.data.items ?? [];
  const averages = averageScores(reviews);
  const allGatesMet = gateKeys.every((key) => evaluation.gates[key]);

  const toggleGate = (key: keyof EvaluationGates) => {
    if (!isStudioAdmin || saveEvaluation.isPending) return;
    saveEvaluation.mutate({
      projectId: project.id,
      input: toSaveEvaluationInput(evaluation, {
        gates: { [key]: !evaluation.gates[key] },
      }),
    });
  };

  const scoreRows: { label: string; value: number }[] = [
    { label: "Script Quality", value: averages.script },
    { label: "Director", value: averages.director },
    { label: "Cast", value: averages.cast },
    { label: "Financing", value: averages.financing },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-3 bg-secondary/5 border-secondary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Project Evaluation Overview
              </div>
              <div className="flex items-center gap-2">
                {isStudioAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Edit evaluation"
                    onClick={() => setIsEditDialogOpen(true)}
                    className="h-8 w-8 p-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {averages.count > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-background text-foreground font-mono"
                  >
                    {averages.count} {averages.count === 1 ? "Review" : "Reviews"}
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                  Writer
                </dt>
                <dd className="font-medium text-lg text-foreground truncate">
                  {evaluation.writer ?? "Unassigned"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                  Director
                </dt>
                <dd className="font-medium text-lg text-foreground truncate">
                  {evaluation.director ?? "Searching…"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                  Est. Budget
                </dt>
                <dd className="font-medium text-lg text-foreground font-mono">
                  {evaluation.plannedBudget ?? "TBD"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                  Finance
                </dt>
                <dd className="flex flex-wrap gap-1">
                  {evaluation.financeTypes.length > 0 ? (
                    evaluation.financeTypes.map((type) => (
                      <Badge
                        key={type}
                        variant="outline"
                        className="text-[10px] h-5 px-1.5"
                      >
                        {financeTypeLabels[type]}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline">Not set</Badge>
                  )}
                </dd>
              </div>
            </dl>

            {isStudioAdmin && (
              <EditEvaluationDialog
                projectId={project.id}
                evaluation={evaluation}
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
              />
            )}

            <Separator className="my-6" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-6">
              <div className="lg:col-span-8 space-y-5">
                {scoreRows.map((row) => (
                  <div key={row.label} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-bold">{row.value.toFixed(1)}/10</span>
                    </div>
                    <Progress value={row.value * 10} className="h-2" />
                  </div>
                ))}

                <div className="pt-2 flex gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-primary/20 hover:border-primary hover:bg-primary/5 text-primary"
                    onClick={() => setIsScoringMode(true)}
                  >
                    <Star className="h-4 w-4" />
                    Project Scoring
                  </Button>
                  <Link href={`/project/${project.id}/project-notes`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 border-primary/20 hover:border-primary hover:bg-primary/5 text-primary"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Project Notes
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 bg-background/50 rounded-xl border border-border/50">
                <div className="relative flex items-center justify-center h-24 w-24 rounded-full border-4 border-primary/20 mb-2">
                  <span className="text-3xl font-black text-foreground">
                    {averages.overall.toFixed(1)}
                  </span>
                  <div className="absolute inset-0 rounded-full border-t-4 border-primary opacity-50 rotate-45" />
                </div>
                <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">
                  Overall Score
                </span>
                <p className="text-[10px] text-muted-foreground mt-1 text-center">
                  {averages.count === 0
                    ? "No reviews yet"
                    : "Average across all criteria"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5 shadow-lg shadow-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Decision Checklist</CardTitle>
            <CardDescription>
              {isStudioAdmin
                ? "Required for Development"
                : "Set by a studio administrator"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {gateKeys.map((key) => {
                const checked = evaluation.gates[key];
                return (
                  <button
                    key={key}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={gateLabels[key]}
                    disabled={!isStudioAdmin || saveEvaluation.isPending}
                    className="flex items-center gap-3 group w-full text-left disabled:cursor-default"
                    onClick={() => toggleGate(key)}
                  >
                    <div
                      className={cn(
                        "h-5 w-5 rounded border flex items-center justify-center transition-colors",
                        checked
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground group-enabled:group-hover:border-primary",
                      )}
                    >
                      {checked && <CheckSquare className="h-3.5 w-3.5" />}
                    </div>
                    <span
                      className={cn(
                        "text-sm",
                        checked
                          ? "text-foreground font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {gateLabels[key]}
                    </span>
                  </button>
                );
              })}
            </div>

            {isStudioAdmin && (
              <>
                <Separator />
                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                    onClick={() => setShowApproveDialog(true)}
                    disabled={!allGatesMet || Boolean(project.archivedAt)}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve for Dev
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-destructive hover:bg-destructive/10"
                    onClick={() => setShowRejectDialog(true)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject & Archive
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-display font-bold text-foreground">
            Script & Creative Materials
          </h3>
          <span className="text-xs text-muted-foreground">
            Stored in the Script folder
          </span>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <DocumentLibrary projectId={project.id} folder="script" />
        </div>
      </div>

      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve for Development</AlertDialogTitle>
            <AlertDialogDescription>
              Move this project to Development? This will unlock packaging tools
              and allow you to begin the next phase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary/90"
              onClick={async () => {
                try {
                  await transition.mutateAsync({
                    id: project.id,
                    input: { toStage: "development", version: project.version },
                  });
                  setShowApproveDialog(false);
                } catch {
                  // useVaultMutation already reported the failure.
                }
              }}
            >
              Approve Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Project</AlertDialogTitle>
            <AlertDialogDescription>
              Archiving records a reason and a revisit decision. Use the
              project archive action from the Projects list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() =>
                toast.error(
                  "Use the project archive action to record the required archive reason.",
                )
              }
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
