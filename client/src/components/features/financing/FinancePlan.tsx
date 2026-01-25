import { useState, useRef } from "react";
import { 
  Project, 
  useStore, 
  FinanceSource, 
  FinanceSourceType, 
  FinanceSourceStatus, 
  FinanceDocument
} from "@/lib/store";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Upload,
  AlertTriangle
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
  
  // UI State for interactions
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const [uploadSourceId, setUploadSourceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // --- Document Handling (Real File Upload Mock) ---
  
  const triggerFileUpload = (sourceId: string) => {
    setUploadSourceId(sourceId);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && uploadSourceId) {
      const file = e.target.files[0];
      const newDoc: FinanceDocument = {
        id: nanoid(),
        fileName: file.name,
        docType: 'Term sheet', // Default
        status: 'Reference',
        uploadedAt: new Date().toISOString()
      };
      
      const source = sources.find(s => s.id === uploadSourceId);
      if (source) {
        updateSource(uploadSourceId, { documents: [...source.documents, newDoc] });
      }
      
      // Reset
      setUploadSourceId(null);
      e.target.value = ''; // Allow selecting same file again
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

  // --- Approval Workflow ---

  const initiateApproval = (sourceId: string) => {
    setConfirmApproveId(sourceId);
  };

  const confirmApproval = () => {
    if (confirmApproveId) {
      updateSource(confirmApproveId, { status: 'Approved' });
      setConfirmApproveId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileSelect} 
      />

      {/* Confirmation Dialog for Approval */}
      <Dialog open={!!confirmApproveId} onOpenChange={(open) => !open && setConfirmApproveId(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-500 mb-2">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Confirm Approval</DialogTitle>
            </div>
            <DialogDescription className="py-2">
              Are you sure you want to approve this funding source?
              <br/><br/>
              Once approved, the source will be <strong>locked (read-only)</strong> and its amount will be added to the secured funding total.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmApproveId(null)}>Cancel</Button>
            <Button onClick={confirmApproval} className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Verify & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {/* Collapsed Header - Refined for premium look and less cramped feel */}
              <div 
                className="p-5 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleExpand(source.id)}
              >
                <div className="flex items-center gap-5 flex-1">
                  <div className="p-3 rounded-full bg-primary/10 text-primary shadow-sm">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground tracking-tight">{source.name}</h3>
                    <div className="flex items-center gap-3 mt-1.5">
                      <Badge variant="outline" className="text-xs px-2 py-0.5 font-medium">{source.type}</Badge>
                      <Badge 
                        variant={source.status === 'Approved' ? 'default' : 'secondary'} 
                        className={cn(
                          "text-xs px-2 py-0.5 font-medium",
                          source.status === 'Approved' ? "bg-green-600 hover:bg-green-700 border-transparent shadow-sm" :
                          source.status === 'Soft committed' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                          "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        )}
                      >
                        {source.status}
                      </Badge>
                      {source.documents.length > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5 ml-1 px-2 border-l border-border h-4">
                          <FileText className="h-3.5 w-3.5" /> {source.documents.length} docs
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-8 mr-2">
                  <div className="text-right">
                    <div className="text-xl font-mono font-bold tracking-tight">{formatCurrency(source.amount)}</div>
                    {source.expectedDate && <div className="text-xs font-medium text-muted-foreground mt-0.5">Exp: {source.expectedDate}</div>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground">
                    {expandedSources[source.id] ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              {/* Expanded Details - Reordered: Details Top, Docs Bottom */}
              {expandedSources[source.id] && (
                <div className="p-8 border-t bg-muted/10 flex flex-col gap-8 animate-in slide-in-from-top-2 duration-300">
                  
                  {/* 1) Source Details Section */}
                  <div className="space-y-5">
                    <div className="flex items-center justify-between border-b pb-2">
                       <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                         <DollarSign className="h-4 w-4" /> Source Details
                       </h4>
                       {!source.isApproved && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation(); 
                            if (confirm('Are you sure you want to delete this funding source?')) {
                              deleteSource(source.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete Source
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid gap-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="grid gap-2">
                          <Label>Source Name</Label>
                          <Input 
                            value={source.name} 
                            onChange={(e) => updateSource(source.id, { name: e.target.value })}
                            disabled={source.isApproved}
                            className="bg-background"
                          />
                        </div>
                         <div className="grid gap-2">
                          <Label>Amount</Label>
                          <FormattedNumberInput
                            value={source.amount} 
                            onChange={(val) => updateSource(source.id, { amount: val })}
                            disabled={source.isApproved}
                            className="bg-background"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-6">
                        <div className="grid gap-2">
                          <Label>Type</Label>
                          <Select 
                            value={source.type} 
                            onValueChange={(val) => updateSource(source.id, { type: val as FinanceSourceType })}
                            disabled={source.isApproved}
                          >
                            <SelectTrigger className="bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FINANCE_TYPES.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label>Status</Label>
                          {source.isApproved ? (
                            <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-green-50 text-green-700 border-green-200 text-sm font-medium">
                              <CheckCircle2 className="h-4 w-4" />
                              Approved & Locked
                            </div>
                          ) : (
                            <Select 
                              value={source.status} 
                              onValueChange={(val) => {
                                if (val === 'Approved') {
                                  initiateApproval(source.id);
                                } else {
                                  updateSource(source.id, { status: val as FinanceSourceStatus });
                                }
                              }}
                            >
                              <SelectTrigger className="bg-background">
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
                            className="bg-background"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Notes</Label>
                        <Textarea 
                          value={source.notes || ''} 
                          onChange={(e) => updateSource(source.id, { notes: e.target.value })}
                          disabled={source.isApproved}
                          className="h-20 bg-background resize-none"
                          placeholder="Add details about contact points, conditions, or next steps..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2) Documents Section (Moved Bottom) */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <FileText className="h-4 w-4" /> Supporting Documents
                      </h4>
                      {!source.isApproved && (
                        <Button variant="outline" size="sm" onClick={() => triggerFileUpload(source.id)}>
                          <Upload className="h-3 w-3 mr-2" /> Upload Document
                        </Button>
                      )}
                    </div>
                    
                    <div className="bg-card border rounded-md overflow-hidden shadow-sm">
                      {source.documents.length === 0 ? (
                        <div className="p-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                           <FileText className="h-8 w-8 opacity-20" />
                           <p className="text-sm">No documents attached.</p>
                           {!source.isApproved && (
                             <p className="text-xs text-muted-foreground/60">Upload term sheets, contracts, or letters.</p>
                           )}
                        </div>
                      ) : (
                        <div className="divide-y">
                          {source.documents.map(doc => (
                            <div key={doc.id} className="p-4 text-sm grid gap-3 hover:bg-muted/30 transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 overflow-hidden">
                                   <div className="p-2 bg-primary/10 rounded text-primary">
                                     <FileText className="h-4 w-4" />
                                   </div>
                                   <div>
                                      <div className="font-medium truncate mr-2 text-foreground">{doc.fileName}</div>
                                      <div className="text-xs text-muted-foreground">{format(new Date(doc.uploadedAt), 'MMM d, yyyy')} • {doc.fileSize || '250 KB'}</div>
                                   </div>
                                </div>
                                {!source.isApproved && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 text-xs text-muted-foreground hover:text-destructive"
                                    onClick={() => removeDocument(source.id, doc.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-4 pl-12">
                                <div className="grid gap-1.5">
                                  <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Document Type</Label>
                                  <Select 
                                    value={doc.docType} 
                                    onValueChange={(val: any) => updateDocument(source.id, doc.id, { docType: val })}
                                    disabled={source.isApproved}
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {DOC_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="grid gap-1.5">
                                  <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Status</Label>
                                  <Select 
                                    value={doc.status} 
                                    onValueChange={(val: any) => updateDocument(source.id, doc.id, { status: val })}
                                    disabled={source.isApproved}
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {DOC_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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