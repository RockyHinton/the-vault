import { useState } from "react";
import { format } from "date-fns";
import {
  formatMoney,
  type Budget,
  type BudgetDepartment,
  type BudgetLineItem,
  type BudgetVersion,
  type CurrencyCode,
} from "@shared/contracts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Plus, Trash2, History, Lock, CheckCircle2, MoreHorizontal, Pencil } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import {
  useAttachNewDepartmentDocument,
  useBudget,
  useBudgetVersion,
  useCreateBudget,
  useCreateBudgetDepartment,
  useCreateBudgetLineItem,
  useDeleteBudgetDepartment,
  useDeleteBudgetLineItem,
  useDetachDepartmentDocument,
  useLockBudgetVersion,
  useCommitDepartmentName,
  useCommitLineItem,
  useStartBudgetRevision,
  useSubmitBudgetVersion,
} from "@/features/budget/use-budget";
import { budgetStatusClass, budgetStatusLabels, currencyCodes, currencyLabels } from "@/features/budget/labels";
import { MoneyInput } from "@/components/finance/MoneyInput";
import { CommitInput } from "@/components/forms/CommitInput";
import { OwnerDocumentList } from "@/components/documents/OwnerDocumentList";

/**
 * The project budget: a numbered, lifecycle-controlled version with
 * departments, exact line items and supporting documents. Totals come from
 * the server; the page never adds money itself.
 */
export default function BudgetTool() {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const budgetQuery = useBudget(project.id);
  const [historyVersionId, setHistoryVersionId] = useState<string | null>(null);
  const historyQuery = useBudgetVersion(project.id, historyVersionId);
  const create = useCreateBudget();
  const [currency, setCurrency] = useState<CurrencyCode>("USD");

  if (budgetQuery.isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading budget…</p>;
  if (budgetQuery.isError) return <p className="text-sm text-destructive py-8 text-center">The budget could not be loaded.</p>;
  const budget = budgetQuery.data?.data ?? null;

  if (!budget) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] space-y-4 text-center">
        <div>
          <h3 className="text-xl font-medium">No Budget Started</h3>
          <p className="text-muted-foreground">Create a new budget to start tracking costs.</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1 text-left">
            <Label htmlFor="budget-currency">Currency</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
              <SelectTrigger id="budget-currency" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {currencyCodes.map((code) => (
                  <SelectItem key={code} value={code}>{currencyLabels[code]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={create.isPending} onClick={() => create.mutate({ projectId: project.id, input: { currency } })}>
            Create Budget Draft
          </Button>
        </div>
      </div>
    );
  }

  const viewingHistory = historyVersionId !== null && historyVersionId !== budget.currentVersion.id;
  const version = viewingHistory ? historyQuery.data?.data : budget.currentVersion;
  if (viewingHistory && historyQuery.isError)
    return <p className="text-sm text-destructive py-8 text-center">That budget version could not be loaded.</p>;
  if (!version) return <p className="text-sm text-muted-foreground py-8 text-center">Loading version…</p>;

  return (
    <BudgetVersionView
      budget={budget}
      version={version}
      readOnly={viewingHistory || version.status !== "draft"}
      viewingHistory={viewingHistory}
      isStudioAdmin={isStudioAdmin}
      onOpenHistory={setHistoryVersionId}
      onBackToCurrent={() => setHistoryVersionId(null)}
    />
  );
}

function BudgetVersionView({
  budget,
  version,
  readOnly,
  viewingHistory,
  isStudioAdmin,
  onOpenHistory,
  onBackToCurrent,
}: {
  budget: Budget;
  version: BudgetVersion;
  readOnly: boolean;
  viewingHistory: boolean;
  isStudioAdmin: boolean;
  onOpenHistory: (versionId: string) => void;
  onBackToCurrent: () => void;
}) {
  const projectId = budget.projectId;
  const money = (value: string) => formatMoney(value, budget.currency);
  const submit = useSubmitBudgetVersion();
  const lock = useLockBudgetVersion();
  const revise = useStartBudgetRevision();
  const addDepartment = useCreateBudgetDepartment();
  const commitDepartmentName = useCommitDepartmentName(projectId);
  const removeDepartment = useDeleteBudgetDepartment();
  const addLine = useCreateBudgetLineItem();
  const commitLine = useCommitLineItem(projectId);
  const removeLine = useDeleteBudgetLineItem();
  const attachDocument = useAttachNewDepartmentDocument();
  const detachDocument = useDetachDepartmentDocument();

  const [expanded, setExpanded] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deptToDelete, setDeptToDelete] = useState<BudgetDepartment | null>(null);
  const [newDeptName, setNewDeptName] = useState("");
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);

  const toggle = (id: string) =>
    setExpanded((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const lastUpdated = version.lockedAt ?? version.submittedAt ?? version.updatedAt;
  const lineRef = (item: BudgetLineItem) => ({ projectId, lineItemId: item.id });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Card className="bg-card border-border sticky top-0 z-10 shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={budgetStatusClass[version.status]} data-testid="budget-status">
                {budgetStatusLabels[version.status]}
              </Badge>
              <Badge variant="secondary" className="font-mono" data-testid="budget-version-number">
                v{version.versionNumber}
              </Badge>
              {viewingHistory && (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                  <History className="h-3 w-3 mr-1" /> History View
                </Badge>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground" data-testid="budget-total">
                {money(version.total)}
              </span>
              <span className="text-xs text-muted-foreground">
                Last updated: {format(new Date(lastUpdated), "MMM d, yyyy")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {viewingHistory ? (
              <Button onClick={onBackToCurrent} variant="secondary">Back to Current Budget</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
                  <History className="h-4 w-4 mr-2" /> History
                </Button>
                {version.status === "draft" && (
                  <Button
                    disabled={submit.isPending}
                    onClick={() => submit.mutate({ projectId, versionId: version.id, version: version.version })}
                  >
                    Submit for Approval
                  </Button>
                )}
                {version.status === "awaiting_approval" && isStudioAdmin && (
                  <Button
                    disabled={lock.isPending}
                    onClick={() => lock.mutate({ projectId, versionId: version.id, version: version.version })}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve & Lock
                  </Button>
                )}
                {version.status === "locked" && (
                  <Button
                    disabled={revise.isPending}
                    onClick={() => revise.mutate({ projectId, fromVersionId: version.id })}
                  >
                    <Pencil className="h-4 w-4 mr-2" /> Make Changes to Budget
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>

        {version.status === "awaiting_approval" && !viewingHistory && (
          <div className="bg-amber-50 border-t border-amber-100 p-2 text-center text-sm text-amber-800 flex items-center justify-center gap-2">
            <Lock className="h-3 w-3" />
            {isStudioAdmin
              ? "Budget submitted for approval. Editing is disabled until it is locked."
              : "Budget submitted for approval. A studio administrator will approve and lock it."}
          </div>
        )}
        {version.status === "locked" && !viewingHistory && (
          <div className="bg-green-50 border-t border-green-100 p-2 text-center text-sm text-green-800 flex items-center justify-center gap-2">
            <Lock className="h-3 w-3" /> This budget is locked
            {version.lockedBy ? ` by ${version.lockedBy.displayName}` : ""}. Start a revision to make changes.
          </div>
        )}
        {viewingHistory && version.lockedAt && (
          <div className="bg-gray-50 border-t border-gray-200 p-2 text-center text-sm text-gray-600 flex items-center justify-center gap-2">
            <History className="h-3 w-3" /> Viewing v{version.versionNumber}, locked {format(new Date(version.lockedAt), "MMM d, yyyy")}. Read-only.
          </div>
        )}
      </Card>

      {!readOnly && (
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
                <Label htmlFor="new-department-name" className="sr-only">Department name</Label>
                <Input
                  id="new-department-name"
                  placeholder="Department Name"
                  value={newDeptName}
                  maxLength={120}
                  onChange={(e) => setNewDeptName(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={!newDeptName.trim() || addDepartment.isPending}
                  onClick={async () => {
                    try {
                      const result = await addDepartment.mutateAsync({
                        projectId,
                        versionId: version.id,
                        input: { name: newDeptName.trim() },
                      });
                      const created = result.data.departments.find((d) => d.name === newDeptName.trim());
                      if (created) setExpanded((ids) => [...ids, created.id]);
                      setNewDeptName("");
                      setIsAddDeptOpen(false);
                    } catch {
                      // Reported by the mutation hook; keep the dialog open.
                    }
                  }}
                >
                  Add Department
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="space-y-4">
        {version.departments.map((dept) => {
          const isExpanded = expanded.includes(dept.id);
          return (
            <div
              key={dept.id}
              data-testid="budget-department"
              data-department-name={dept.name}
              className="border border-border rounded-lg bg-card overflow-hidden"
            >
              <div
                role="button"
                tabIndex={0}
                aria-label={`Toggle ${dept.name}`}
                aria-expanded={isExpanded}
                className={cn("p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors", isExpanded && "bg-secondary/30")}
                onClick={() => toggle(dept.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") toggle(dept.id);
                }}
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
                  <span className="font-mono font-medium" data-testid="department-total">{money(dept.total)}</span>
                  {!readOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`${dept.name} actions`} onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); if (!isExpanded) toggle(dept.id); }}>
                          <Pencil className="h-4 w-4 mr-2" /> Rename
                        </DropdownMenuItem>
                        {dept.lineItems.length === 0 && dept.documents.length === 0 && (
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); setDeptToDelete(dept); }}
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

              {isExpanded && (
                <div className="p-0 border-t border-border animate-in slide-in-from-top-2 duration-200">
                  <div className="p-6 bg-secondary/10 grid gap-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <CommitInput
                          value={dept.name}
                          aria-label="Department name"
                          disabled={readOnly}
                          onCommit={(name) => commitDepartmentName(dept.id, name)}
                          className="font-medium text-lg border-transparent hover:border-input focus:border-primary bg-transparent px-0 h-auto"
                        />
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground uppercase tracking-wider block mb-1">Total</span>
                        <span className="text-2xl font-mono font-bold">{money(dept.total)}</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Line Items</h4>
                      {!readOnly && (
                        <Button size="sm" variant="outline" disabled={addLine.isPending} onClick={() => addLine.mutate({ projectId, departmentId: dept.id, input: { name: "New Item", amount: "0.00" } })}>
                          <Plus className="h-3 w-3 mr-2" /> Add Item
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {dept.lineItems.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic py-4 text-center bg-secondary/20 rounded-md">No line items yet.</div>
                      ) : (
                        dept.lineItems.map((item) => (
                          <div key={item.id} data-testid="budget-line-item" className="flex items-start gap-3 group">
                            <div className="flex-1 grid grid-cols-12 gap-3">
                              <div className="col-span-5">
                                <CommitInput
                                  value={item.name}
                                  aria-label="Item name"
                                  placeholder="Item Name"
                                  disabled={readOnly}
                                  onCommit={(name) => commitLine(item.id, { name })}
                                  className="h-9"
                                />
                              </div>
                              <div className="col-span-3">
                                <MoneyInput
                                  value={item.amount}
                                  aria-label="Item amount"
                                  disabled={readOnly}
                                  onCommit={(amount) => commitLine(item.id, { amount })}
                                  className="h-9"
                                />
                              </div>
                              <div className="col-span-4">
                                <CommitInput
                                  value={item.note ?? ""}
                                  aria-label="Item note"
                                  placeholder="Note (opt)"
                                  disabled={readOnly}
                                  onCommit={(note) => commitLine(item.id, { note })}
                                  className="h-9 text-xs text-muted-foreground"
                                />
                              </div>
                            </div>
                            {!readOnly && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${item.name}`}
                                className="h-9 w-9 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => removeLine.mutate({ ...lineRef(item), version: item.version })}
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

                  <div className="p-6 bg-secondary/5">
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Supporting Documents</h4>
                    {readOnly ? (
                      dept.documents.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic py-2">No documents attached.</div>
                      ) : (
                        <ul className="space-y-2">
                          {dept.documents.map((doc) => (
                            <li key={doc.lineageId} className="text-sm p-3 bg-card border border-border rounded-md flex items-center justify-between">
                              <span className="font-medium">{doc.title}</span>
                              <span className="text-xs text-muted-foreground">{doc.file.originalFilename} · v{doc.versionNumber}</span>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : (
                      <OwnerDocumentList
                        ownerLabel={`the ${dept.name} department`}
                        documents={dept.documents}
                        canDetach
                        rowTestId="budget-document"
                        emptyMessage="No documents attached. Attach a quote or estimate."
                        onAttachNew={(input) => attachDocument.mutateAsync({ projectId, departmentId: dept.id, input })}
                        onDetach={(doc) => detachDocument.mutate({ projectId, departmentId: dept.id, documentId: doc.id })}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Budget History</DialogTitle>
            <DialogDescription>Every version, newest first. Locked versions are permanent.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            {budget.versions.map((v) => (
              <button
                key={v.id}
                type="button"
                data-testid="budget-history-row"
                className="w-full flex items-center justify-between p-3 border rounded-md hover:bg-secondary text-left transition-colors"
                onClick={() => {
                  onOpenHistory(v.id);
                  setHistoryOpen(false);
                }}
              >
                <div className="flex flex-col">
                  <span className="font-medium flex items-center gap-2">
                    v{v.versionNumber} · {budgetStatusLabels[v.status]}
                    {v.id === budget.currentVersion.id && <Badge variant="default" className="text-[10px] h-4 px-1">Current</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {v.lockedAt
                      ? `Locked ${format(new Date(v.lockedAt), "MMM d, yyyy @ h:mm a")} by ${v.lockedBy?.displayName ?? ""}`
                      : v.submittedAt
                        ? `Submitted ${format(new Date(v.submittedAt), "MMM d, yyyy @ h:mm a")} by ${v.submittedBy?.displayName ?? ""}`
                        : `Created ${format(new Date(v.createdAt), "MMM d, yyyy @ h:mm a")} by ${v.createdBy.displayName}`}
                  </span>
                </div>
                <span className="text-xs font-mono bg-secondary px-2 py-1 rounded">{money(v.total)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deptToDelete !== null} onOpenChange={(open) => !open && setDeptToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department</AlertDialogTitle>
            <AlertDialogDescription>Remove {deptToDelete?.name} from this draft?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deptToDelete) removeDepartment.mutate({ projectId, departmentId: deptToDelete.id });
                setDeptToDelete(null);
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
