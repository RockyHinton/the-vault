import { useState } from "react";
import { Project, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { 
  ArrowLeft, 
  Star, 
  User, 
  FileText, 
  Film, 
  MessageSquare, 
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Save,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner"; // Assuming sonner is installed or we can use another toast

interface EvaluationScoringViewProps {
  project: Project;
  onBack: () => void;
}

export default function EvaluationScoringView({ project, onBack }: EvaluationScoringViewProps) {
  const { addReview, getProjectReviews, deleteReview, user } = useStore();
  const reviews = getProjectReviews(project.id);

  // Form State
  const [scores, setScores] = useState({
    script: 5,
    director: 5,
    cast: 5,
    financing: 5
  });
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form if user already has a review
  useState(() => {
    const existingReview = reviews.find(r => r.authorId === user?.id);
    if (existingReview) {
      setScores({
        script: existingReview.scriptScore,
        director: existingReview.directorScore,
        cast: existingReview.castScore,
        financing: existingReview.financingScore || 5
      });
      setNotes(existingReview.summaryNotes);
    }
  });

  // Expanded Review State
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});

  const toggleReview = (id: string) => {
    setExpandedReviews(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    // Simulate network delay
    setTimeout(() => {
      addReview({
        projectId: project.id,
        scriptScore: scores.script,
        directorScore: scores.director,
        castScore: scores.cast,
        financingScore: scores.financing,
        recommendation: calculateRecommendation(scores),
        summaryNotes: notes
      });
      setIsSubmitting(false);
      toast.success("Review saved successfully");
      // onBack(); // Stay on page
    }, 600);
  };

  const handleDelete = (reviewId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this review?")) {
      deleteReview(reviewId);
      toast.success("Review deleted");
      // If the deleted review was the current user's, reset form
      const deletedReview = reviews.find(r => r.id === reviewId);
      if (deletedReview && deletedReview.authorId === user?.id) {
        setScores({ script: 5, director: 5, cast: 5, financing: 5 });
        setNotes("");
      }
    }
  };

  const calculateRecommendation = (s: typeof scores): 'Pass' | 'Consider' | 'Develop' => {
    const avg = (s.script + s.director + s.cast + s.financing) / 4;
    if (avg >= 8) return 'Develop';
    if (avg >= 5) return 'Consider';
    return 'Pass';
  };

  const getOverallScore = (r: { scriptScore: number; directorScore: number; castScore: number; financingScore: number }) => {
    return ((r.scriptScore + r.directorScore + r.castScore + (r.financingScore || 0)) / 4).toFixed(1);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
      
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Overview
        </Button>
        <h2 className="text-2xl font-bold font-display">Evaluation Scoring</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Scoring Form */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-primary/20 shadow-lg shadow-primary/5">
            <CardHeader>
              <CardTitle>Your Evaluation</CardTitle>
              <CardDescription>Rate the core pillars of the project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              
              {/* Script Score */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-base font-semibold">
                    <FileText className="h-4 w-4 text-primary" /> Script Quality
                  </Label>
                  <span className="font-mono font-bold text-xl">{scores.script}/10</span>
                </div>
                <Slider 
                  value={[scores.script]} 
                  onValueChange={(v) => setScores(prev => ({ ...prev, script: v[0] }))} 
                  max={10} 
                  step={1} 
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground">Consider structure, dialogue, pacing, and originality.</p>
              </div>

              <Separator />

              {/* Director Score */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-base font-semibold">
                    <Film className="h-4 w-4 text-primary" /> Director
                  </Label>
                  <span className="font-mono font-bold text-xl">{scores.director}/10</span>
                </div>
                <Slider 
                  value={[scores.director]} 
                  onValueChange={(v) => setScores(prev => ({ ...prev, director: v[0] }))} 
                  max={10} 
                  step={1} 
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground">Evaluate past work, vision match, and commercial viability.</p>
              </div>

              <Separator />

              {/* Cast Score */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-base font-semibold">
                    <User className="h-4 w-4 text-primary" /> Cast
                  </Label>
                  <span className="font-mono font-bold text-xl">{scores.cast}/10</span>
                </div>
                <Slider 
                  value={[scores.cast]} 
                  onValueChange={(v) => setScores(prev => ({ ...prev, cast: v[0] }))} 
                  max={10} 
                  step={1} 
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground">Assess star power, role fit, and bankability.</p>
              </div>

              <Separator />

              {/* Financing Score */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-base font-semibold">
                    <CircleDollarSign className="h-4 w-4 text-primary" /> Financing
                  </Label>
                  <span className="font-mono font-bold text-xl">{scores.financing}/10</span>
                </div>
                <Slider 
                  value={[scores.financing]} 
                  onValueChange={(v) => setScores(prev => ({ ...prev, financing: v[0] }))} 
                  max={10} 
                  step={1} 
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground">Assess budget feasibility, ROI potential, and funding security.</p>
              </div>

              <Separator />

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Summary Notes</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Add your justification and thoughts..." 
                  className="min-h-[120px] resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button 
                className="w-full" 
                size="lg" 
                onClick={handleSubmit} 
                disabled={isSubmitting || !notes.trim()}
              >
                {isSubmitting ? "Submitting..." : "Submit Review"}
              </Button>

            </CardContent>
          </Card>
        </div>

        {/* Right: Team Reviews */}
        <div className="lg:col-span-5 space-y-6">
           <h3 className="font-semibold text-lg flex items-center gap-2">
             <MessageSquare className="h-5 w-5 text-primary" />
             Team Reviews
           </h3>

           <div className="space-y-4">
             {reviews.length === 0 ? (
               <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground">
                 No reviews yet. Be the first to rate!
               </div>
             ) : (
               reviews.map((review) => {
                 const isExpanded = expandedReviews[review.id];
                 const overall = getOverallScore(review);
                 
                 return (
                   <Card key={review.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => toggleReview(review.id)}>
                     <CardContent className="p-4">
                       <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-3">
                           <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center font-bold text-xs">
                             {review.authorName.charAt(0)}
                           </div>
                           <div>
                             <div className="font-medium text-sm">{review.authorName}</div>
                             <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(review.timestamp), { addSuffix: true })}</div>
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="font-bold text-xl text-primary">{overall}</div>
                           <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Score</div>
                         </div>
                       </div>

                       {/* Summary of breakdown always visible? Or minimal? Let's show minimal badges */}
                       <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="outline" className="text-[10px] font-normal bg-secondary/20">Script: {review.scriptScore}</Badge>
                          <Badge variant="outline" className="text-[10px] font-normal bg-secondary/20">Dir: {review.directorScore}</Badge>
                          <Badge variant="outline" className="text-[10px] font-normal bg-secondary/20">Cast: {review.castScore}</Badge>
                          <Badge variant="outline" className="text-[10px] font-normal bg-secondary/20">Finance: {review.financingScore}</Badge>
                       </div>

                       {isExpanded && (
                         <div className="mt-4 pt-4 border-t animate-in fade-in slide-in-from-top-2">
                            <p className="text-sm text-muted-foreground italic">"{review.summaryNotes}"</p>
                            <div className="mt-2 flex justify-between items-center">
                               {review.authorId === user?.id && (
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 px-2 text-xs"
                                   onClick={(e) => handleDelete(review.id, e)}
                                 >
                                   <Trash2 className="h-3 w-3 mr-1" /> Delete
                                 </Button>
                               )}
                               <Badge className={cn(
                                 "text-[10px] ml-auto",
                                 review.recommendation === 'Develop' && "bg-green-500",
                                 review.recommendation === 'Consider' && "bg-amber-500",
                                 review.recommendation === 'Pass' && "bg-red-500",
                               )}>
                                 Verdict: {review.recommendation}
                               </Badge>
                            </div>
                         </div>
                       )}
                       
                       <div className="mt-2 flex justify-center text-muted-foreground">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                       </div>

                     </CardContent>
                   </Card>
                 );
               })
             )}
           </div>
        </div>

      </div>
    </div>
  );
}
