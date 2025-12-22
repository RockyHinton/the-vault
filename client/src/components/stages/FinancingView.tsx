import { useState } from "react";
import { Project, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { FinancingSourcesTable } from "@/components/features/FinancingSourcesTable";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip,
} from "recharts";
import { 
  DollarSign, 
  TrendingUp, 
  PieChart as PieIcon, 
  AlertCircle,
  Table as TableIcon,
  Pencil
} from "lucide-react";

interface FinancingViewProps {
  project: Project;
  currentSubcategory?: string;
  subcategoryId?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function FinancingView({ project, currentSubcategory, subcategoryId }: FinancingViewProps) {
  const { updateFinancing } = useStore();
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

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
  // Use existing financing data, or initialize a default structure if missing
  const finance = project.financing || {
    totalBudget: 0,
    secured: 0,
    currency: 'USD',
    breakdown: [],
    cashflow: [],
    approvals: []
  };

  // We no longer return the empty state div. 
  // Instead we render the dashboard with 0 values so the user can see the structure and edit the budget.

  const gap = finance.totalBudget - finance.secured;
  const gapPercentage = (finance.secured / finance.totalBudget) * 100;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: finance.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleSaveBudget = () => {
    const newBudget = parseFloat(budgetInput.replace(/[^0-9.]/g, ''));
    if (!isNaN(newBudget)) {
      updateFinancing(project.id, { totalBudget: newBudget });
    }
    setIsEditingBudget(false);
  };

  const openBudgetEdit = () => {
    setBudgetInput(finance.totalBudget.toString());
    setIsEditingBudget(true);
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
          Budget tracking and source breakdown.
        </p>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border/50 relative group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold font-mono">{formatCurrency(finance.totalBudget)}</div>
              
              <Dialog open={isEditingBudget} onOpenChange={setIsEditingBudget}>
                <DialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-4 right-4"
                    onClick={openBudgetEdit}
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Total Budget</DialogTitle>
                    <DialogDescription>
                      Update the total estimated budget for this project.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="budget" className="text-right">
                        Amount
                      </Label>
                      <Input
                        id="budget"
                        value={budgetInput}
                        onChange={(e) => setBudgetInput(e.target.value)}
                        className="col-span-3"
                        type="number"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveBudget}>Save Changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            </div>
            <p className="text-xs text-muted-foreground mt-1">Locked</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Secured Funding</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-green-500">{formatCurrency(finance.secured)}</div>
            <Progress value={gapPercentage} className="h-1.5 mt-3 bg-green-900/20" />
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Funding Gap</CardTitle>
            <AlertCircle className={`h-4 w-4 ${gap > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold font-mono ${gap > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              {formatCurrency(gap)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {gap > 0 ? `${(100 - gapPercentage).toFixed(1)}% remaining` : 'Fully Funded'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Budget Breakdown Pie Chart (Left) */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-muted-foreground" />
              Budget Breakdown
            </CardTitle>
            <CardDescription>
              Distribution of secured financing sources.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {finance.breakdown && finance.breakdown.length > 0 && finance.secured > 0 ? (
              <>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={finance.breakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={110}
                        paddingAngle={5}
                        dataKey="amount"
                        stroke="none"
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
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
                  {finance.breakdown.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-muted-foreground truncate flex-1">{item.category}</span>
                      <span className="font-mono font-medium">{item.percentage}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[300px] w-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                <PieIcon className="h-12 w-12 mb-2" />
                <p>No financing sources added yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financing Sources Input Table (Right) */}
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TableIcon className="h-4 w-4 text-muted-foreground" />
              Financing Sources
            </CardTitle>
            <CardDescription>
              Input and track funding entities and amounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <FinancingSourcesTable project={project} />
          </CardContent>
        </Card>

      </div>

    </div>
  );
}
