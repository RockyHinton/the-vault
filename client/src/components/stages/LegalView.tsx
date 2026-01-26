import { useState } from "react";
import { Link } from "wouter";
import { Project, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { 
  Scale, 
  FileText,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LegalViewProps {
  project: Project;
  currentSubcategory?: string;
  subcategoryId?: string;
}

// --- CONFIGURATION ---

const DOC_TYPES = [
  { name: 'Chain of Title', key: 'chain_of_title', route: 'chain-of-title' },
  { name: 'Writer Agreements', key: 'writer_agreements', route: 'writer-agreements' },
  { name: 'Investment Agreements', key: 'investment_agreements', route: 'investment-agreements' },
  { name: 'Co-Production', key: 'co_production', route: 'co-production' },
  { name: 'Producers Agreements', key: 'producers_agreements', route: 'producers-agreements' },
  { name: 'Director Agreements', key: 'director_agreements', route: 'director-agreements' },
  { name: 'Cast Agreements', key: 'cast_agreements', route: 'cast-agreements' },
  { name: 'Banking Docs', key: 'banking_docs', route: 'banking-docs' },
  { name: 'Funding / Tax Credit', key: 'funding_tax_credit', route: 'funding-tax-credit' },
  { name: 'Sales Agency', key: 'sales_agency', route: 'sales-agency' },
  { name: 'CAMA', key: 'cama', route: 'cama' },
];

export default function LegalView({ project, currentSubcategory, subcategoryId }: LegalViewProps) {
  const { getCategorySubcategories } = useStore();
  const [filterStatus, setFilterStatus] = useState<'All' | 'Completed' | 'In Progress' | 'Empty'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Drill-down view
  if (subcategoryId) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
             <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">
               {currentSubcategory}
             </h2>
             <p className="text-muted-foreground mt-1">
               Legal documentation and executed agreements.
             </p>
          </div>
        </div>
        <DocumentLibrary 
           projectId={project.id} 
           categoryId="c9" // Hardcoded for Documentation/Legal category
           subcategoryId={subcategoryId} 
         />
      </div>
    );
  }

  // --- DASHBOARD OVERVIEW ---

  // 1. Compute Metrics per Doc Type
  const docState = project.documentationState || {};
  
  const typeMetrics = DOC_TYPES.map(type => {
    const pageState = docState[type.key] || { entities: [] };
    const entities = pageState.entities || [];
    
    const totalEntities = entities.length;
    
    // Strict approval logic: Has documents AND all are approved/signed
    const approvedEntities = entities.filter(e => 
      e.documents.length > 0 && e.documents.every(d => ['Approved', 'Signed'].includes(d.status))
    ).length;
    
    const pendingEntities = totalEntities - approvedEntities;
    
    // Determine Type Status
    let status: 'Empty' | 'Completed' | 'In Progress' = 'Empty';
    if (totalEntities > 0) {
      if (pendingEntities === 0) status = 'Completed';
      else status = 'In Progress';
    }

    return {
      ...type,
      totalEntities,
      approvedEntities,
      pendingEntities,
      status
    };
  });

  // 2. Summary Stats
  const totalTypes = typeMetrics.length;
  const completedCount = typeMetrics.filter(t => t.status === 'Completed').length;
  const inProgressCount = typeMetrics.filter(t => t.status === 'In Progress').length;
  const emptyCount = typeMetrics.filter(t => t.status === 'Empty').length;

  // 3. Filtering & Sorting
  const filteredMetrics = typeMetrics
    .filter(t => {
      if (filterStatus !== 'All' && t.status !== filterStatus) return false;
      if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      // Sort Order: In Progress -> Empty -> Completed
      const order = { 'In Progress': 0, 'Empty': 1, 'Completed': 2 };
      return order[a.status] - order[b.status];
    });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
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

      {/* Summary Strip */}
      <div className="grid grid-cols-4 gap-4">
         <Card className="bg-card/50 border-border/50">
           <CardContent className="p-4 flex flex-col items-center justify-center text-center">
             <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Types</span>
             <span className="text-2xl font-bold mt-1">{totalTypes}</span>
           </CardContent>
         </Card>
         <Card className="bg-green-500/5 border-green-500/20">
           <CardContent className="p-4 flex flex-col items-center justify-center text-center">
             <span className="text-xs font-medium text-green-600 uppercase tracking-wider">Completed</span>
             <span className="text-2xl font-bold text-green-700 mt-1">{completedCount}</span>
           </CardContent>
         </Card>
         <Card className="bg-amber-500/5 border-amber-500/20">
           <CardContent className="p-4 flex flex-col items-center justify-center text-center">
             <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">In Progress</span>
             <span className="text-2xl font-bold text-amber-700 mt-1">{inProgressCount}</span>
           </CardContent>
         </Card>
         <Card className="bg-card/50 border-border/50">
           <CardContent className="p-4 flex flex-col items-center justify-center text-center">
             <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Empty</span>
             <span className="text-2xl font-bold mt-1">{emptyCount}</span>
           </CardContent>
         </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        {/* Filter Chips */}
        <div className="flex bg-muted rounded-lg p-1">
          {['All', 'Completed', 'In Progress', 'Empty'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status as any)}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                filterStatus === status 
                  ? "bg-background shadow-sm text-foreground" 
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search documentation..." 
            className="pl-9 h-9 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredMetrics.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg bg-muted/10">
            No documentation types match your filters.
          </div>
        ) : (
          filteredMetrics.map(item => (
            <Link key={item.key} href={`/project/${project.id}/legal/${item.route}`}>
              <Card className={cn(
                "h-full cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group relative overflow-hidden",
                item.status === 'Completed' ? "border-green-200 bg-green-50/30 dark:border-green-900/50 dark:bg-green-900/10" : "",
                item.status === 'Empty' ? "opacity-80 bg-muted/20 hover:opacity-100 hover:bg-card" : ""
              )}>
                <CardContent className="p-5 flex flex-col h-full">
                  
                  {/* Header Row */}
                  <div className="flex justify-between items-start mb-4">
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                      item.status === 'Completed' ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" :
                      item.status === 'In Progress' ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {item.status === 'Completed' ? <CheckCircle2 className="h-5 w-5" /> : 
                       item.status === 'In Progress' ? <Clock className="h-5 w-5" /> : 
                       <FileText className="h-5 w-5" />}
                    </div>
                    
                    <Badge variant={
                      item.status === 'Completed' ? 'default' : 
                      item.status === 'In Progress' ? 'secondary' : 'outline'
                    } className={cn(
                      "text-[10px] h-5 px-1.5 font-normal",
                      item.status === 'Completed' ? "bg-green-600 hover:bg-green-700" : 
                      item.status === 'In Progress' ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400" : 
                      "text-muted-foreground"
                    )}>
                      {item.status === 'Empty' ? 'No entities yet' : item.status}
                    </Badge>
                  </div>

                  {/* Title */}
                  <div className="mb-4 flex-1">
                    <h3 className="font-semibold text-base group-hover:text-primary transition-colors line-clamp-2">
                      {item.name}
                    </h3>
                  </div>

                  {/* Stats Footer */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-3 border-t border-border/50">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{item.totalEntities}</span>
                      <span className="text-[10px]">Entities</span>
                    </div>
                    <div className="h-6 w-px bg-border/50" />
                    <div className="flex flex-col">
                      <span className="font-semibold text-green-600">{item.approvedEntities}</span>
                      <span className="text-[10px]">Approved</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-amber-600">{item.pendingEntities}</span>
                      <span className="text-[10px]">Pending</span>
                    </div>
                  </div>

                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

    </div>
  );
}
