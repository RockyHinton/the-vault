import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { Review, ReviewScores } from "@shared/contracts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
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
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  FileText,
  Film,
  MessageSquare,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useCurrentUser } from "@/features/auth/use-current-user";
import {
  useDeleteReview,
  useReviews,
  useSubmitOwnReview,
} from "@/features/evaluation/use-evaluation";
import {
  meanScore,
  recommendationFor,
  recommendationLabels,
} from "@/features/evaluation/labels";

const defaultScores: ReviewScores = {
  script: 5,
  director: 5,
  cast: 5,
  financing: 5,
};

const criteria: {
  key: keyof ReviewScores;
  label: string;
  hint: string;
  icon: typeof FileText;
}[] = [
  {
    key: "script",
    label: "Script Quality",
    hint: "Consider structure, dialogue, pacing, and originality.",
    icon: FileText,
  },
  {
    key: "director",
    label: "Director",
    hint: "Evaluate past work, vision match, and commercial viability.",
    icon: Film,
  },
  {
    key: "cast",
    label: "Cast",
    hint: "Assess star power, role fit, and bankability.",
    icon: User,
  },
  {
    key: "financing",
    label: "Financing",
    hint: "Assess budget feasibility, ROI potential, and funding security.",
    icon: CircleDollarSign,
  },
];

const verdictClass: Record<Review["recommendation"], string> = {
  develop: "bg-green-500",
  consider: "bg-amber-500",
  pass: "bg-red-500",
};

/** Each user scores the project once; resubmitting replaces their own review. */
export default function EvaluationScoringView({ onBack }: { onBack: () => void }) {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const currentUserId = useCurrentUser().data?.data.user.id;
  const reviewsQuery = useReviews(project.id);
  const submit = useSubmitOwnReview();
  const remove = useDeleteReview();

  const reviews = reviewsQuery.data?.data.items ?? [];
  const ownReview = reviews.find((review) => review.author.id === currentUserId);

  const [scores, setScores] = useState<ReviewScores>(defaultScores);
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [reviewToDelete, setReviewToDelete] = useState<Review | null>(null);

  // Seed the form from the saved review whenever the server copy changes.
  useEffect(() => {
    setScores(ownReview?.scores ?? defaultScores);
    setNotes(ownReview?.summaryNotes ?? "");
  }, [ownReview?.id, ownReview?.version]);

  const handleSubmit = () =>
    submit.mutate({
      projectId: project.id,
      input: {
        scores,
        summaryNotes: notes.trim(),
        version: ownReview?.version ?? 0,
      },
    });

  const confirmDelete = async () => {
    if (!reviewToDelete) return;
    try {
      await remove.mutateAsync({
        projectId: project.id,
        reviewId: reviewToDelete.id,
        version: reviewToDelete.version,
      });
    } finally {
      setReviewToDelete(null);
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Overview
        </Button>
        <h2 className="text-2xl font-bold font-display">Evaluation Scoring</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-primary/20 shadow-lg shadow-primary/5">
            <CardHeader>
              <CardTitle>Your Evaluation</CardTitle>
              <CardDescription>
                {ownReview
                  ? "Saving again replaces your earlier review."
                  : "Rate the core pillars of the project."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {criteria.map((criterion, index) => {
                const Icon = criterion.icon;
                return (
                  <div key={criterion.key} className="space-y-4">
                    {index > 0 && <Separator />}
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor={`score-${criterion.key}`}
                        className="flex items-center gap-2 text-base font-semibold"
                      >
                        <Icon className="h-4 w-4 text-primary" /> {criterion.label}
                      </Label>
                      <span className="font-mono font-bold text-xl">
                        {scores[criterion.key]}/10
                      </span>
                    </div>
                    <Slider
                      id={`score-${criterion.key}`}
                      aria-label={criterion.label}
                      value={[scores[criterion.key]]}
                      onValueChange={([value]) =>
                        setScores((current) => ({
                          ...current,
                          [criterion.key]: value,
                        }))
                      }
                      max={10}
                      step={1}
                      className="py-2"
                    />
                    <p className="text-xs text-muted-foreground">{criterion.hint}</p>
                  </div>
                );
              })}

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="review-notes">Summary Notes</Label>
                <Textarea
                  id="review-notes"
                  placeholder="Add your justification and thoughts…"
                  className="min-h-[120px] resize-none"
                  value={notes}
                  maxLength={4000}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Verdict preview:{" "}
                  <span className="font-medium text-foreground">
                    {recommendationLabels[recommendationFor(scores)]}
                  </span>
                </span>
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  disabled={submit.isPending || !notes.trim()}
                >
                  {submit.isPending ? "Saving…" : "Submit Review"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Team Reviews
          </h3>

          <div className="space-y-4">
            {reviewsQuery.isLoading ? (
              <div className="text-muted-foreground">Loading reviews…</div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground">
                No reviews yet. Be the first to rate!
              </div>
            ) : (
              reviews.map((review) => {
                const isExpanded = expanded[review.id] ?? false;
                const canDelete =
                  review.author.id === currentUserId || isStudioAdmin;
                return (
                  <Card
                    key={review.id}
                    data-testid="review-card"
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [review.id]: !isExpanded,
                      }))
                    }
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center font-bold text-xs">
                            {review.author.displayName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-sm">
                              {review.author.displayName}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(review.updatedAt), {
                                addSuffix: true,
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-xl text-primary">
                            {meanScore(review.scores).toFixed(1)}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Avg Score
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px] font-normal bg-secondary/20">
                          Script: {review.scores.script}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-normal bg-secondary/20">
                          Dir: {review.scores.director}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-normal bg-secondary/20">
                          Cast: {review.scores.cast}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-normal bg-secondary/20">
                          Finance: {review.scores.financing}
                        </Badge>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t animate-in fade-in slide-in-from-top-2">
                          <p className="text-sm text-muted-foreground italic whitespace-pre-wrap">
                            "{review.summaryNotes}"
                          </p>
                          <div className="mt-2 flex justify-between items-center">
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Delete review by ${review.author.displayName}`}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 px-2 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setReviewToDelete(review);
                                }}
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            )}
                            <Badge
                              className={cn(
                                "text-[10px] ml-auto",
                                verdictClass[review.recommendation],
                              )}
                            >
                              Verdict: {recommendationLabels[review.recommendation]}
                            </Badge>
                          </div>
                        </div>
                      )}

                      <div className="mt-2 flex justify-center text-muted-foreground">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={reviewToDelete !== null}
        onOpenChange={(open) => !open && setReviewToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Review</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this review? It will be removed for everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
