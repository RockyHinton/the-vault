import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  formatMoney,
  sumMoney,
  type CashFlow as CashFlowRecord,
  type CashFlowDepartment,
  type CashFlowDirection,
  type CashFlowPayment,
  type CashFlowSource,
} from "@shared/contracts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, ChevronDown, ChevronRight, TrendingUp, AlertCircle, Info, ArrowRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useFinancePlan } from "@/features/finance-plan/use-finance-plan";
import {
  useCashFlow,
  useClearDepartmentWindow,
  useClearSourceTiming,
  useCreateCashFlow,
  useCreatePayment,
  useDeletePayment,
  useSetDepartmentWindow,
  useSetSourceTiming,
  useUpdateCashFlow,
} from "@/features/cash-flow/use-cash-flow";
import { MoneyInput } from "@/components/finance/MoneyInput";

const PIE_COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d", "#a4de6c", "#d0ed57"];

/**
 * Chart geometry only: recharts needs numbers to place points. Every figure a
 * person reads (labels, tooltips, table cells) is the server's exact string.
 */
const plot = (value: string) => Number(value);

/**
 * The project's cash-flow schedule over the finance plan's locked budget
 * version. The server projects every period; this screen authors timing
 * (spend windows, one-off payments, inflow dates), the opening balance and
 * the timeframe, and renders the projection it gets back.
 */
export default function CashFlow() {
  const { project } = useProjectWorkspace();
  const cashFlowQuery = useCashFlow(project.id);
  const planQuery = useFinancePlan(project.id);

  if (cashFlowQuery.isLoading || planQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading cash flow…</p>;
  }
  if (cashFlowQuery.isError || planQuery.isError) {
    return <p className="text-sm text-destructive">The cash flow could not be loaded.</p>;
  }
  const cashFlow = cashFlowQuery.data?.data;
  const plan = planQuery.data?.data;
  if (!cashFlow) return <EmptyState projectId={project.id} hasPlan={Boolean(plan)} />;
  return <CashFlowScreen cashFlow={cashFlow} fundingGap={plan?.summary.fundingGap ?? null} />;
}

function EmptyState({ projectId, hasPlan }: { projectId: string; hasPlan: boolean }) {
  const create = useCreateCashFlow();
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-semibold">Cash Flow</h2>
        <p className="text-sm text-muted-foreground">Schedule the locked budget and approved financing over time.</p>
      </div>
      <Card className="border-dashed">
        <CardContent className="py-12 flex flex-col items-center text-center gap-4">
          {hasPlan ? (
            <>
              <h3 className="text-lg font-semibold">No cash flow yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                The schedule is built on the finance plan's locked budget version and its approved sources. Start it to
                set spend windows and payment dates.
              </p>
              <Button disabled={create.isPending} onClick={() => create.mutate({ projectId })}>
                <Plus className="h-4 w-4 mr-2" /> Start Cash Flow
              </Button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold">Create the finance plan first</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Cash flow needs a finance plan against a locked budget so its inflows and outflows have an exact baseline.
              </p>
              <Link href={`/project/${projectId}/financing/finance-plan`}>
                <Button variant="outline">
                  Go to Finance Plan <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CashFlowScreen({ cashFlow, fundingGap }: { cashFlow: CashFlowRecord; fundingGap: string | null }) {
  const { isStudioAdmin } = useProjectWorkspace();
  const currentUserId = useCurrentUser().data?.data.user.id;
  const projectId = cashFlow.projectId;
  const money = (value: string) => formatMoney(value, cashFlow.currency);
  const projection = cashFlow.projection;

  const update = useUpdateCashFlow();
  const setWindow = useSetDepartmentWindow();
  const clearWindow = useClearDepartmentWindow();
  const createPayment = useCreatePayment();
  const deletePayment = useDeletePayment();
  const setTiming = useSetSourceTiming();
  const clearTiming = useClearSourceTiming();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pieView, setPieView] = useState<"total" | "outflow">("total");
  const [paymentDialog, setPaymentDialog] = useState<{ departmentId: string } | null>(null);

  const totalBudget = sumMoney(cashFlow.departments.map((d) => d.total));
  const secured = sumMoney(cashFlow.sources.map((s) => s.amount));
  const firstShortfall = projection.periods.find((p) => p.id === projection.firstShortfallPeriodId) ?? null;
  const canRemovePayment = (payment: CashFlowPayment) => isStudioAdmin || payment.createdBy.id === currentUserId;

  const pieData = useMemo(() => {
    if (pieView === "total")
      return cashFlow.departments.filter((d) => d.total !== "0.00").map((d) => ({ name: d.name, amount: d.total }));
    return projection.departmentOutflows
      .filter((o) => o.amount !== "0.00")
      .map((o) => ({ name: cashFlow.departments.find((d) => d.id === o.departmentId)?.name ?? "", amount: o.amount }));
  }, [cashFlow.departments, projection.departmentOutflows, pieView]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <SummaryTile label="Total Budget" value={money(totalBudget)} testId="cash-total-budget" caption={`Locked budget v${cashFlow.budgetVersionNumber}`} />
        <SummaryTile label="Secured Funding" value={money(secured)} testId="cash-secured" className="text-green-500" caption="Approved sources" />
        <SummaryTile
          label="Funding Gap"
          value={fundingGap ? money(fundingGap) : "—"}
          testId="cash-gap"
          className={fundingGap && fundingGap !== "0.00" ? "text-amber-500" : "text-muted-foreground"}
          caption="From the finance plan"
        />
        <Card className="bg-card/50 border-border/50 col-span-2 md:col-span-2 lg:col-span-1 h-28 flex flex-col justify-center">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Opening Balance</p>
            <MoneyInput
              aria-label="Opening balance"
              value={cashFlow.openingBalance}
              onCommit={(openingBalance) => update.mutate({ projectId, input: { openingBalance, version: cashFlow.version } })}
              className="mt-1 h-8 text-lg font-bold bg-transparent border-transparent hover:border-input focus:border-primary px-0 w-full"
            />
          </CardContent>
        </Card>
        <SummaryTile
          label="Low Point"
          value={money(projection.lowestBalance)}
          testId="cash-low-point"
          className={projection.lowestBalance.startsWith("-") ? "text-destructive" : "text-foreground"}
          caption={projection.periods.find((p) => p.id === projection.lowestBalancePeriodId)?.label ?? ""}
        />
        <Card className="bg-card/50 border-border/50 col-span-2 md:col-span-2 lg:col-span-1 h-28 flex flex-col justify-center">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shortfall</p>
            <div className="text-sm font-medium mt-2 flex items-center gap-1" data-testid="cash-shortfall">
              {firstShortfall ? (
                <span className="text-destructive flex items-center gap-1 text-xs">
                  <AlertCircle className="h-3 w-3" /> {firstShortfall.label}
                </span>
              ) : (
                <span className="text-green-500 flex items-center gap-1 text-xs">
                  <TrendingUp className="h-3 w-3" /> Cash Positive
                </span>
              )}
            </div>
            {(projection.unscheduledInflow !== "0.00" || projection.unscheduledOutflow !== "0.00") && (
              <p className="text-[10px] text-muted-foreground mt-1 truncate">
                Unscheduled: {money(projection.unscheduledInflow)} in · {money(projection.unscheduledOutflow)} out
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-6 min-h-[600px]">
        <div className="col-span-12 lg:col-span-4 space-y-6 flex flex-col">
          <div className="flex items-center justify-between h-10 shrink-0">
            <h3 className="text-lg font-semibold">Cash Management</h3>
            <div className="flex bg-muted rounded-md p-1" role="group" aria-label="Timeframe">
              {(["monthly", "weekly"] as const).map((timeframe) => (
                <button
                  key={timeframe}
                  type="button"
                  aria-pressed={cashFlow.timeframe === timeframe}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-sm transition-all",
                    cashFlow.timeframe === timeframe ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => {
                    if (cashFlow.timeframe !== timeframe) update.mutate({ projectId, input: { timeframe, version: cashFlow.version } });
                  }}
                >
                  {timeframe === "monthly" ? "Monthly" : "Weekly"}
                </button>
              ))}
            </div>
          </div>

          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="pb-3 shrink-0">
              <CardTitle className="text-base">Department Timing</CardTitle>
              <CardDescription>Set spend windows for each department of locked budget v{cashFlow.budgetVersionNumber}.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto pr-2 space-y-2 max-h-[520px]">
              {cashFlow.departments.map((department) => (
                <DepartmentRow
                  key={department.id}
                  department={department}
                  money={money}
                  expanded={expanded[department.id] ?? false}
                  onToggle={() => setExpanded((prev) => ({ ...prev, [department.id]: !(prev[department.id] ?? false) }))}
                  onSetWindow={(startDate, endDate) =>
                    setWindow.mutate({
                      projectId,
                      departmentId: department.id,
                      input: { startDate, endDate, version: department.window?.version ?? 0 },
                    })
                  }
                  onClearWindow={() =>
                    department.window &&
                    clearWindow.mutate({ projectId, departmentId: department.id, version: department.window.version })
                  }
                  onAddPayment={() => setPaymentDialog({ departmentId: department.id })}
                  canRemovePayment={canRemovePayment}
                  onRemovePayment={(payment) => deletePayment.mutate({ projectId, paymentId: payment.id, version: payment.version })}
                />
              ))}
            </CardContent>
          </Card>

          <Card className="shrink-0 flex flex-col">
            <CardHeader className="pb-3 shrink-0">
              <CardTitle className="text-base">Inflows (Approved)</CardTitle>
              <CardDescription>Approved sources from the finance plan. Adjust when the cash lands.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pr-2 max-h-[260px] overflow-y-auto">
              {cashFlow.sources.length === 0 ? (
                <div className="text-sm text-muted-foreground italic text-center py-4">No approved sources.</div>
              ) : (
                cashFlow.sources.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    money={money}
                    onSetDate={(expectedDate) =>
                      setTiming.mutate({ projectId, sourceId: source.id, input: { expectedDate, version: source.timing?.version ?? 0 } })
                    }
                    onReset={() =>
                      source.timing && clearTiming.mutate({ projectId, sourceId: source.id, version: source.timing.version })
                    }
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-8 space-y-6 flex flex-col">
          <div className="grid grid-cols-12 gap-6 min-h-[300px]">
            <Card className="col-span-12 md:col-span-8 flex flex-col">
              <CardHeader className="shrink-0 pb-2">
                <CardTitle>Cash Position</CardTitle>
                <CardDescription>Projected running balance over time.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-[240px] pt-2">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={projection.periods.map((p) => ({ ...p, balance: plot(p.closingBalance) }))}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val: number) => `${Math.round(val / 1000)}k`} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      formatter={(_value: number, _name: string, item: { payload?: { closingBalance?: string } }) =>
                        item.payload?.closingBalance ? money(item.payload.closingBalance) : ""
                      }
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "12px" }}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="balance" name="Balance" stroke="#8884d8" fillOpacity={1} fill="url(#colorBalance)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="col-span-12 md:col-span-4 flex flex-col">
              <CardHeader className="pb-2 shrink-0">
                <div className="flex flex-col gap-2">
                  <CardTitle className="text-base">Distribution</CardTitle>
                  <div className="flex bg-muted rounded-md p-0.5 w-full">
                    {(["total", "outflow"] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        className={cn(
                          "flex-1 px-2 py-1 text-[10px] font-medium rounded-sm transition-all",
                          pieView === view ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => setPieView(view)}
                      >
                        {view === "total" ? "Budget" : "Cashflow"}
                      </button>
                    ))}
                  </div>
                </div>
                <CardDescription className="text-[10px] h-4 truncate mt-1">
                  {pieView === "total" ? "Locked budget by department" : "Scheduled spend by department"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-[200px] relative">
                {pieData.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center pt-8">Nothing scheduled yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData.map((d) => ({ ...d, value: plot(d.amount) }))} cx="50%" cy="50%" innerRadius="50%" outerRadius="80%" paddingAngle={2} dataKey="value" stroke="none">
                        {pieData.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(_value: number, _name: string, item: { payload?: { amount?: string } }) =>
                          item.payload?.amount ? money(item.payload.amount) : ""
                        }
                        contentStyle={{ fontSize: "12px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex flex-row items-center justify-between shrink-0 py-3">
              <CardTitle className="text-base">Cash Flow Schedule</CardTitle>
              <span className="text-xs text-muted-foreground">
                {projection.periods.length} {cashFlow.timeframe === "monthly" ? "months" : "weeks"}
              </span>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-medium text-xs uppercase sticky top-0 z-10 backdrop-blur-md">
                    <tr>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3 text-right text-green-600">Inflows</th>
                      <th className="px-4 py-3 text-right text-red-600">Outflows</th>
                      <th className="px-4 py-3 text-right">Net Change</th>
                      <th className="px-4 py-3 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {projection.periods.map((row) => (
                      <tr key={row.id} data-testid="cash-period" data-period-id={row.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2 font-medium text-xs">{row.label}</td>
                        <td className="px-4 py-2 text-right text-green-600 text-xs" data-testid="cash-period-inflow">
                          {row.inflow !== "0.00" ? money(row.inflow) : "-"}
                        </td>
                        <td className="px-4 py-2 text-right text-red-500 text-xs" data-testid="cash-period-outflow">
                          {row.outflow !== "0.00" ? `(${money(row.outflow)})` : "-"}
                        </td>
                        <td className={cn("px-4 py-2 text-right font-medium text-xs", row.net.startsWith("-") ? "text-red-500" : row.net !== "0.00" ? "text-green-600" : "")}>
                          {row.net !== "0.00" ? money(row.net) : "-"}
                        </td>
                        <td className={cn("px-4 py-2 text-right font-mono font-bold text-xs", row.closingBalance.startsWith("-") && "text-destructive")} data-testid="cash-period-balance">
                          {money(row.closingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PaymentDialog
        open={paymentDialog !== null}
        departments={cashFlow.departments}
        initialDepartmentId={paymentDialog?.departmentId ?? ""}
        pending={createPayment.isPending}
        onClose={() => setPaymentDialog(null)}
        onSubmit={async (input) => {
          try {
            await createPayment.mutateAsync({ projectId, input });
            setPaymentDialog(null);
          } catch {
            /* the mutation toast reports the failure; keep the dialog open */
          }
        }}
      />
    </div>
  );
}

function SummaryTile({ label, value, caption, className, testId }: { label: string; value: string; caption?: string; className?: string; testId: string }) {
  return (
    <Card className="bg-card/50 border-border/50 col-span-2 md:col-span-2 lg:col-span-1 h-28 flex flex-col justify-center">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={cn("text-xl font-bold font-mono mt-1 truncate", className)} data-testid={testId}>
          {value}
        </div>
        {caption && <p className="text-[10px] text-muted-foreground mt-1 truncate">{caption}</p>}
      </CardContent>
    </Card>
  );
}

function DepartmentRow({
  department,
  money,
  expanded,
  onToggle,
  onSetWindow,
  onClearWindow,
  onAddPayment,
  canRemovePayment,
  onRemovePayment,
}: {
  department: CashFlowDepartment;
  money: (value: string) => string;
  expanded: boolean;
  onToggle: () => void;
  onSetWindow: (startDate: string, endDate: string) => void;
  onClearWindow: () => void;
  onAddPayment: () => void;
  canRemovePayment: (payment: CashFlowPayment) => boolean;
  onRemovePayment: (payment: CashFlowPayment) => void;
}) {
  // Both dates are needed before a window exists; the draft holds the first one until the second arrives.
  const [draft, setDraft] = useState({ startDate: department.window?.startDate ?? "", endDate: department.window?.endDate ?? "" });
  const [seen, setSeen] = useState(department.window);
  if (seen !== department.window) {
    setSeen(department.window);
    setDraft({ startDate: department.window?.startDate ?? "", endDate: department.window?.endDate ?? "" });
  }
  const commit = (next: { startDate: string; endDate: string }) => {
    setDraft(next);
    if (!next.startDate || !next.endDate) return;
    if (next.endDate < next.startDate) return;
    if (next.startDate === department.window?.startDate && next.endDate === department.window?.endDate) return;
    onSetWindow(next.startDate, next.endDate);
  };

  return (
    <div className="border rounded-md bg-card overflow-hidden" data-testid="cash-department" data-department-name={department.name}>
      <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate text-sm">{department.name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            <span>{money(department.total)}</span>
            {department.window && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 font-normal">
                Set
              </Badge>
            )}
            {department.payments.length > 0 && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0 font-normal">
                {department.payments.length} payment{department.payments.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 ml-2" aria-label={`Toggle ${department.name}`}>
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </Button>
      </div>

      {expanded && (
        <div className="p-3 bg-muted/10 border-t space-y-4 text-sm animate-in slide-in-from-top-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Start</Label>
              <Input
                type="date"
                aria-label="Window start"
                className="h-7 text-xs"
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                onBlur={(e) => commit({ ...draft, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground font-semibold">End</Label>
              <Input
                type="date"
                aria-label="Window end"
                className="h-7 text-xs"
                value={draft.endDate}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                onBlur={(e) => commit({ ...draft, endDate: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] text-muted-foreground flex items-start gap-1.5 leading-tight">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>The department total spreads evenly by day across this window.</span>
            </p>
            {department.window && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={onClearWindow}>
                Clear window
              </Button>
            )}
          </div>

          {department.payments.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label className="text-[10px] uppercase text-muted-foreground font-semibold">One-off Payments</Label>
              {department.payments.map((payment) => (
                <div key={payment.id} data-testid="cash-payment" className="flex items-center justify-between bg-background border rounded px-2 py-1.5">
                  <div>
                    <div className="font-medium text-xs">{payment.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {payment.date} • {payment.direction === "inflow" ? "+" : "−"}
                      {money(payment.amount)} • {payment.createdBy.displayName}
                    </div>
                  </div>
                  {canRemovePayment(payment) && (
                    <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive" aria-label={`Remove ${payment.name}`} onClick={() => onRemovePayment(payment)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={onAddPayment}>
            <Plus className="h-3 w-3 mr-1" /> Add Payment
          </Button>
        </div>
      )}
    </div>
  );
}

function SourceRow({
  source,
  money,
  onSetDate,
  onReset,
}: {
  source: CashFlowSource;
  money: (value: string) => string;
  onSetDate: (expectedDate: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm p-2 border rounded-md bg-muted/5" data-testid="cash-source" data-source-name={source.name}>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate text-xs">{source.name}</div>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="date"
            aria-label={`Expected date for ${source.name}`}
            key={`${source.id}-${source.scheduledDate ?? ""}-${source.timing?.version ?? 0}`}
            className="h-5 w-28 text-[10px] bg-transparent border-b border-dashed border-muted-foreground focus:outline-none focus:border-primary"
            defaultValue={source.scheduledDate ?? ""}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== source.scheduledDate) onSetDate(e.target.value);
            }}
          />
          {source.timing && (
            <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1" title={`Plan date ${source.expectedDate ?? "not set"}`} onClick={onReset}>
              <RotateCcw className="h-3 w-3" /> plan date
            </button>
          )}
        </div>
      </div>
      <div className="text-right ml-2">
        <div className="font-mono font-medium text-xs text-green-600">{money(source.amount)}</div>
        <div className="text-[10px] text-muted-foreground">{source.scheduledDate ? "Expected" : "No date"}</div>
      </div>
    </div>
  );
}

function PaymentDialog({
  open,
  departments,
  initialDepartmentId,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  departments: CashFlowDepartment[];
  initialDepartmentId: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { departmentId: string; name: string; amount: string; direction: CashFlowDirection; date: string }) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ name: "", amount: "0.00", direction: "outflow" as CashFlowDirection, departmentId: initialDepartmentId, date: "" });
  const [seenDepartment, setSeenDepartment] = useState(initialDepartmentId);
  if (seenDepartment !== initialDepartmentId) {
    setSeenDepartment(initialDepartmentId);
    setDraft({ name: "", amount: "0.00", direction: "outflow", departmentId: initialDepartmentId, date: "" });
  }
  const valid = draft.name.trim() && draft.amount !== "0.00" && draft.departmentId && draft.date;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add One-Off Payment</DialogTitle>
          <DialogDescription>A specific payment or receipt tied to a department, on a date.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="payment-name" className="text-right">
              Name
            </Label>
            <Input id="payment-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="col-span-3" placeholder="e.g. Camera Deposit" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Amount</Label>
            <div className="col-span-3">
              <MoneyInput aria-label="Payment amount" value={draft.amount} onCommit={(amount) => setDraft((d) => ({ ...d, amount }))} />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Department</Label>
            <Select value={draft.departmentId} onValueChange={(departmentId) => setDraft({ ...draft, departmentId })}>
              <SelectTrigger className="col-span-3" aria-label="Payment department">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="payment-date" className="text-right">
              Date
            </Label>
            <Input id="payment-date" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Type</Label>
            <div className="flex bg-muted rounded-md p-1 col-span-3" role="group" aria-label="Payment type">
              {(["outflow", "inflow"] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  aria-pressed={draft.direction === direction}
                  className={cn("flex-1 px-3 py-1 text-xs font-medium rounded-sm", draft.direction === direction ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
                  onClick={() => setDraft({ ...draft, direction })}
                >
                  {direction === "outflow" ? "Outflow (Expense)" : "Inflow (Receipt)"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || pending} onClick={() => onSubmit({ ...draft, name: draft.name.trim() })}>
            Add Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
