import { useMemo, useState } from "react";
import { Link } from "wouter";
import { summarizeLegalCategory, type LegalCategoryCompletion } from "@shared/contracts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileText, Search, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useLegalRecords } from "@/features/legal/use-legal-records";
import { legalCategories, legalCategoryConfig } from "@/features/legal/categories";

type Filter = "all" | LegalCategoryCompletion;

const completionLabel: Record<LegalCategoryCompletion, string> = {
  empty: "Empty",
  in_progress: "In Progress",
  completed: "Completed",
};
const filters: Filter[] = ["all", "completed", "in_progress", "empty"];
const sortOrder: Record<LegalCategoryCompletion, number> = { in_progress: 0, empty: 1, completed: 2 };

/** Documentation overview: one card per legal category, derived from the records. */
export default function LegalView() {
  const { project } = useProjectWorkspace();
  const recordsQuery = useLegalRecords(project.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const metrics = useMemo(() => {
    const records = recordsQuery.data?.data.items ?? [];
    return legalCategories.map((category) => {
      const overview = summarizeLegalCategory(
        records
          .filter((record) => record.category === category)
          .map((record) => ({ documentStatuses: record.documents.map((d) => d.status) })),
      );
      return { category, ...legalCategoryConfig[category], ...overview };
    });
  }, [recordsQuery.data]);

  const counts = {
    completed: metrics.filter((m) => m.completion === "completed").length,
    in_progress: metrics.filter((m) => m.completion === "in_progress").length,
    empty: metrics.filter((m) => m.completion === "empty").length,
  };

  const visible = metrics
    .filter((m) => filter === "all" || m.completion === filter)
    .filter((m) => !search || m.label.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortOrder[a.completion] - sortOrder[b.completion]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
          <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center p-0 border-blue-500/20 bg-blue-500/10 text-blue-500">
            <FileText className="h-4 w-4" />
          </Badge>
          Documentation
        </h2>
        <p className="text-muted-foreground mt-1 ml-11">
          Manage and track completion of required project documentation.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Types</span>
            <span className="text-2xl font-bold mt-1">{metrics.length}</span>
          </CardContent>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs font-medium text-green-600 uppercase tracking-wider">Completed</span>
            <span className="text-2xl font-bold text-green-700 mt-1">{counts.completed}</span>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">In Progress</span>
            <span className="text-2xl font-bold text-amber-700 mt-1">{counts.in_progress}</span>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Empty</span>
            <span className="text-2xl font-bold mt-1">{counts.empty}</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex bg-muted rounded-lg p-1" role="group" aria-label="Completion filter">
          {filters.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                filter === value
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
            >
              {value === "all" ? "All" : completionLabel[value]}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search documentation"
            placeholder="Search documentation..."
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {recordsQuery.isError ? (
        <p className="text-sm text-destructive py-8 text-center">Documentation could not be loaded.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg bg-muted/10">
              No documentation types match your filters.
            </div>
          ) : (
            visible.map((item) => (
              <Link key={item.category} href={`/project/${project.id}/legal/${item.route}`}>
                <Card
                  data-testid="legal-category-card"
                  className={cn(
                    "h-full cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group relative overflow-hidden",
                    item.completion === "completed" ? "border-green-600 border-2" : "",
                    item.completion === "empty" ? "opacity-80 bg-muted/20 hover:opacity-100 hover:bg-card" : "",
                  )}
                >
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div
                        className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                          item.completion === "completed"
                            ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
                            : item.completion === "in_progress"
                              ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {item.completion === "completed" ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : item.completion === "in_progress" ? (
                          <Clock className="h-5 w-5" />
                        ) : (
                          <FileText className="h-5 w-5" />
                        )}
                      </div>
                      <Badge
                        variant={item.completion === "completed" ? "default" : item.completion === "in_progress" ? "secondary" : "outline"}
                        className={cn(
                          "text-[10px] h-5 px-1.5 font-normal",
                          item.completion === "completed"
                            ? "bg-green-600 hover:bg-green-700"
                            : item.completion === "in_progress"
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {item.completion === "empty" ? "No entities yet" : completionLabel[item.completion]}
                      </Badge>
                    </div>
                    <div className="mb-4 flex-1">
                      <h3 className="font-semibold text-base group-hover:text-primary transition-colors line-clamp-2">
                        {item.label}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-3 border-t border-border/50">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">{item.total}</span>
                        <span className="text-[10px]">Entities</span>
                      </div>
                      <div className="h-6 w-px bg-border/50" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-green-600">{item.confirmed}</span>
                        <span className="text-[10px]">Approved</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-amber-600">{item.pending}</span>
                        <span className="text-[10px]">Pending</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
