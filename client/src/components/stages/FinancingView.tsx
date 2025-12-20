import { Project, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import { 
  DollarSign, 
  TrendingUp, 
  PieChart as PieIcon, 
  FileCheck,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

interface FinancingViewProps {
  project: Project;
  currentSubcategory?: string;
  subcategoryId?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function FinancingView({ project, currentSubcategory, subcategoryId }: FinancingViewProps) {
  
  // If we are drilled down into a subcategory (like "Banking Docs"), just show the docs
  if (subcategoryId) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
             <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">
               {currentSubcategory}
             </h2>
             <p className="text-muted-foreground mt-1">
               Financial records and documentation.
             </p>
          </div>
        </div>
        <DocumentLibrary 
           projectId={project.id} 
           categoryId="c3" // Hardcoded for Financing category ID from store mock
           subcategoryId={subcategoryId} 
         />
      </div>
    );
  }

  // Dashboard View
  const finance = project.financing;

  if (!finance) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-70">
        <DollarSign className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground">No Financial Data</h2>
        <p className="text-muted-foreground">This project hasn't been set up with a budget yet.</p>
      </div>
    );
  }

  const gap = finance.totalBudget - finance.secured;
  const gapPercentage = (finance.secured / finance.totalBudget) * 100;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: finance.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div>
        <h2 className="text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
          <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center p-0 border-green-500/20 bg-green-500/10 text-green-500">
            <DollarSign className="h-4 w-4" />
          </Badge>
          Financing Overview
        </h2>
        <p className="text-muted-foreground mt-1 ml-11">
          Budget tracking, cashflow, and approvals.
        </p>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{formatCurrency(finance.totalBudget)}</div>
            <p className="text-xs text-muted-foreground mt-1">Locked</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Secured Funding</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-green-500">{formatCurrency(finance.secured)}</div>
            <Progress value={gapPercentage} className="h-1 mt-2 bg-green-900/20" />
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Funding Gap</CardTitle>
            <AlertCircle className={`h-4 w-4 ${gap > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${gap > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              {formatCurrency(gap)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {gap > 0 ? `${(100 - gapPercentage).toFixed(1)}% remaining` : 'Fully Funded'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {finance.approvals.filter(a => a.status === 'Pending').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Documents awaiting sign-off</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Budget Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-muted-foreground" />
              Budget Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={finance.breakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="amount"
                  >
                    {finance.breakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {finance.breakdown.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-muted-foreground truncate">{item.category}</span>
                  <span className="font-mono ml-auto">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cashflow */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Cashflow Projection (Next 4 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finance.cashflow} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                  <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => `$${value / 1000000}M`} 
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="in" name="Inflow" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="out" name="Outflow" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 bg-green-500 rounded-sm" />
                <span>Inflow (Drawdowns)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 bg-red-500 rounded-sm" />
                <span>Outflow (Expenses)</span>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Approvals List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Approval Tracker</CardTitle>
          <CardDescription>Status of key financial documents.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {finance.approvals.map((approval, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-card/50 hover:bg-card transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    approval.status === 'Approved' ? 'bg-green-500/10 text-green-500' :
                    approval.status === 'Rejected' ? 'bg-red-500/10 text-red-500' :
                    'bg-amber-500/10 text-amber-500'
                  }`}>
                    {approval.status === 'Approved' && <FileCheck className="h-4 w-4" />}
                    {approval.status === 'Pending' && <AlertCircle className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{approval.item}</div>
                    {approval.date && <div className="text-xs text-muted-foreground">Signed: {approval.date}</div>}
                  </div>
                </div>
                <Badge variant={
                  approval.status === 'Approved' ? 'default' :
                  approval.status === 'Rejected' ? 'destructive' :
                  'outline'
                }>
                  {approval.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
