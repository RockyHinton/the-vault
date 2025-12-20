import { useStore, ScriptReview } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Users, 
  BarChart3, 
  ThumbsUp, 
  ThumbsDown, 
  AlertTriangle 
} from "lucide-react";

interface ReviewSummaryProps {
  scriptId: string;
}

export default function ReviewSummary({ scriptId }: ReviewSummaryProps) {
  const { getScriptReviews } = useStore();
  const reviews = getScriptReviews(scriptId);

  if (reviews.length === 0) return null;

  // Calculate Averages
  const total = reviews.length;
  const avgCreative = reviews.reduce((acc, r) => acc + r.creativeScore, 0) / total;
  const avgCommercial = reviews.reduce((acc, r) => acc + r.commercialScore, 0) / total;
  const avgBudget = reviews.reduce((acc, r) => acc + r.budgetScore, 0) / total;

  const recommendations = reviews.reduce((acc, r) => {
    acc[r.recommendation] = (acc[r.recommendation] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card className="mb-6 bg-secondary/5 border-secondary">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          
          {/* Review Count */}
          <div className="flex flex-col items-center justify-center p-2">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Reviews</span>
            </div>
            <span className="text-3xl font-display font-bold">{total}</span>
          </div>

          <Separator orientation="vertical" className="hidden md:block h-12" />

          {/* Scores */}
          <div className="col-span-2 grid grid-cols-3 gap-4">
             <div className="space-y-1">
               <div className="flex justify-between text-xs text-muted-foreground">
                 <span>Creative</span>
                 <span className="font-mono text-foreground">{avgCreative.toFixed(1)}</span>
               </div>
               <Progress value={avgCreative * 10} className="h-1.5" />
             </div>
             <div className="space-y-1">
               <div className="flex justify-between text-xs text-muted-foreground">
                 <span>Commercial</span>
                 <span className="font-mono text-foreground">{avgCommercial.toFixed(1)}</span>
               </div>
               <Progress value={avgCommercial * 10} className="h-1.5" />
             </div>
             <div className="space-y-1">
               <div className="flex justify-between text-xs text-muted-foreground">
                 <span>Budget</span>
                 <span className="font-mono text-foreground">{avgBudget.toFixed(1)}</span>
               </div>
               <Progress value={avgBudget * 10} className="h-1.5" />
             </div>
          </div>

           {/* Recommendation Summary */}
           <div className="flex gap-2 justify-end">
             {Object.entries(recommendations).map(([rec, count]) => {
                let color = "bg-secondary";
                let Icon = AlertTriangle;
                if (rec === 'Develop') { color = "bg-green-500/10 text-green-500 hover:bg-green-500/20"; Icon = ThumbsUp; }
                if (rec === 'Consider') { color = "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"; Icon = AlertTriangle; }
                if (rec === 'Pass') { color = "bg-red-500/10 text-red-500 hover:bg-red-500/20"; Icon = ThumbsDown; }

                return (
                  <Badge key={rec} variant="secondary" className={`flex flex-col items-center gap-1 py-1 px-3 h-auto ${color}`}>
                    <span className="text-xs font-bold">{count}</span>
                    <span className="text-[10px] uppercase font-normal">{rec}</span>
                  </Badge>
                )
             })}
           </div>

        </div>
      </CardContent>
    </Card>
  );
}
