import { useState } from "react";
import type { Project } from "@shared/contracts";
import { QueryState } from "@/components/QueryState";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { 
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronRight,
  ArrowRight,
  AlertTriangle,
  Lock,
  ExternalLink
} from "lucide-react";
import { TaskManager } from "@/components/features/TaskManager";
import { cn } from "@/lib/utils";
import { useTransitionProjectStage } from "@/features/projects/use-projects";
import { usePeople } from "@/features/people/use-people";
import { useLegalRecords } from "@/features/legal/use-legal-records";
import { useFinancingOverview } from "@/features/financing-overview/use-financing-overview";
import {
  formatMoney,
  legalCategoryCompletion,
  productionBlockers,
  summarizeLegalCategory,
  talentReadiness,
  type StageBlocker,
} from "@shared/contracts";

interface DevelopmentViewProps {
  project: Project;
}

export default function DevelopmentView({ project }: DevelopmentViewProps) {
  const creativesQuery = usePeople(project.id, "creative");
  const legalRecordsQuery = useLegalRecords(project.id);
  const overviewQuery = useFinancingOverview(project.id);
  const transition = useTransitionProjectStage();
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [, setLocation] = useLocation();

  // --- 1. DERIVED READINESS LOGIC ---

  // A. FINANCE READINESS: every signal is the server-derived Financing Overview
  // (locked budget, finance plan summary, cash flow projection). No fixtures.
  const overview = overviewQuery.data?.data;
  const budgetLocked = Boolean(overview?.budget?.lockedVersion);
  const financeSummary = overview?.financePlan?.summary;
  const fundingGapLabel =
    financeSummary && overview?.currency ? formatMoney(financeSummary.fundingGap, overview.currency) : undefined;
  const fullyFunded = financeSummary ? financeSummary.fundingGap === "0.00" : false;
  const hasCashflowIssues = Boolean(overview?.cashFlow?.firstShortfallPeriodLabel);

  let financeStatus: 'Ready' | 'At Risk' | 'Incomplete' = 'Incomplete';
  let financeReason = "Budget not locked or funding pending.";

  if (budgetLocked) {
    if (fullyFunded) {
      if (hasCashflowIssues) {
        financeStatus = 'At Risk';
        financeReason = `Cash flow shortfall projected in ${overview?.cashFlow?.firstShortfallPeriodLabel}.`;
      } else {
        financeStatus = 'Ready';
        financeReason = "Budget locked and fully funded.";
      }
    } else {
      financeStatus = 'At Risk';
      financeReason = fundingGapLabel ? `Funding gap of ${fundingGapLabel} remains.` : "No finance plan yet.";
    }
  } else {
    financeStatus = 'Incomplete';
    financeReason = "Budget is not locked yet.";
  }

  // B. TALENT READINESS: the named rule in @shared/contracts (stage-readiness).
  const projectCreatives = creativesQuery.data?.data.items ?? [];
  const { status: talentStatus, reason: talentReason } = talentReadiness(projectCreatives);

  // C. LEGAL READINESS (from the Legal Records domain, same derivation as the overview)
  const legalRecords = legalRecordsQuery.data?.data.items ?? [];
  const categoryCompletion = (category: "chain_of_title" | "investment_agreements" | "cast_agreements") =>
    legalCategoryCompletion(legalRecords, category);
  const overall = summarizeLegalCategory(
    legalRecords.map((record) => ({ documentStatuses: record.documents.map((d) => d.status) })),
  );

  let legalStatus: 'Ready' | 'In Progress' | 'Blocking' = 'Blocking';
  let legalReason = "Key agreements missing.";

  if (overall.total === 0) {
    legalStatus = 'Blocking';
    legalReason = "No documentation entities created.";
  } else if (categoryCompletion('chain_of_title') === 'empty' || categoryCompletion('investment_agreements') === 'empty') {
    legalStatus = 'Blocking';
    legalReason = "Chain of Title or Investment Docs empty.";
  } else if (overall.pending > 0) {
    legalStatus = 'In Progress';
    legalReason = "Some agreements pending approval.";
  } else {
    legalStatus = 'Ready';
    legalReason = "All key documentation ready.";
  }


  // --- 2. BLOCKERS: a preview of the server's stage-readiness rule over the same data ---
  // Greenlight is decided by the stage-transition command, which re-evaluates this
  // rule from authoritative state and refuses while anything blocks.
  const blockers: StageBlocker[] = overview
    ? productionBlockers({ financing: overview, legalRecords, creatives: projectCreatives })
    : [];
  const blockerTags: Record<StageBlocker["area"], string> = {
    evaluation: "Evaluation",
    finance: "Finance",
    legal: "Legal",
    talent: "Talent",
  };
  const blockerLinks: Record<string, string> = {
    BUDGET_NOT_LOCKED: `/project/${project.id}/financing/budget`,
    FUNDING_GAP: `/project/${project.id}/financing/finance-plan`,
    FINANCE_PLAN_MISSING: `/project/${project.id}/financing/finance-plan`,
    CASH_FLOW_SHORTFALL: `/project/${project.id}/financing/cashflow`,
    CHAIN_OF_TITLE_INCOMPLETE: `/project/${project.id}/legal`,
    CAST_AGREEMENTS_PENDING: `/project/${project.id}/legal`,
    TALENT_NOT_CONFIRMED: `/project/${project.id}/creatives`,
  };


  // --- HELPERS ---
  const getStatusColor = (status: string) => {
    switch (status) {
        case 'Ready': return "text-green-500 bg-green-500/10 border-green-500/20";
        case 'Nearly Ready':
        case 'Partial':
        case 'In Progress': return "text-amber-500 bg-amber-500/10 border-amber-500/20";
        case 'At Risk':
        case 'Incomplete':
        case 'Blocking': return "text-destructive bg-destructive/10 border-destructive/20";
        default: return "text-muted-foreground bg-secondary";
    }
  };

  const getStatusIcon = (status: string) => {
      switch (status) {
          case 'Ready': return <CheckCircle2 className="h-4 w-4" />;
          case 'Nearly Ready':
          case 'Partial':
          case 'In Progress': return <AlertTriangle className="h-4 w-4" />;
          default: return <XCircle className="h-4 w-4" />;
      }
  };

  return (
    <QueryState
      queries={[creativesQuery, legalRecordsQuery, overviewQuery]}
      loading="Loading development readiness…"
      error="Development readiness could not be loaded."
    >
    <div className="space-y-6 animate-in fade-in duration-500 w-full px-6 py-8 max-w-[1600px] mx-auto">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Development Overview</h1>
          <p className="text-muted-foreground mt-1">Control room for production readiness.</p>
        </div>
        
        {/* Only show greenlight button if ready */}
        <Button 
            className={cn(
              "font-semibold shadow-lg transition-all duration-300 gap-2",
              blockers.length === 0
                ? "bg-green-600 hover:bg-green-700 text-white shadow-green-500/20" 
                : "opacity-50 cursor-not-allowed"
            )}
            disabled={blockers.length > 0}
            onClick={() => setShowPromoteDialog(true)}
        >
            {blockers.length === 0 ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {blockers.length === 0 ? "Greenlight Production" : `${blockers.length} Blockers Remaining`}
        </Button>
      </div>

      {/* ROW 1: Readiness & Blockers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 1) PRODUCTION READINESS (Left - 2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
             <Card className="h-full border-border/60 shadow-sm">
                <CardHeader className="pb-3 border-b bg-muted/20">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        Production Readiness
                    </CardTitle>
                    <CardDescription>
                        Quick status checks derived from the project workspace.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y">
                        {/* Finance Row */}
                        <div 
                            className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group"
                            onClick={() => setLocation(`/project/${project.id}/financing`)}
                        >
                            <div className="flex items-center gap-4">
                                <div className={cn("p-2 rounded-full", getStatusColor(financeStatus))}>
                                    {getStatusIcon(financeStatus)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <h4 className="font-medium">Finance</h4>
                                        <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 font-normal border-0", getStatusColor(financeStatus))}>
                                            {financeStatus}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{financeReason}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-muted-foreground group-hover:text-primary">
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </div>

                         {/* Talent Row */}
                         <div 
                            className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group"
                            onClick={() => setLocation(`/project/${project.id}/creatives`)}
                        >
                            <div className="flex items-center gap-4">
                                <div className={cn("p-2 rounded-full", getStatusColor(talentStatus))}>
                                    {getStatusIcon(talentStatus)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <h4 className="font-medium">Talent</h4>
                                        <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 font-normal border-0", getStatusColor(talentStatus))}>
                                            {talentStatus}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{talentReason}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-muted-foreground group-hover:text-primary">
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </div>

                         {/* Legal Row */}
                         <div 
                            className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group"
                            onClick={() => setLocation(`/project/${project.id}/legal`)}
                        >
                            <div className="flex items-center gap-4">
                                <div className={cn("p-2 rounded-full", getStatusColor(legalStatus))}>
                                    {getStatusIcon(legalStatus)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <h4 className="font-medium">Legal Documentation</h4>
                                        <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 font-normal border-0", getStatusColor(legalStatus))}>
                                            {legalStatus}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{legalReason}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-muted-foreground group-hover:text-primary">
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
             </Card>
        </div>

        {/* 2) BLOCKERS PANEL (Right - 1 Col) */}
        <div className="lg:col-span-1 space-y-4">
            <Card className="h-full border-border/60 shadow-sm flex flex-col">
                <CardHeader className="pb-3 border-b bg-muted/20">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-5 w-5" />
                        What’s blocking production?
                    </CardTitle>
                    <CardDescription>
                        Key blockers detected from finance, documentation, and setup.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-4 flex-1">
                    {blockers.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
                            <CheckCircle2 className="h-12 w-12 text-green-500 mb-3 opacity-20" />
                            <p className="font-medium text-foreground">No blockers detected</p>
                            <p className="text-sm">Project appears ready to progress.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {blockers.slice(0, 5).map((blocker) => (
                                <div
                                    key={blocker.code}
                                    className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors cursor-pointer flex flex-col gap-2"
                                    onClick={() => setLocation(blockerLinks[blocker.code] ?? `/project/${project.id}`)}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-medium text-destructive-foreground/90 leading-tight">
                                            {blocker.message}
                                        </p>
                                        <ArrowRight className="h-3.5 w-3.5 text-destructive/50 shrink-0 mt-0.5" />
                                    </div>
                                    <Badge variant="outline" className="w-fit text-[10px] h-4 px-1.5 bg-background/50 border-destructive/20 text-destructive">
                                        {blockerTags[blocker.area]}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

      </div>

      {/* ROW 2: TEAM TASKS */}
      <div className="space-y-4">
        <div className="flex items-end justify-between px-1">
            <div>
                 {/* Helper text only if blockers exist */}
                {blockers.length > 0 && (
                     <p className="text-sm text-muted-foreground flex items-center gap-1.5 animate-in slide-in-from-left-2">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                        Suggested next actions: Review funding gap · Upload missing agreements
                     </p>
                )}
            </div>
        </div>
        
        {/* Full Width Task Manager */}
        <div className="h-[500px] shadow-sm">
            <TaskManager projectId={project.id} />
        </div>
        <p className="text-xs text-muted-foreground ml-1">
            Use notes as actions tied to blockers. Tag them so the team can track ownership.
        </p>
      </div>


      {/* Promote Dialog */}
      <AlertDialog open={showPromoteDialog} onOpenChange={setShowPromoteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Greenlight Production</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to move this project to Production? This action will update the project stage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-green-600 hover:bg-green-700"
              onClick={async () => {
                if (!project.version) return;
                try {
                  await transition.mutateAsync({ id: project.id, input: { toStage: "production", version: project.version } });
                  setShowPromoteDialog(false);
                } catch {
                  // useVaultMutation already reported the failure.
                }
              }}
            >
              Confirm Greenlight
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
    </QueryState>
  );
}
