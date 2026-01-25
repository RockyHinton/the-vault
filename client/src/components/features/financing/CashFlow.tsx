import { useState, useMemo } from "react";
import { 
  Project, 
  useStore, 
  FinanceSource, 
  Department, 
  OneOffPayment,
  SpendWindow 
} from "@/lib/store";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  DollarSign, 
  TrendingUp, 
  AlertCircle,
  Calendar as CalendarIcon,
  ArrowRight,
  TrendingDown,
  Info
} from "lucide-react";
import { 
  format, 
  addMonths, 
  differenceInMonths, 
  startOfMonth, 
  parseISO, 
  isValid, 
  isWithinInterval, 
  eachMonthOfInterval,
  endOfMonth,
  addWeeks,
  eachWeekOfInterval,
  startOfWeek,
  endOfWeek
} from "date-fns";
import { nanoid } from 'nanoid';
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface CashFlowProps {
  project: Project;
}

// Helper to safely parse dates
const safeDate = (dateStr?: string) => {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  return isValid(d) ? d : new Date();
};

const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#a4de6c', '#d0ed57'];

export default function CashFlow({ project }: CashFlowProps) {
  const { updateProject } = useStore();
  
  // -- Local State Setup --
  // We initialize local state from project.cashFlow if it exists, or defaults
  // We will persist changes back to project.cashFlow
  
  const cashFlowState = project.cashFlow || {
    timeframe: 'monthly',
    openingBalance: 0,
    departmentTimings: {},
    oneOffPayments: [],
    sourceAdjustments: {}
  };

  // Helper to update cash flow state
  const updateCashFlow = (updates: Partial<typeof cashFlowState>) => {
    updateProject(project.id, {
      cashFlow: {
        ...cashFlowState,
        ...updates
      }
    });
  };

  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({});
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [pieView, setPieView] = useState<'total' | 'outflow'>('total');
  
  // Payment Modal State
  const [newPayment, setNewPayment] = useState<Partial<OneOffPayment>>({
    name: '',
    amount: 0,
    direction: 'outflow',
    departmentId: '',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  // -- Data Extraction (Read-Only) --
  
  // 1. Locked Budget Departments
  // Find the last locked budget or just use the draft if no locked (for design mode flexibility)
  // Logic: project.budgetState?.budgetLockedHistory (take last) OR project.budgetState?.budgetDraft
  const lockedBudget = project.budgetState?.budgetLockedHistory?.[0] || project.budgetState?.budgetDraft;
  const departments = lockedBudget?.departments || [];
  const totalBudget = lockedBudget?.departments.reduce((sum, d) => sum + d.lineItems.reduce((s, i) => s + i.amount, 0), 0) || project.financing?.totalBudget || 0;
  const currency = project.financing?.currency || 'USD';

  // 2. Approved Funding Sources
  const approvedSources = (project.financePlan?.sources || []).filter(s => s.isApproved);
  const securedFunding = approvedSources.reduce((sum, s) => sum + s.amount, 0);
  const fundingGap = Math.max(0, totalBudget - securedFunding);

  // -- Calculations --

  // 1. Determine Timeline Range
  // Scan all dates (sources, spend windows, one-offs) to find min/max
  const allDates: Date[] = [new Date()];
  
  approvedSources.forEach(s => {
    const adj = cashFlowState.sourceAdjustments[s.id];
    if (adj?.expectedDate) allDates.push(new Date(adj.expectedDate));
    else if (s.expectedDate) allDates.push(new Date(s.expectedDate));
  });

  Object.values(cashFlowState.departmentTimings).forEach(w => {
    if (w.startDate) allDates.push(new Date(w.startDate));
    if (w.endDate) allDates.push(new Date(w.endDate));
  });

  cashFlowState.oneOffPayments.forEach(p => {
    allDates.push(new Date(p.date));
  });

  // Add some padding (e.g. start of this year to end of next year if empty)
  const minTime = allDates.reduce((min, d) => Math.min(min, d.getTime()), Infinity);
  const maxTime = allDates.reduce((max, d) => Math.max(max, d.getTime()), -Infinity);
  
  const minDate = new Date(minTime === Infinity ? Date.now() : minTime);
  const maxDate = new Date(maxTime === -Infinity ? Date.now() : maxTime);
  
  // Snap to start/end of periods
  const startDate = cashFlowState.timeframe === 'monthly' ? startOfMonth(minDate) : startOfWeek(minDate);
  // Add at least 6 months buffer if range is small
  const endDateRaw = addMonths(maxDate, 3);
  const endDate = cashFlowState.timeframe === 'monthly' ? endOfMonth(endDateRaw) : endOfWeek(endDateRaw);

  // Generate Periods
  const periods = useMemo(() => {
    if (cashFlowState.timeframe === 'monthly') {
      return eachMonthOfInterval({ start: startDate, end: endDate }).map(d => ({
        label: format(d, 'MMM yyyy'),
        start: startOfMonth(d),
        end: endOfMonth(d),
        id: format(d, 'yyyy-MM')
      }));
    } else {
      return eachWeekOfInterval({ start: startDate, end: endDate }).map(d => ({
        label: `W${format(d, 'w')} ${format(d, 'MMM')}`,
        start: startOfWeek(d),
        end: endOfWeek(d),
        id: format(d, 'yyyy-MM-dd') // unique week ID
      }));
    }
  }, [startDate, endDate, cashFlowState.timeframe]);

  // Calculate Cash Flow per Period
  const cashFlowData = useMemo(() => {
    let runningBalance = cashFlowState.openingBalance;

    return periods.map(period => {
      let inflow = 0;
      let outflow = 0;

      // A) Inflows from Approved Sources
      approvedSources.forEach(s => {
        const adj = cashFlowState.sourceAdjustments[s.id];
        const dateStr = adj?.expectedDate || s.expectedDate; // "Q4 2024" or ISO
        // If rough date string like "Q4 2024", we might need better parsing, but assuming ISO for now or trying basic parse
        // For prototype, let's assume if it's not valid date, we skip or put in first bucket
        if (dateStr) {
          const d = new Date(dateStr);
          if (isValid(d) && isWithinInterval(d, { start: period.start, end: period.end })) {
            inflow += s.amount;
          }
        }
      });

      // B) One-off Payments
      cashFlowState.oneOffPayments.forEach(p => {
        const d = new Date(p.date);
        if (isValid(d) && isWithinInterval(d, { start: period.start, end: period.end })) {
          if (p.direction === 'inflow') inflow += p.amount;
          else outflow += p.amount;
        }
      });

      // C) Department Spend Windows (Outflows)
      departments.forEach(dept => {
        const window = cashFlowState.departmentTimings[dept.id];
        const deptTotal = dept.lineItems.reduce((s, i) => s + i.amount, 0);
        
        if (window && window.startDate && window.endDate && deptTotal > 0) {
          const wStart = new Date(window.startDate);
          const wEnd = new Date(window.endDate);
          
          // Check overlap
          if (wEnd >= wStart) {
             // Simple distribution: total / number of days in window * days overlap in this period
             // Or simpler for monthly: total / months * overlap
             // Let's go with daily rate for accuracy across weeks/months
             const totalDays = Math.max(1, (wEnd.getTime() - wStart.getTime()) / (1000 * 60 * 60 * 24));
             const dailyRate = deptTotal / totalDays;

             // Calculate overlap days
             const overlapStart = new Date(Math.max(wStart.getTime(), period.start.getTime()));
             const overlapEnd = new Date(Math.min(wEnd.getTime(), period.end.getTime()));
             
             if (overlapStart <= overlapEnd) {
               const days = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24) + 1; // inclusive
               outflow += (dailyRate * days);
             }
          }
        }
      });

      const net = inflow - outflow;
      runningBalance += net;

      return {
        ...period,
        inflow,
        outflow,
        net,
        balance: runningBalance
      };
    });
  }, [periods, approvedSources, cashFlowState, departments]);

  // Metrics
  const lowestBalance = cashFlowData.reduce((min, d) => Math.min(min, d.balance), Infinity);
  const firstShortfall = cashFlowData.find(d => d.balance < 0);

  // -- Handlers --

  const handleUpdateDeptTiming = (deptId: string, field: 'startDate' | 'endDate', val: string) => {
    const current = cashFlowState.departmentTimings[deptId] || { startDate: '', endDate: '' };
    updateCashFlow({
      departmentTimings: {
        ...cashFlowState.departmentTimings,
        [deptId]: { ...current, [field]: val }
      }
    });
  };

  const handleCreatePayment = () => {
    if (!newPayment.name || !newPayment.amount || !newPayment.departmentId || !newPayment.date) return;
    
    const payment: OneOffPayment = {
      id: nanoid(),
      name: newPayment.name!,
      departmentId: newPayment.departmentId!,
      departmentName: departments.find(d => d.id === newPayment.departmentId)?.name || 'Unknown',
      amount: newPayment.amount!,
      date: newPayment.date!,
      direction: newPayment.direction as 'inflow' | 'outflow',
      note: newPayment.note
    };

    updateCashFlow({
      oneOffPayments: [...cashFlowState.oneOffPayments, payment]
    });

    setNewPayment({
      name: '',
      amount: 0,
      direction: 'outflow',
      departmentId: '',
      date: format(new Date(), 'yyyy-MM-dd')
    });
    setIsPaymentModalOpen(false);
  };

  const deletePayment = (id: string) => {
    updateCashFlow({
      oneOffPayments: cashFlowState.oneOffPayments.filter(p => p.id !== id)
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const toggleExpand = (id: string) => {
    setExpandedDepts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const deptDataForPie = useMemo(() => {
    if (pieView === 'total') {
      return departments.map(d => ({
        name: d.name,
        value: d.lineItems.reduce((s, i) => s + i.amount, 0)
      })).filter(d => d.value > 0);
    } else {
      // Outflow view: sum of all calculated outflows for each department in the cashFlowData
      // Wait, cashFlowData is aggregated by period. We need aggregation by department.
      // Let's recalculate simply over the full range.
      return departments.map(d => {
        // 1. Spend Window Outflow
        let totalOutflow = 0;
        const window = cashFlowState.departmentTimings[d.id];
        const deptTotal = d.lineItems.reduce((s, i) => s + i.amount, 0);
        
        if (window && window.startDate && window.endDate && deptTotal > 0) {
           const wStart = new Date(window.startDate);
           const wEnd = new Date(window.endDate);
           if (wEnd >= wStart) {
             // For simplicity in "Projected Spend" pie, we assume if a window is set, 
             // the full amount is projected to be spent, UNLESS the window falls outside our calculated timeline?
             // Actually, "Projected Spend" usually implies "Total Cash Required". 
             // If a window is set, the cash will go out. 
             // Let's just use the full department total if a window is set.
             // But wait, the user wants "on the same timescales". 
             // If we just show total, it's same as 'total' view. 
             // Ah, maybe they mean "Amount Spent in the Visible Timeline"? 
             // Let's calculate the overlap of the window with [startDate, endDate] of the graph.
             
             // Graph range:
             // startDate, endDate from calculations above.
             
             const overlapStart = new Date(Math.max(wStart.getTime(), startDate.getTime()));
             const overlapEnd = new Date(Math.min(wEnd.getTime(), endDate.getTime()));
             
             if (overlapStart <= overlapEnd) {
                const totalWindowDays = Math.max(1, (wEnd.getTime() - wStart.getTime()) / (1000 * 60 * 60 * 24));
                const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24);
                const ratio = Math.min(1, Math.max(0, overlapDays / totalWindowDays));
                totalOutflow += deptTotal * ratio;
             }
           }
        }
        
        // 2. One-off Payments Outflow (in range)
        cashFlowState.oneOffPayments
          .filter(p => p.departmentId === d.id && p.direction === 'outflow')
          .forEach(p => {
             const dDate = new Date(p.date);
             if (isValid(dDate) && isWithinInterval(dDate, { start: startDate, end: endDate })) {
               totalOutflow += p.amount;
             }
          });

        return {
          name: d.name,
          value: totalOutflow
        };
      }).filter(d => d.value > 0);
    }
  }, [departments, cashFlowState, pieView, startDate, endDate]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* 1) TOP SUMMARY STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-card/50 border-border/50 col-span-2 md:col-span-2 lg:col-span-1 h-28 flex flex-col justify-center">
           <CardContent className="p-4">
             <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Budget</p>
             <div className="text-xl font-bold font-mono mt-1">{formatCurrency(totalBudget)}</div>
           </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50 col-span-2 md:col-span-2 lg:col-span-1 h-28 flex flex-col justify-center">
           <CardContent className="p-4">
             <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Secured Funding</p>
             <div className="text-xl font-bold font-mono mt-1 text-green-500">{formatCurrency(securedFunding)}</div>
           </CardContent>
        </Card>
         <Card className="bg-card/50 border-border/50 col-span-2 md:col-span-2 lg:col-span-1 h-28 flex flex-col justify-center">
           <CardContent className="p-4">
             <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Funding Gap</p>
             <div className="text-xl font-bold font-mono mt-1 text-amber-500">{formatCurrency(fundingGap)}</div>
           </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50 col-span-2 md:col-span-2 lg:col-span-1 h-28 flex flex-col justify-center">
           <CardContent className="p-4">
             <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Opening Balance</p>
             <FormattedNumberInput 
                value={cashFlowState.openingBalance}
                onChange={(val) => updateCashFlow({ openingBalance: val })}
                className="mt-1 h-8 font-mono text-lg font-bold bg-transparent border-transparent hover:border-input focus:border-primary px-0 w-full"
             />
           </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50 col-span-2 md:col-span-2 lg:col-span-1 h-28 flex flex-col justify-center">
           <CardContent className="p-4">
             <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Low Point</p>
             <div className={cn("text-xl font-bold font-mono mt-1", lowestBalance < 0 ? "text-destructive" : "text-foreground")}>
               {formatCurrency(lowestBalance)}
             </div>
           </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50 col-span-2 md:col-span-2 lg:col-span-1 h-28 flex flex-col justify-center">
           <CardContent className="p-4">
             <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shortfall</p>
             <div className="text-sm font-medium mt-2 flex items-center gap-1">
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
           </CardContent>
        </Card>
      </div>

      {/* MAIN GRID LAYOUT */}
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-220px)] min-h-[600px]">
        
        {/* LEFT COLUMN: Controls & Inputs */}
        <div className="col-span-12 lg:col-span-4 space-y-6 flex flex-col h-full">
          
          {/* Top Control Bar */}
          <div className="flex items-center justify-between h-10 shrink-0">
            <h3 className="text-lg font-semibold">Cash Management</h3>
            <div className="flex bg-muted rounded-md p-1">
              <button 
                className={cn("px-3 py-1 text-xs font-medium rounded-sm transition-all", cashFlowState.timeframe === 'monthly' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                onClick={() => updateCashFlow({ timeframe: 'monthly' })}
              >
                Monthly
              </button>
              <button 
                className={cn("px-3 py-1 text-xs font-medium rounded-sm transition-all", cashFlowState.timeframe === 'weekly' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                onClick={() => updateCashFlow({ timeframe: 'weekly' })}
              >
                Weekly
              </button>
            </div>
          </div>

          {/* Department Timing List - Takes remaining height but splits with inflows */}
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="pb-3 shrink-0">
              <CardTitle className="text-base">Department Timing</CardTitle>
              <CardDescription>Set spend windows for each department.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto pr-2 space-y-2">
              {departments.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4 italic bg-muted/20 rounded">
                  Lock a budget to manage department cash flow.
                </div>
              ) : (
                departments.map(dept => {
                  const deptTotal = dept.lineItems.reduce((s, i) => s + i.amount, 0);
                  const timing = cashFlowState.departmentTimings[dept.id];
                  const payments = cashFlowState.oneOffPayments.filter(p => p.departmentId === dept.id);
                  const isExpanded = expandedDepts[dept.id];

                  return (
                    <div key={dept.id} className="border rounded-md bg-card overflow-hidden">
                      <div 
                        className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleExpand(dept.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-sm">{dept.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                             <span>{formatCurrency(deptTotal)}</span>
                             {timing?.startDate && (
                               <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 font-normal">
                                 Set
                               </Badge>
                             )}
                             {payments.length > 0 && (
                               <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0 font-normal">
                                 {payments.length} payments
                               </Badge>
                             )}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-2">
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </Button>
                      </div>
                      
                      {isExpanded && (
                        <div className="p-3 bg-muted/10 border-t space-y-4 text-sm animate-in slide-in-from-top-1">
                          {/* Timing Inputs */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Start</Label>
                              <Input 
                                type="date" 
                                className="h-7 text-xs"
                                value={timing?.startDate || ''}
                                onChange={(e) => handleUpdateDeptTiming(dept.id, 'startDate', e.target.value)}
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground font-semibold">End</Label>
                              <Input 
                                type="date" 
                                className="h-7 text-xs"
                                value={timing?.endDate || ''}
                                onChange={(e) => handleUpdateDeptTiming(dept.id, 'endDate', e.target.value)}
                              />
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground flex items-start gap-1.5 leading-tight">
                            <Info className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>Budget spreads evenly across this window.</span>
                          </p>
                          
                          {/* One-off Payments List */}
                          {payments.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-border/50">
                              <Label className="text-[10px] uppercase text-muted-foreground font-semibold">One-off Payments</Label>
                              {payments.map(p => (
                                <div key={p.id} className="flex items-center justify-between bg-background border rounded px-2 py-1.5">
                                  <div>
                                    <div className="font-medium text-xs">{p.name}</div>
                                    <div className="text-[10px] text-muted-foreground">{p.date} • {formatCurrency(p.amount)}</div>
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive" onClick={() => deletePayment(p.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add Payment Button */}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full text-xs h-7"
                            onClick={() => {
                              setNewPayment(prev => ({ ...prev, departmentId: dept.id }));
                              setIsPaymentModalOpen(true);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add Payment
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Inflows Read-only List - Fixed height */}
          <Card className="h-1/3 min-h-[200px] shrink-0 flex flex-col">
            <CardHeader className="pb-3 shrink-0">
               <CardTitle className="text-base">Inflows (Approved)</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-2 pr-2">
               {approvedSources.length === 0 ? (
                 <div className="text-sm text-muted-foreground italic text-center pt-4">No approved sources.</div>
               ) : (
                 approvedSources.map(s => {
                    const adj = cashFlowState.sourceAdjustments[s.id];
                    return (
                      <div key={s.id} className="flex items-center justify-between text-sm p-2 border rounded-md bg-muted/5">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate text-xs">{s.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                             <input 
                               type="date" 
                               className="h-5 w-24 text-[10px] bg-transparent border-b border-dashed border-muted-foreground focus:outline-none focus:border-primary"
                               defaultValue={adj?.expectedDate || s.expectedDate || ''}
                               onBlur={(e) => {
                                  if (e.target.value !== (adj?.expectedDate || s.expectedDate)) {
                                    updateCashFlow({
                                      sourceAdjustments: {
                                        ...cashFlowState.sourceAdjustments,
                                        [s.id]: { expectedDate: e.target.value }
                                      }
                                    });
                                  }
                               }}
                             />
                          </div>
                        </div>
                        <div className="text-right ml-2">
                           <div className="font-mono font-medium text-xs text-green-600">{formatCurrency(s.amount)}</div>
                           <div className="text-[10px] text-muted-foreground">Expected</div>
                        </div>
                      </div>
                    );
                 })
               )}
            </CardContent>
          </Card>

        </div>

        {/* RIGHT COLUMN: Visuals & Table */}
        <div className="col-span-12 lg:col-span-8 space-y-6 flex flex-col h-full">
          
          <div className="grid grid-cols-12 gap-6 h-1/2 min-h-[300px]">
             {/* Chart Section */}
             <Card className="col-span-12 md:col-span-8 h-full flex flex-col">
              <CardHeader className="shrink-0 pb-2">
                <CardTitle>Cash Position</CardTitle>
                <CardDescription>Projected running balance over time.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlowData}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis 
                      dataKey="label" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      minTickGap={30}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => `${val / 1000}k`}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      formatter={(val: number) => formatCurrency(val)}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                    <Area 
                      type="monotone" 
                      dataKey="balance" 
                      stroke="#8884d8" 
                      fillOpacity={1} 
                      fill="url(#colorBalance)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Budget Distribution Chart */}
            <Card className="col-span-12 md:col-span-4 h-full flex flex-col">
               <CardHeader className="pb-2 shrink-0">
                 <div className="flex flex-col gap-2">
                   <CardTitle className="text-base">Distribution</CardTitle>
                   <div className="flex bg-muted rounded-md p-0.5 w-full">
                      <button 
                        className={cn("flex-1 px-2 py-1 text-[10px] font-medium rounded-sm transition-all", pieView === 'total' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                        onClick={() => setPieView('total')}
                      >
                        Budget
                      </button>
                      <button 
                        className={cn("flex-1 px-2 py-1 text-[10px] font-medium rounded-sm transition-all", pieView === 'outflow' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                        onClick={() => setPieView('outflow')}
                      >
                        Cashflow
                      </button>
                   </div>
                 </div>
                 <CardDescription className="text-[10px] h-4 truncate mt-1">
                   {pieView === 'total' ? 'Total budget allocation' : 'Projected spend in range'}
                 </CardDescription>
               </CardHeader>
               <CardContent className="flex-1 min-h-0 relative">
                  <div className="absolute inset-0 pb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deptDataForPie}
                          cx="50%"
                          cy="50%"
                          innerRadius="50%"
                          outerRadius="80%"
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {deptDataForPie.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ fontSize: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
               </CardContent>
            </Card>
          </div>

          {/* Data Table - Takes remaining height */}
          <Card className="flex-1 flex flex-col min-h-0 h-1/2">
            <CardHeader className="flex flex-row items-center justify-between shrink-0 py-3">
              <CardTitle className="text-base">Cash Flow Schedule</CardTitle>
              <Button variant="outline" size="sm" className="h-7 text-xs">Export CSV</Button>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
              <div className="h-full overflow-auto">
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
                    {cashFlowData.map((row) => (
                      <tr key={row.id} className={cn("hover:bg-muted/30 transition-colors", row.balance < 0 ? "bg-red-50/50 dark:bg-red-900/10" : "")}>
                        <td className="px-4 py-2 font-medium text-xs">{row.label}</td>
                        <td className="px-4 py-2 text-right text-green-600 text-xs">{row.inflow > 0 ? formatCurrency(row.inflow) : '-'}</td>
                        <td className="px-4 py-2 text-right text-red-500 text-xs">{row.outflow > 0 ? `(${formatCurrency(row.outflow)})` : '-'}</td>
                        <td className={cn("px-4 py-2 text-right font-medium text-xs", row.net > 0 ? "text-green-600" : row.net < 0 ? "text-red-500" : "")}>
                           {row.net !== 0 ? formatCurrency(Math.abs(row.net)) : '-'} {row.net < 0 ? '(Out)' : ''}
                        </td>
                        <td className={cn("px-4 py-2 text-right font-mono font-bold text-xs", row.balance < 0 ? "text-destructive" : "")}>
                           {formatCurrency(row.balance)}
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

      {/* Payment Modal */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add One-Off Payment</DialogTitle>
            <DialogDescription>Add a specific payment or receipt tied to a department.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Name</Label>
              <Input 
                value={newPayment.name || ''}
                onChange={(e) => setNewPayment(prev => ({ ...prev, name: e.target.value }))}
                className="col-span-3"
                placeholder="e.g. Camera Deposit"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Amount</Label>
              <div className="col-span-3">
                 <FormattedNumberInput
                    value={newPayment.amount || 0}
                    onChange={(val) => setNewPayment(prev => ({ ...prev, amount: val }))}
                 />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Department</Label>
              <Select 
                value={newPayment.departmentId || ''} 
                onValueChange={(val) => setNewPayment(prev => ({ ...prev, departmentId: val }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Date</Label>
              <Input 
                type="date"
                value={newPayment.date || ''}
                onChange={(e) => setNewPayment(prev => ({ ...prev, date: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Type</Label>
              <div className="flex bg-muted rounded-md p-1 col-span-3">
                <button 
                  className={cn("flex-1 px-3 py-1 text-xs font-medium rounded-sm", newPayment.direction === 'outflow' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
                  onClick={() => setNewPayment(prev => ({ ...prev, direction: 'outflow' }))}
                >
                  Outflow (Expense)
                </button>
                <button 
                  className={cn("flex-1 px-3 py-1 text-xs font-medium rounded-sm", newPayment.direction === 'inflow' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
                  onClick={() => setNewPayment(prev => ({ ...prev, direction: 'inflow' }))}
                >
                  Inflow (Revenue)
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>Cancel</Button>
             <Button onClick={handleCreatePayment}>Add Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}