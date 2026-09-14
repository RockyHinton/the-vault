import { Link } from "wouter";
import { formatMoney, moneyToCents, type FinancingOverview } from "@shared/contracts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, AlertCircle, ArrowRight, PieChart as PieIcon, Table as TableIcon, Waves } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useFinancingOverview } from "@/features/financing-overview/use-financing-overview";
import { FinancingSourcesTable } from "@/components/features/FinancingSourcesTable";
import { financeSourceTypeLabels } from "@/features/finance-plan/labels";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

/** Whole-number percent of `part` in `whole`, computed in cents; for bars and labels only. */
function percentOf(part: string, whole: string): number {
  const wholeCents = moneyToCents(whole);
  if (wholeCents === BigInt(0)) return 0;
  return Number((moneyToCents(part) * BigInt(1000)) / wholeCents) / 10;
}

/**
 * Financing Overview: a read-only view of the three Finance domains. Every
 * figure is the server's derived overview; nothing here is stored or edited.
 */
export default function FinancingView() {
  const { project } = useProjectWorkspace();
  const overviewQuery = useFinancingOverview(project.id);

  if (overviewQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading financing overview…</p>;
  if (overviewQuery.isError || !overviewQuery.data) return <p className="text-sm text-destructive">The financing overview could not be loaded.</p>;
  const overview: FinancingOverview = overviewQuery.data.data;
  const currency = overview.currency;
  const money = (value: string) => (currency ? formatMoney(value, currency) : value);
  const locked = overview.budget?.lockedVersion ?? null;
  const summary = overview.financePlan?.summary ?? null;
  const approvedSources = overview.financePlan?.sources.filter((s) => s.status === "approved") ?? [];
  const fundedPercent = summary ? Math.min(100, percentOf(summary.approvedTotal, summary.budgetTotal)) : 0;
  const cash = overview.cashFlow;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
            <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center p-0 border-green-500/20 bg-green-500/10 text-green-500">
              <DollarSign className="h-4 w-4" />
            </Badge>
            Financing Overview
          </h2>
          <p className="text-muted-foreground mt-1 ml-11">
            Derived from the locked budget, the finance plan and the cash flow{currency ? ` · ${currency}` : ""}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {locked ? (
              <>
                <div className="text-3xl font-bold font-mono" data-testid="overview-total-budget">
                  {money(locked.total)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Locked v{locked.versionNumber}
                  {locked.lockedBy ? ` by ${locked.lockedBy.displayName}` : ""}
                  {overview.budget?.openVersionStatus ? ` · a ${overview.budget.openVersionStatus === "draft" ? "draft" : "submitted"} revision is open` : ""}
                </p>
              </>
            ) : (
              <div className="py-1">
                <p className="text-sm text-muted-foreground" data-testid="overview-total-budget">
                  {overview.budget ? "The budget has not been locked yet." : "No budget has been started yet."}
                </p>
                <Link href={`/project/${project.id}/financing/budget`} className="text-sm text-primary hover:underline flex items-center gap-1 mt-2">
                  Go to Budget <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Secured Funding</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {summary ? (
              <>
                <div className="text-3xl font-bold font-mono text-green-500" data-testid="overview-secured">
                  {money(summary.approvedTotal)}
                </div>
                <Progress value={fundedPercent} className="h-1.5 mt-3 bg-green-900/20" />
                <p className="text-xs text-muted-foreground mt-2">
                  Soft committed {money(summary.softCommittedTotal)} · targeted {money(summary.targetedTotal)}
                </p>
              </>
            ) : (
              <div className="py-1">
                <p className="text-sm text-muted-foreground" data-testid="overview-secured">
                  No finance plan yet.
                </p>
                <Link href={`/project/${project.id}/financing/finance-plan`} className="text-sm text-primary hover:underline flex items-center gap-1 mt-2">
                  Go to Finance Plan <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {summary && summary.overFinancedBy !== "0.00" ? "Over-financed by" : "Funding Gap"}
            </CardTitle>
            <AlertCircle className={`h-4 w-4 ${summary && summary.fundingGap !== "0.00" ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            {summary ? (
              <>
                <div className={`text-3xl font-bold font-mono ${summary.fundingGap !== "0.00" ? "text-amber-500" : "text-muted-foreground"}`} data-testid="overview-gap">
                  {money(summary.overFinancedBy !== "0.00" ? summary.overFinancedBy : summary.fundingGap)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.fundingGap !== "0.00" ? `${fundedPercent}% secured against locked v${overview.financePlan?.budgetVersionNumber}` : "Fully funded by approved sources"}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-1" data-testid="overview-gap">
                Measured once a finance plan exists.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-muted-foreground" />
              Secured Financing
            </CardTitle>
            <CardDescription>Approved sources by exact amount.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary && approvedSources.length > 0 ? (
              <>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      {/* Chart geometry only; every label and tooltip shows the exact server string. */}
                      <Pie data={approvedSources.map((s) => ({ ...s, value: Number(s.amount) }))} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none">
                        {approvedSources.map((source, index) => (
                          <Cell key={source.id} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(_value: number, _name: string, item: { payload?: { amount?: string } }) => (item.payload?.amount ? money(item.payload.amount) : "")}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
                  {approvedSources.map((source, index) => (
                    <div key={source.id} className="flex items-center gap-2 text-sm">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-muted-foreground truncate flex-1">{source.name}</span>
                      <span className="font-mono font-medium">{percentOf(source.amount, summary.approvedTotal)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[300px] w-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                <PieIcon className="h-12 w-12 mb-2" />
                <p>No approved financing sources yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TableIcon className="h-4 w-4 text-muted-foreground" />
              Financing Sources
            </CardTitle>
            <CardDescription>Every source in the finance plan with its status.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <FinancingSourcesTable projectId={project.id} sources={overview.financePlan?.sources ?? []} summary={summary} money={money} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Waves className="h-4 w-4 text-muted-foreground" />
              Cash Flow
            </CardTitle>
            <CardDescription>Projected from the schedule, {cash ? `${cash.periodCount} ${cash.timeframe === "monthly" ? "months" : "weeks"}` : "once a cash flow exists"}.</CardDescription>
          </div>
          <Link href={`/project/${project.id}/financing/cashflow`}>
            <Button variant="outline" size="sm" className="gap-2">
              Open Cash Flow <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {cash ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Metric label="Opening balance" value={money(cash.openingBalance)} />
              <Metric label="Scheduled inflows" value={money(cash.totalInflow)} className="text-green-500" />
              <Metric label="Scheduled outflows" value={money(cash.totalOutflow)} className="text-red-500" />
              <Metric label="Closing balance" value={money(cash.closingBalance)} className={cash.closingBalance.startsWith("-") ? "text-destructive" : undefined} testId="overview-closing" />
              <Metric label="Low point" value={money(cash.lowestBalance)} caption={cash.lowestBalancePeriodLabel ?? undefined} className={cash.lowestBalance.startsWith("-") ? "text-destructive" : undefined} testId="overview-low-point" />
              <Metric label="First shortfall" value={cash.firstShortfallPeriodLabel ?? "None"} className={cash.firstShortfallPeriodLabel ? "text-destructive" : "text-green-500"} testId="overview-shortfall" />
              <Metric label="Unscheduled inflow" value={money(cash.unscheduledInflow)} caption="Approved money without a date" />
              <Metric label="Unscheduled outflow" value={money(cash.unscheduledOutflow)} caption="Departments without a window" />
              {cash.unassignedItemCount > 0 && (
                <p className="col-span-2 md:col-span-4 text-xs text-amber-600" data-testid="overview-unassigned">
                  {cash.unassignedItemCount} cash-flow {cash.unassignedItemCount === 1 ? "item" : "items"} from a previous budget
                  version {cash.unassignedItemCount === 1 ? "is" : "are"} not in this projection. Open Cash Flow to move or remove{" "}
                  {cash.unassignedItemCount === 1 ? "it" : "them"}.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="overview-shortfall">
              No cash flow has been started yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, caption, className, testId }: { label: string; value: string; caption?: string; className?: string; testId?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className={`text-lg font-bold font-mono mt-1 truncate ${className ?? ""}`} data-testid={testId}>
        {value}
      </div>
      {caption && <p className="text-[10px] text-muted-foreground truncate">{caption}</p>}
    </div>
  );
}
