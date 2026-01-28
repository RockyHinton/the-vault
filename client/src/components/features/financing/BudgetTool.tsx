import { useState, useMemo } from "react";
import { Project, useStore, BudgetVersion, Department, LineItem, BudgetDocument } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Upload, 
  FileText, 
  History, 
  Lock, 
  CheckCircle2, 
  AlertCircle,
  MoreHorizontal,
  ArrowRight,
  Pencil
} from "lucide-react";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";

interface BudgetToolProps {
  project: Project;
}

const DEFAULT_DEPARTMENTS = [
  "Above the Line",
  "Production",
  "Post-Production",
  "Other",
  "Contingency"
];

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function BudgetTool({ project }: BudgetToolProps) {
  const { updateBudgetState, updateFinancing, updateBudgetDraft } = useStore();
  const [expandedDepts, setExpandedDepartments] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<BudgetVersion | null>(null);
  const [deptToDelete, setDeptToDelete] = useState<string | null>(null);
  
  // Add Department State
  const [newDeptName, setNewDeptName] = useState("");
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);

  // Upload Doc State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadDeptId, setUploadDeptId] = useState<string | null>(null);
  const [newDocFile, setNewDocFile] = useState("");
  const [newDocType, setNewDocType] = useState("Quote");

  // Ensure initial state exists
  const budgetState = project.budgetState || {
    budgetDraft: null,
    budgetPending: null,
    budgetLockedHistory: []
  };

  // Determine Current View (Draft, Pending, Locked, or History)
  const activeVersion = useMemo(() => {
    if (selectedHistoryVersion) return selectedHistoryVersion;
    if (budgetState.budgetDraft) return budgetState.budgetDraft;
    if (budgetState.budgetPending) return budgetState.budgetPending;
    if (budgetState.budgetLockedHistory.length > 0) return budgetState.budgetLockedHistory[0];
    return null;
  }, [budgetState, selectedHistoryVersion]);

  // Initial Boot: If no draft and no history, create initial draft
  if (!activeVersion && !budgetState.budgetDraft && !budgetState.budgetPending && budgetState.budgetLockedHistory.length === 0) {
    const initialDepartments: Department[] = DEFAULT_DEPARTMENTS.map(name => ({
      id: generateId(),
      name,
      lineItems: [],
      documents: [],
      isExpanded: false
    }));

    const newDraft: BudgetVersion = {
      id: generateId(),
      status: 'draft',
      createdAt: new Date().toISOString(),
      submittedAt: null,
      approvedAt: null,
      createdBy: 'You',
      approvedBy: null,
      currency: project.financing?.currency || 'USD',
      departments: initialDepartments
    };

    // We need to trigger this update. Since we can't do it in render, we assume the store 
    // or parent handles init, BUT for this prototype we'll wrap content in a check or use an effect.
    // However, to avoid "Too many re-renders", we'll just return a "Initialize" button or 
    // do it in a useEffect. For simplicity/speed in mock mode, let's just do it in an effect.
    // Actually, safer pattern: Render a "Start Budget" button if completely empty.
    
    return (
      <div className="flex flex-col items-center justify-center h-[400px] space-y-4 text-center">
        <div className="h-16 w-16 bg-secondary/30 rounded-full flex items-center justify-center">
          <DollarSign className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-xl font-medium">No Budget Started</h3>
          <p className="text-muted-foreground">Create a new budget to start tracking costs.</p>
        </div>
        <Button onClick={() => {
          updateBudgetState(project.id, { budgetDraft: newDraft });
        }}>
          Create Budget Draft
        </Button>
      </div>
    );
  }

  // --- ACTIONS ---

  const handleUpdateDepartment = (deptId: string, updates: Partial<Department>) => {
    if (!activeVersion || activeVersion.status !== 'draft') return;
    const newDepts = activeVersion.departments.map(d => 
      d.id === deptId ? { ...d, ...updates } : d
    );
    updateBudgetDraft(project.id, { departments: newDepts });
  };

  const handleAddLineItem = (deptId: string) => {
    if (!activeVersion || activeVersion.status !== 'draft') return;
    const newItem: LineItem = { id: generateId(), name: "New Item", amount: 0 };
    const newDepts = activeVersion.departments.map(d => 
      d.id === deptId ? { ...d, lineItems: [...d.lineItems, newItem] } : d
    );
    updateBudgetDraft(project.id, { departments: newDepts });
  };

  const handleUpdateLineItem = (deptId: string, itemId: string, updates: Partial<LineItem>) => {
    if (!activeVersion || activeVersion.status !== 'draft') return;
    const newDepts = activeVersion.departments.map(d => {
      if (d.id !== deptId) return d;
      return {
        ...d,
        lineItems: d.lineItems.map(i => i.id === itemId ? { ...i, ...updates } : i)
      };
    });
    updateBudgetDraft(project.id, { departments: newDepts });
  };

  const handleDeleteLineItem = (deptId: string, itemId: string) => {
    if (!activeVersion || activeVersion.status !== 'draft') return;
    const newDepts = activeVersion.departments.map(d => {
      if (d.id !== deptId) return d;
      return { ...d, lineItems: d.lineItems.filter(i => i.id !== itemId) };
    });
    updateBudgetDraft(project.id, { departments: newDepts });
  };

  const handleAddDepartment = () => {
    if (!activeVersion || activeVersion.status !== 'draft' || !newDeptName.trim()) return;
    // Check unique
    if (activeVersion.departments.some(d => d.name.toLowerCase() === newDeptName.toLowerCase())) {
      toast.error("Department name must be unique");
      return;
    }
    const newDept: Department = {
      id: generateId(),
      name: newDeptName,
      lineItems: [],
      documents: [],
      isExpanded: true
    };
    updateBudgetDraft(project.id, { departments: [...activeVersion.departments, newDept] });
    setNewDeptName("");
    setIsAddDeptOpen(false);
    setExpandedDepartments(prev => [...prev, newDept.id]);
  };

  const handleDeleteDepartment = (deptId: string) => {
    if (!activeVersion || activeVersion.status !== 'draft') return;
    const dept = activeVersion.departments.find(d => d.id === deptId);
    if (dept && (dept.lineItems.length > 0 || dept.documents.length > 0)) {
      toast.error("Remove line items and documents before deleting department.");
      return;
    }
    const newDepts = activeVersion.departments.filter(d => d.id !== deptId);
    updateBudgetDraft(project.id, { departments: newDepts });
  };

  const handleSubmitForApproval = () => {
    if (!activeVersion) return;
    // Validate
    const total = activeVersion.departments.reduce((sum, d) => sum + d.lineItems.reduce((s, i) => s + i.amount, 0), 0);
    if (total === 0) {
      toast.warning("Warning: Submitting a budget with 0 total.");
    }

    const pendingVersion: BudgetVersion = {
      ...activeVersion,
      status: 'awaiting_approval',
      submittedAt: new Date().toISOString()
    };

    updateBudgetState(project.id, {
      budgetDraft: null, // Clear draft or keep as backup? Prompt says "Keep stored... but we do NOT need a cancel flow". Let's clear to avoid confusion.
      budgetPending: pendingVersion
    });
    toast.success("Budget submitted for approval.");
  };

  const handleApproveAndLock = () => {
    if (!budgetState.budgetPending) return;
    
    const lockedVersion: BudgetVersion = {
      ...budgetState.budgetPending,
      status: 'locked',
      approvedAt: new Date().toISOString(),
      approvedBy: "Finance Admin"
    };

    // Calculate total for Overview
    const total = lockedVersion.departments.reduce((sum, d) => sum + d.lineItems.reduce((s, i) => s + i.amount, 0), 0);

    updateBudgetState(project.id, {
      budgetPending: null,
      budgetLockedHistory: [lockedVersion, ...budgetState.budgetLockedHistory]
    });
    
    updateFinancing(project.id, { totalBudget: total });
    toast.success("Budget approved and locked. Overview updated.");
  };

  const handleMakeChanges = () => {
    // Clone latest locked to new draft
    const latestLocked = budgetState.budgetLockedHistory[0];
    if (!latestLocked) return;

    const newDraft: BudgetVersion = {
      ...latestLocked,
      id: generateId(),
      status: 'draft',
      createdAt: new Date().toISOString(),
      submittedAt: null,
      approvedAt: null,
      approvedBy: null,
      // Deep clone departments/items to avoid ref issues
      departments: latestLocked.departments.map(d => ({
        ...d,
        lineItems: d.lineItems.map(i => ({...i})),
        documents: d.documents.map(doc => ({...doc}))
      }))
    };

    updateBudgetState(project.id, { budgetDraft: newDraft });
    toast.info("New draft created from locked budget.");
  };

  const handleDeleteDocument = (deptId: string, docId: string) => {
    if (!activeVersion || activeVersion.status !== 'draft') return;
    const newDepts = activeVersion.departments.map(d => {
      if (d.id !== deptId) return d;
      return { ...d, documents: d.documents.filter(doc => doc.id !== docId) };
    });
    updateBudgetDraft(project.id, { departments: newDepts });
  };

  const handleRenameDepartment = (deptId: string) => {
    if (!expandedDepts.includes(deptId)) {
        setExpandedDepartments(prev => [...prev, deptId]);
    }
    // We rely on the user to edit the input that appears when expanded.
    // Ideally we would focus it, but just expanding is a good start for "access to rename".
    // Alternatively, we could open a small dialog, but inline is better.
    // Let's just expand it, and maybe show a toast or rely on UI affordance.
  };

  // --- Document Mock Upload ---
  const handleUploadDoc = () => {
    if (!uploadDeptId || !activeVersion) return;
    const newDoc: BudgetDocument = {
      id: generateId(),
      fileName: newDocFile || "Untitled_Doc.pdf",
      docType: newDocType as any,
      status: 'Pending approval',
      uploadedAt: new Date().toISOString()
    };

    const newDepts = activeVersion.departments.map(d => {
      if (d.id !== uploadDeptId) return d;
      return { ...d, documents: [...d.documents, newDoc] };
    });
    
    updateBudgetDraft(project.id, { departments: newDepts });
    setIsUploadOpen(false);
    setNewDocFile("");
    setUploadDeptId(null);
  };

  // --- CALCULATIONS ---
  const calculateTotal = (dept: Department) => dept.lineItems.reduce((sum, i) => sum + i.amount, 0);
  const totalBudget = activeVersion ? activeVersion.departments.reduce((sum, d) => sum + calculateTotal(d), 0) : 0;
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: activeVersion?.currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // --- RENDER HELPERS ---
  
  const isReadOnly = selectedHistoryVersion !== null || activeVersion?.status !== 'draft';
  const statusColor = {
    draft: "bg-blue-100 text-blue-800 border-blue-200",
    awaiting_approval: "bg-amber-100 text-amber-800 border-amber-200",
    locked: "bg-green-100 text-green-800 border-green-200"
  };

  if (!activeVersion) return null; // Should be handled by initial boot

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* 1) TOP STATUS BAR */}
      <Card className="bg-card border-border sticky top-0 z-10 shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={`capitalize ${statusColor[activeVersion.status]}`}>
                  {activeVersion.status.replace('_', ' ')}
                </Badge>
                {selectedHistoryVersion && (
                  <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                    <History className="h-3 w-3 mr-1" /> History View
                  </Badge>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-foreground">
                  {formatCurrency(totalBudget)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Last updated: {format(new Date(activeVersion.submittedAt || activeVersion.approvedAt || activeVersion.createdAt), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedHistoryVersion ? (
              <Button onClick={() => setSelectedHistoryVersion(null)} variant="secondary">
                Back to Current Budget
              </Button>
            ) : (
              <>
                {/* Draft Actions */}
                {activeVersion.status === 'draft' && (
                  <>
                    <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
                      <History className="h-4 w-4 mr-2" /> History
                    </Button>
                    <Button onClick={handleSubmitForApproval}>Submit for Approval</Button>
                  </>
                )}

                {/* Pending Actions */}
                {activeVersion.status === 'awaiting_approval' && (
                  <>
                    <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
                      <History className="h-4 w-4 mr-2" /> History
                    </Button>
                    <Button onClick={handleApproveAndLock} className="bg-green-600 hover:bg-green-700 text-white">
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Approve & Lock
                    </Button>
                  </>
                )}

                {/* Locked Actions */}
                {activeVersion.status === 'locked' && (
                  <>
                    <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
                      <History className="h-4 w-4 mr-2" /> History
                    </Button>
                    <Button onClick={handleMakeChanges}>
                      <Pencil className="h-4 w-4 mr-2" /> Make Changes to Budget
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </CardContent>
        
        {/* Banner Messages */}
        {activeVersion.status === 'awaiting_approval' && !selectedHistoryVersion && (
          <div className="bg-amber-50 border-t border-amber-100 p-2 text-center text-sm text-amber-800 flex items-center justify-center gap-2">
            <Lock className="h-3 w-3" /> Budget submitted for approval. Editing is temporarily disabled.
          </div>
        )}
        {activeVersion.status === 'locked' && !selectedHistoryVersion && (
          <div className="bg-green-50 border-t border-green-100 p-2 text-center text-sm text-green-800 flex items-center justify-center gap-2">
            <Lock className="h-3 w-3" /> This budget is locked and reflected in the financing overview.
          </div>
        )}
        {selectedHistoryVersion && (
          <div className="bg-gray-50 border-t border-gray-200 p-2 text-center text-sm text-gray-600 flex items-center justify-center gap-2">
            <History className="h-3 w-3" /> Viewing locked budget from {format(new Date(selectedHistoryVersion.approvedAt!), 'MMM d, yyyy')}. Read-only.
          </div>
        )}
      </Card>

      {/* 3) DEPARTMENT MANAGEMENT (Draft Only) */}
      {!isReadOnly && (
        <div className="flex justify-end">
          <Dialog open={isAddDeptOpen} onOpenChange={setIsAddDeptOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Add Department
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Department</DialogTitle>
                <DialogDescription>Create a new category for line items.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input 
                  placeholder="Department Name" 
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button onClick={handleAddDepartment}>Add Department</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* 2) DEPARTMENT LIST */}
      <div className="space-y-4">
        {activeVersion.departments.map((dept) => {
          const isExpanded = expandedDepts.includes(dept.id);
          const deptTotal = calculateTotal(dept);
          
          return (
            <div key={dept.id} className="border border-border rounded-lg bg-card overflow-hidden">
              {/* Collapsed Header */}
              <div 
                className={`p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors ${isExpanded ? 'bg-secondary/30' : ''}`}
                onClick={() => setExpandedDepartments(prev => 
                  isExpanded ? prev.filter(id => id !== dept.id) : [...prev, dept.id]
                )}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-medium text-foreground">{dept.name}</span>
                  {dept.documents.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground">
                      {dept.documents.length} docs
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono font-medium">{formatCurrency(deptTotal)}</span>
                  {!isReadOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleRenameDepartment(dept.id);
                        }}>
                          <Pencil className="h-4 w-4 mr-2" /> Rename
                        </DropdownMenuItem>
                        {dept.lineItems.length === 0 && dept.documents.length === 0 && (
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeptToDelete(dept.id);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {/* Expanded Workspace */}
              {isExpanded && (
                <div className="p-0 border-t border-border animate-in slide-in-from-top-2 duration-200">
                  
                  {/* A) Department Overview */}
                  <div className="p-6 bg-secondary/10 grid gap-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <Input 
                          value={dept.name}
                          onChange={(e) => handleUpdateDepartment(dept.id, { name: e.target.value })}
                          disabled={isReadOnly}
                          className="font-medium text-lg border-transparent hover:border-input focus:border-primary bg-transparent px-0 h-auto"
                        />
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground uppercase tracking-wider block mb-1">Total</span>
                        <span className="text-2xl font-mono font-bold">{formatCurrency(deptTotal)}</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* B) Line Items */}
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Line Items</h4>
                      {!isReadOnly && (
                        <Button size="sm" variant="outline" onClick={() => handleAddLineItem(dept.id)}>
                          <Plus className="h-3 w-3 mr-2" /> Add Item
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {dept.lineItems.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic py-4 text-center bg-secondary/20 rounded-md">
                          No line items yet.
                        </div>
                      ) : (
                        dept.lineItems.map((item) => (
                          <div key={item.id} className="flex items-start gap-3 group">
                            <div className="flex-1 grid grid-cols-12 gap-3">
                              <div className="col-span-5">
                                <Input 
                                  value={item.name}
                                  onChange={(e) => handleUpdateLineItem(dept.id, item.id, { name: e.target.value })}
                                  placeholder="Item Name"
                                  disabled={isReadOnly}
                                  className="h-9"
                                />
                              </div>
                              <div className="col-span-3">
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                  <FormattedNumberInput
                                    value={item.amount || 0}
                                    onChange={(val) => handleUpdateLineItem(dept.id, item.id, { amount: val })}
                                    placeholder="0.00"
                                    disabled={isReadOnly}
                                    className="h-9 pl-6 font-mono"
                                  />
                                </div>
                              </div>
                              <div className="col-span-4">
                                <Input 
                                  value={item.note || ''}
                                  onChange={(e) => handleUpdateLineItem(dept.id, item.id, { note: e.target.value })}
                                  placeholder="Note (opt)"
                                  disabled={isReadOnly}
                                  className="h-9 text-xs text-muted-foreground"
                                />
                              </div>
                            </div>
                            {!isReadOnly && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-9 w-9 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteLineItem(dept.id, item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* C) Department Documents */}
                  <div className="p-6 bg-secondary/5">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Supporting Documents</h4>
                      {!isReadOnly && (
                        <Button size="sm" variant="secondary" onClick={() => {
                          setUploadDeptId(dept.id);
                          setIsUploadOpen(true);
                        }}>
                          <Upload className="h-3 w-3 mr-2" /> Upload
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {dept.documents.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic py-2">No documents attached.</div>
                      ) : (
                        <div className="grid gap-2">
                          {dept.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-md text-sm">
                              <div className="flex items-center gap-3">
                                <FileText className="h-4 w-4 text-primary" />
                                <div>
                                  <div className="font-medium">{doc.fileName}</div>
                                  <div className="text-xs text-muted-foreground">{doc.docType} • {format(new Date(doc.uploadedAt), 'MMM d')}</div>
                                </div>
                              </div>
                              <div>
                                <Badge variant={doc.status === 'Approved' ? 'default' : 'outline'} className="text-[10px]">
                                  {doc.status}
                                </Badge>
                              </div>
                              {!isReadOnly && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-2">
                                      <MoreHorizontal className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem 
                                      onClick={() => handleDeleteDocument(dept.id, doc.id)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4) HISTORY SIDE PANEL */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Budget History</DialogTitle>
            <DialogDescription>View past locked budgets.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            {budgetState.budgetLockedHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No locked budgets yet.</p>
            ) : (
              budgetState.budgetLockedHistory.map((version, index) => (
                <div 
                  key={version.id} 
                  className="flex items-center justify-between p-3 border rounded-md hover:bg-secondary cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedHistoryVersion(version);
                    setHistoryOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium flex items-center gap-2">
                      Locked Budget
                      {index === 0 && <Badge variant="default" className="text-[10px] h-4 px-1">Current</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(version.approvedAt!), 'MMM d, yyyy @ h:mm a')}
                    </span>
                  </div>
                  <div className="text-xs bg-secondary px-2 py-1 rounded">
                    by {version.approvedBy}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog Mock */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Attach a quote or estimate to this department.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>File Name</Label>
              <Input 
                value={newDocFile}
                onChange={(e) => setNewDocFile(e.target.value)}
                placeholder="e.g. Camera_Rental_Quote_v1.pdf"
              />
            </div>
            <div className="grid gap-2">
              <Label>Document Type</Label>
              <Select value={newDocType} onValueChange={setNewDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Quote">Quote</SelectItem>
                  <SelectItem value="Estimate">Estimate</SelectItem>
                  <SelectItem value="Bid">Bid</SelectItem>
                  <SelectItem value="Top Sheet">Top Sheet</SelectItem>
                  <SelectItem value="Schedule">Schedule</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleUploadDoc}>Attach Document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deptToDelete} onOpenChange={(open) => !open && setDeptToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this department? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deptToDelete) {
                  handleDeleteDepartment(deptToDelete);
                  setDeptToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

// Simple dollar icon for placeholder
function DollarSign({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
