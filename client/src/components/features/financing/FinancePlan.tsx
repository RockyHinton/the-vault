import { useState } from "react";
import { 
  Project, 
  useStore, 
  FinanceSource, 
  FinanceSourceType, 
  FinanceSourceStatus, 
  FinanceDocument
} from "@/lib/store";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  ChevronUp, 
  FileText, 
  AlertCircle,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Calendar as CalendarIcon,
  Upload
} from "lucide-react";
import { format } from "date-fns";
import { nanoid } from 'nanoid';
import { cn } from "@/lib/utils";

interface FinancePlanProps {
  project: Project;
}

const FINANCE_TYPES: FinanceSourceType[] = [
  'Equity',
  'Pre-sale',
  'Distributor MG',
  'Grant',
  'Tax Credit',
  'Loan / Lender',
  'Gap Finance',
  'Other'
];

const STATUS_OPTIONS: FinanceSourceStatus[] = [
  'Targeted',
  'Soft committed',
  'Approved'
];

const DOC_TYPES = [
  'Term sheet',
  'Contract / Agreement',
  'LOI',
  'Grant letter',
  'Tax credit opinion',
  'Bank / lender letter',
  'Other'
];

const DOC_STATUS_OPTIONS = [
  'Reference',
  'Pending approval',
  'Approved'
];

export default function FinancePlan({ project }: FinancePlanProps) {
  const { updateProject } = useStore();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  // New Source Form State
  const [newSource, setNewSource] = useState<Partial<FinanceSource>>({
    name: '',
    amount: 0,
    type: 'Equity',
    status: 'Targeted',
    isApproved: false,
    documents: []
  });

  const sources = project.financePlan?.sources || [];
  const totalBudget = project.financing?.totalBudget || 0; // Read-only from budget tool
  const currency = project.financing?.currency || 'USD';
  
  const approvedSources = sources.filter(s => s.isApproved);
  const securedFunding = approvedSources.reduce((sum, s) => sum + s.amount, 0);
  const fundingGap = Math.max(0, totalBudget - securedFunding);
  const gapPercentage = totalBudget > 0 ? (securedFunding / totalBudget) * 100 : 0;

  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'GBP': '£',
    'EUR': '€'
  };
  const currentSymbol = currencySymbols[currency] || '$';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const toggleExpand = (id: string) => {
    setExpandedSources(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateSource = () => {
    if (!newSource.name || !newSource.amount || !newSource.type || !newSource.status) {
      return;
    }

    const source: FinanceSource = {
      id: nanoid(),
      name: newSource.name,
      amount: Number(newSource.amount),
      type: newSource.type as FinanceSourceType,
      status: newSource.status as FinanceSourceStatus,
      isApproved: newSource.status === 'Approved',
      expectedDate: newSource.expectedDate,
      notes: newSource.notes,
      documents: [],
      isExpanded: false
    };

    const updatedSources = [...sources, source];
    
    // Update project state
    updateProjectSources(updatedSources);
    
    // Reset form and close modal
    setNewSource({
      name: '',
      amount: 0,
      type: 'Equity',
      status: 'Targeted',
      isApproved: false,
      documents: []
    });
    setIsAddModalOpen(false);
  };

  const updateSource = (id: string, updates: Partial<FinanceSource>) => {
    const updatedSources = sources.map(s => {
      if (s.id === id) {
        const updatedSource = { ...s, ...updates };
        // If status changed to Approved, set isApproved
        if (updates.status === 'Approved') {
          updatedSource.isApproved = true;
        } else if (updates.status && updates.status !== 'Approved') {
          updatedSource.isApproved = false;
        }
        return updatedSource;
      }
      return s;
    });
    updateProjectSources(updatedSources);
  };

  const deleteSource = (id: string) => {
    const updatedSources = sources.filter(s => s.id !== id);
    updateProjectSources(updatedSources);
  };

  const updateProjectSources = (updatedSources: FinanceSource[]) => {
    // Update financePlan sources
    const newFinancePlan = {
      sources: updatedSources
    };

    // Calculate new secured funding and breakdown for Financing Overview
    const newApprovedSources = updatedSources.filter(s => s.isApproved);
    const newSecured = newApprovedSources.reduce((sum, s) => sum + s.amount, 0);
    
    // Create breakdown for chart/overview
    const totalSecured = newSecured > 0 ? newSecured : 1; // Prevent div by zero
    const newBreakdown = newApprovedSources.map(s => ({
      category: s.name,
      amount: s.amount,
      percentage: Number(((s.amount / totalSecured) * 100).toFixed(1))
    }));

    updateProject(project.id, {
      financePlan: newFinancePlan,
      financing: {
        ...project.financing!,
        secured: newSecured,
        breakdown: newBreakdown
      }
    });
  };

  // Document Handling (Simulated)
  const addDocument = (sourceId: string) => {
    const newDoc: FinanceDocument = {
      id: nanoid(),
      fileName: 'New_Document.pdf',
      docType: 'Term sheet',
      status: 'Reference',
      uploadedAt: new Date().toISOString()
    };
    
    const source = sources.find(s => s.id === sourceId);
    if (source) {
      updateSource(sourceId, { documents: [...source.documents, newDoc] });
    }
  };

  const updateDocument = (sourceId: string, docId: string, updates: Partial<FinanceDocument>) => {
    const source = sources.find(s => s.id === sourceId);
    if (source) {
      const updatedDocs = source.documents.map(d => d.id === docId ? { ...d, ...updates } : d);
      updateSource(sourceId, { documents: updatedDocs });
    }
  };

  const removeDocument = (sourceId: string, docId: string) => {
    const source = sources.find(s => s.id === sourceId);
    if (source) {
      const updatedDocs = source.documents.filter(d => d.id !== docId);
      updateSource(sourceId, { documents: updatedDocs });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Top Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border/50">
           <CardContent className="p-4 flex items-center justify-between">
             <div>
               <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Budget</p>
               <div className="text-2xl font-bold font-mono mt-1">{formatCurrency(totalBudget)}</div>
             </div>
             <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center p-0 border-primary/20 bg-primary/10 text-primary">
                <DollarSign className="h-4 w-4" />
             </Badge>
           </CardContent>
        </Card>
        
        <Card className="bg-card/50 border-border/50">
           <CardContent className="p-4 flex items-center justify-between">
             <div>
               <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Secured Funding</p>
               <div className="text-2xl font-bold font-mono mt-1 text-green-500">{formatCurrency(securedFunding)}</div>
             </div>
             <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center p-0 border-green-500/20 bg-green-500/10 text-green-500">
                <TrendingUp className="h-4 w-4" />
             </Badge>
           </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
           <CardContent className="p-4 flex items-center justify-between">
             <div>
               <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Funding Gap</p>
               <div className={`text-2xl font-bold font-mono mt-1 ${fundingGap > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                 {formatCurrency(fundingGap)}
               </div>
             </div>
             <Badge variant="outline" className={`h-8 w-8 rounded-full flex items-center justify-center p-0 ${fundingGap > 0 ? 'border-amber-500/20 bg-amber-500/10 text-amber-500' : 'border-muted bg-muted/50'}`}>
                <AlertCircle className="h-4 w-4" />
             </Badge>
           </CardContent>
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Finance Plan</h2>
          <p className="text-sm text-muted-foreground">Manage and track your funding sources.</p>
        </div>
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Add Funding Source
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Funding Source</DialogTitle>
              <DialogDescription>
                Add a new funding source to your finance plan.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name</Label>
                <Input
                  id="name"
                  value={newSource.name}
                  onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                  className="col-span-3"
                  placeholder="e.g. Equity Investor A"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="amount" className="text-right">Amount</Label>
                <div className="col-span-3">
                  <FormattedNumberInput
                    id="amount"
                    value={newSource.amount || 0}
                    onChange={(val) => setNewSource({ ...newSource, amount: val })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="type" className="text-right">Type</Label>
                <Select value={newSource.type} onValueChange={(val) => setNewSource({ ...newSource, type: val as FinanceSourceType })}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCE_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="status" className="text-right">Status</Label>
                <Select value={newSource.status} onValueChange={(val) => setNewSource({ ...newSource, status: val as FinanceSourceStatus })}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(status => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="date" className="text-right">Expected</Label>
                <Input
                  id="date"
                  value={newSource.expectedDate || ''}
                  onChange={(e) => setNewSource({ ...newSource, expectedDate: e.target.value })}
                  className="col-span-3"
                  placeholder="e.g. Q4 2024"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notes" className="text-right">Notes</Label>
                <Textarea
                  id="notes"
                  value={newSource.notes || ''}
                  onChange={(e) => setNewSource({ ...newSource, notes: e.target.value })}
                  className="col-span-3"
                  placeholder="Additional details..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateSource}>Create Source</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Funding Sources List */}
      <div className="space-y-4">
        {sources.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
            <p className="text-muted-foreground">No funding sources added yet.</p>
          </div>
        ) : (
          sources.map(source => (
            <Card key={source.id} className={cn("overflow-hidden transition-all duration-200", expandedSources[source.id] ? "ring-1 ring-primary/20" : "")}>
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleExpand(source.id)}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="p-2 rounded-full bg-primary/10 text-primary">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{source.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs font-normal">{source.type}</Badge>
                      <Badge 
                        variant={source.status === 'Approved' ? 'default' : 'secondary'} 
                        className={cn(
                          "text-xs font-normal",
                          source.status === 'Approved' ? "bg-green-500 hover:bg-green-600 border-transparent" :
                          source.status === 'Soft committed' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                          "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        )}
                      >
                        {source.status}
                      </Badge>
                      {source.documents.length > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                          <FileText className="h-3 w-3" /> {source.documents.length} docs
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 mr-4">
                  <div className="text-right">
                    <div className="font-mono font-bold">{formatCurrency(source.amount)}</div>
                    {source.expectedDate && <div className="text-xs text-muted-foreground">Exp: {source.expectedDate}</div>}
                  </div>
                </div>
                
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  {expandedSources[source.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              {/* Expanded Details */}
              {expandedSources[source.id] && (
                <div className="p-6 border-t bg-muted/10 space-y-6">
                  
                  {/* Source Workspace - Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Source Details</h4>
                      
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label>Name</Label>
                          <Input 
                            value={source.name} 
                            onChange={(e) => updateSource(source.id, { name: e.target.value })}
                            disabled={source.isApproved}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="grid gap-2">
                            <Label>Amount</Label>
                            <FormattedNumberInput
                              value={source.amount} 
                              onChange={(val) => updateSource(source.id, { amount: val })}
                              disabled={source.isApproved}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Type</Label>
                            <Select 
                              value={source.type} 
                              onValueChange={(val) => updateSource(source.id, { type: val as FinanceSourceType })}
                              disabled={source.isApproved}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FINANCE_TYPES.map(type => (
                                  <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Status</Label>
                            {source.isApproved ? (
                              <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted text-muted-foreground text-sm">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                Approved
                              </div>
                            ) : (
                              <Select 
                                value={source.status} 
                                onValueChange={(val) => {
                                  if (val === 'Approved') {
                                    if (confirm('Approve this funding source? Once approved it becomes read-only and contributes to secured funding.')) {
                                      updateSource(source.id, { status: 'Approved' });
                                    }
                                  } else {
                                    updateSource(source.id, { status: val as FinanceSourceStatus });
                                  }
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map(status => (
                                    <SelectItem key={status} value={status}>{status}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <div className="grid gap-2">
                            <Label>Expected Date</Label>
                            <Input 
                              value={source.expectedDate || ''} 
                              onChange={(e) => updateSource(source.id, { expectedDate: e.target.value })}
                              disabled={source.isApproved}
                              placeholder="e.g. Q4 2024"
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>Notes</Label>
                          <Textarea 
                            value={source.notes || ''} 
                            onChange={(e) => updateSource(source.id, { notes: e.target.value })}
                            disabled={source.isApproved}
                            className="h-20"
                          />
                        </div>
                      </div>

                      {!source.isApproved && (
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this funding source?')) {
                              deleteSource(source.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete Source
                        </Button>
                      )}
                    </div>

                    {/* Source Workspace - Documents */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Documents</h4>
                        {!source.isApproved && (
                          <Button variant="outline" size="sm" onClick={() => addDocument(source.id)}>
                            <Upload className="h-3 w-3 mr-2" /> Add Doc
                          </Button>
                        )}
                      </div>
                      
                      <div className="bg-card border rounded-md overflow-hidden">
                        {source.documents.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground text-sm">
                            No documents attached.
                          </div>
                        ) : (
                          <div className="divide-y">
                            {source.documents.map(doc => (
                              <div key={doc.id} className="p-3 text-sm grid gap-2">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium truncate flex-1 mr-2">{doc.fileName}</div>
                                  <div className="text-xs text-muted-foreground">{format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <Select 
                                    value={doc.docType} 
                                    onValueChange={(val: any) => updateDocument(source.id, doc.id, { docType: val })}
                                    disabled={source.isApproved}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {DOC_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  
                                  <Select 
                                    value={doc.status} 
                                    onValueChange={(val: any) => updateDocument(source.id, doc.id, { status: val })}
                                    disabled={source.isApproved}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {DOC_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                {!source.isApproved && (
                                  <div className="flex justify-end">
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-6 text-xs text-destructive hover:text-destructive"
                                      onClick={() => removeDocument(source.id, doc.id)}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

    </div>
  );
}