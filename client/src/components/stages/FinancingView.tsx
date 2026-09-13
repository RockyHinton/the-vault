import type { DocumentFolder } from "@shared/contracts";
import { useState } from "react";
import { Link } from "wouter";
import { Project, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { FinancingSourcesTable } from "@/components/features/FinancingSourcesTable";
import FinancePlan from "@/components/features/financing/FinancePlan";
import CashFlow from "@/components/features/financing/CashFlow";
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
  Pencil,
  ArrowRight
} from "lucide-react";

interface FinancingViewProps {
  project: Project;
  currentSubcategory?: string;
  subcategoryId?: string;
  folder?: DocumentFolder;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function FinancingView({ project, currentSubcategory, subcategoryId, folder }: FinancingViewProps) {
  const { updateFinancing } = useStore();

  // If we are drilled down into a subcategory (like "Banking Docs"), just show the docs
  if (subcategoryId) {
    if (currentSubcategory === "Finance Plan") {
      return <FinancePlan project={project} />;
    }

    if (currentSubcategory === "Cashflow") {
      return <CashFlow project={project} />;
    }

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
        <DocumentLibrary projectId={project.id} folder={folder} />
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

  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'GBP': '£',
    'EUR': '€'
  };

  const currentSymbol = currencySymbols[finance.currency] || '$';

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

  const handleCurrencyChange = (value: string) => {
    updateFinancing(project.id, { currency: value });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
        <div className="flex items-center gap-2">
           <Label htmlFor="currency-select" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
             Currency:
           </Label>
           <Select value={finance.currency} onValueChange={handleCurrencyChange}>
             <SelectTrigger id="currency-select" className="w-[100px]">
               <SelectValue placeholder="Currency" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="USD">USD ($)</SelectItem>
               <SelectItem value="GBP">GBP (£)</SelectItem>
               <SelectItem value="EUR">EUR (€)</SelectItem>
             </SelectContent>
           </Select>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border/50 relative group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {finance.totalBudget > 0 ? (
              <>
                <div className="text-3xl font-bold font-mono">{formatCurrency(finance.totalBudget)}</div>
                <p className="text-xs text-muted-foreground mt-1">Locked</p>
              </>
            ) : (
              <div className="py-1">
                 <p className="text-sm text-muted-foreground">
                   No budget has been approved yet.
                 </p>
                 <Link href={`/project/${project.id}/financing/budget`} className="text-sm text-primary hover:underline flex items-center gap-1 mt-2">
                   Go to Budget Page <ArrowRight className="h-3 w-3" />
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
