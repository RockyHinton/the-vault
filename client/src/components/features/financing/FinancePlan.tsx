import { useState } from "react";
import { format } from "date-fns";
import {
  formatMoney,
  type BudgetVersionSummary,
  type CurrencyCode,
  type FinancePlan as FinancePlanRecord,
  type FinanceSource,
  type FinanceSourceType,
} from "@shared/contracts";
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
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useBudget } from "@/features/budget/use-budget";
import {
  useApproveFinanceSource,
  useAttachNewSourceDocument,
  useChangeFinanceSourceStatus,
  useCommitFinanceSource,
  useCreateFinancePlan,
  useCreateFinanceSource,
  useDeleteFinanceSource,
  useDetachSourceDocument,
  useFinancePlan,
  useRebaseFinancePlan,
} from "@/features/finance-plan/use-finance-plan";
import {
  editableSourceStatuses,
  financeSourceStatusClass,
  financeSourceStatusLabels,
  financeSourceTypeLabels,
  financeSourceTypes,
} from "@/features/finance-plan/labels";
import { MoneyInput } from "@/components/finance/MoneyInput";
import { CommitInput } from "@/components/forms/CommitInput";
import { useQueryClient } from "@tanstack/react-query";
import { financePlanKey } from "@/features/finance-plan/use-finance-plan";
import { OwnerDocumentList } from "@/components/documents/OwnerDocumentList";

/**
 * The project's finance plan: a register of funding sources against one exact
 * locked budget version. Every figure on this screen is the server's
 * `summary`; the browser never adds money.
 */
export default function FinancePlan() {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const planQuery = useFinancePlan(project.id);
  const budgetQuery = useBudget(project.id);

  if (planQuery.isLoading || budgetQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading finance plan…</p>;
  }
  if (planQuery.isError || budgetQuery.isError) {
    return <p className="text-sm text-destructive">The finance plan could not be loaded.</p>;
  }

  const budget = budgetQuery.data?.data;
  const lockedVersions = (budget?.versions ?? []).filter((v) => v.status === "locked");
  const plan = planQuery.data?.data;
  if (!plan) {
    return <EmptyState projectId={project.id} currency={budget?.currency ?? "GBP"} lockedVersions={lockedVersions} />;
  }
  return <PlanScreen plan={plan} lockedVersions={lockedVersions} isStudioAdmin={isStudioAdmin} />;
}

function EmptyState({
  projectId,
  currency,
  lockedVersions,
}: {
  projectId: string;
  currency: CurrencyCode;
  lockedVersions: BudgetVersionSummary[];
}) {
  const create = useCreateFinancePlan();
  const newest = lockedVersions.reduce<BudgetVersionSummary | undefined>(
    (latest, v) => (!latest || v.versionNumber > latest.versionNumber ? v : latest),
    undefined,
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(newest?.id);
  const selected = lockedVersions.find((v) => v.id === selectedId) ?? newest;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-semibold">Finance Plan</h2>
        <p className="text-sm text-muted-foreground">Funding sources are planned against a locked budget.</p>
      </div>
      <Card className="border-dashed">
        <CardContent className="py-12 flex flex-col items-center text-center gap-4">
          <div className="p-3 rounded-full bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          {lockedVersions.length === 0 ? (
            <>
              <h3 className="text-lg font-semibold">Lock a budget first</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                A finance plan is based on an approved, locked budget version so the funding gap is measured against
                a fixed baseline. Submit the budget and have a studio administrator lock it.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold">No finance plan yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Create the plan against a locked budget version. You can point it at a newer locked version later.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {lockedVersions.length > 1 && selected && (
                  <Select value={selected.id} onValueChange={setSelectedId}>
                    <SelectTrigger className="w-[260px]" aria-label="Budget version">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {lockedVersions.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          v{v.versionNumber} · locked · {formatMoney(v.total, currency)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selected && (
                  <Button
                    disabled={create.isPending}
                    onClick={() => create.mutate({ projectId, input: { budgetVersionId: selected.id } })}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Create plan against locked budget v{selected.versionNumber}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanScreen({
  plan,
  lockedVersions,
  isStudioAdmin,
}: {
  plan: FinancePlanRecord;
  lockedVersions: BudgetVersionSummary[];
  isStudioAdmin: boolean;
}) {
  const projectId = plan.projectId;
  const currency = plan.currency;
  const money = (value: string) => formatMoney(value, currency);
  const currentUserId = useCurrentUser().data?.data.user.id;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [approveTargetId, setApproveTargetId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const approveTarget = plan.sources.find((s) => s.id === approveTargetId) ?? null;
  const [deleteTarget, setDeleteTarget] = useState<FinanceSource | null>(null);
  const [rebaseOpen, setRebaseOpen] = useState(false);

  const createSource = useCreateFinanceSource();
  const commit = useCommitFinanceSource(projectId);
  const changeStatus = useChangeFinanceSourceStatus();
  const approve = useApproveFinanceSource();
  const remove = useDeleteFinanceSource();
  const attachDocument = useAttachNewSourceDocument();
  const detachDocument = useDetachSourceDocument();
  const rebase = useRebaseFinancePlan();

  const [draft, setDraft] = useState<{
    name: string;
    amount: string;
    type: FinanceSourceType;
    status: (typeof editableSourceStatuses)[number];
    expectedDate: string;
    notes: string;
  }>({ name: "", amount: "0.00", type: "equity", status: "targeted", expectedDate: "", notes: "" });
  const resetDraft = () =>
    setDraft({ name: "", amount: "0.00", type: "equity", status: "targeted", expectedDate: "", notes: "" });

  const summary = plan.summary;
  const hasGap = summary.fundingGap !== "0.00";
  const otherLockedVersions = lockedVersions.filter((v) => v.id !== plan.budgetVersionId);
  const canRemove = (source: FinanceSource) => isStudioAdmin || source.createdBy.id === currentUserId;

  const submitNewSource = async () => {
    if (!draft.name.trim()) return;
    try {
      await createSource.mutateAsync({
        projectId,
        input: {
          name: draft.name.trim(),
          amount: draft.amount,
          type: draft.type,
          status: draft.status,
          expectedDate: draft.expectedDate || undefined,
          notes: draft.notes.trim() || undefined,
        },
      });
      resetDraft();
      setAddOpen(false);
    } catch {
      /* the mutation toast reports the failure; keep the dialog open */
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Dialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTargetId(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-500 mb-2">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Confirm Approval</DialogTitle>
            </div>
            <DialogDescription className="py-2">
              Approve <strong>{approveTarget?.name}</strong> for{" "}
              <strong>{approveTarget ? money(approveTarget.amount) : ""}</strong>?
              <br />
              <br />
              Once approved, the source is <strong>locked (read-only)</strong>, its amount counts toward secured
              funding, and the approval cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setApproveTargetId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={approve.isPending}
              onClick={async () => {
                if (!approveTarget) return;
                // The version is read from the cache at send time: the dialog may have
                // been open while another edit to this source landed.
                const latest = queryClient
                  .getQueryData<{ data: FinancePlanRecord } | null>(financePlanKey(projectId))
                  ?.data.sources.find((s) => s.id === approveTarget.id);
                try {
                  await approve.mutateAsync({ projectId, sourceId: approveTarget.id, version: latest?.version ?? approveTarget.version });
                } catch {
                  /* toast shown by the mutation */
                }
                setApproveTargetId(null);
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> Verify & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove funding source</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget?.name}</strong> from the finance plan? Its attached documents stay in the
              Documents library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget)
                  remove.mutate({ projectId, sourceId: deleteTarget.id, version: deleteTarget.version });
                setDeleteTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rebaseOpen} onOpenChange={setRebaseOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Change budget version</DialogTitle>
            <DialogDescription>
              Point this plan at another locked budget version. Funding sources are unchanged; the budget total and
              funding gap are recalculated against the new baseline.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {otherLockedVersions.map((v) => (
              <Button
                key={v.id}
                variant="outline"
                className="justify-between"
                disabled={rebase.isPending}
                onClick={async () => {
                  try {
                    await rebase.mutateAsync({ projectId, input: { budgetVersionId: v.id, version: plan.version } });
                    setRebaseOpen(false);
                  } catch {
                    /* toast shown by the mutation */
                  }
                }}
              >
                <span>
                  v{v.versionNumber} · locked {v.lockedAt ? format(new Date(v.lockedAt), "d MMM yyyy") : ""}
                </span>
                <span className="font-mono">{money(v.total)}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          label="Total Budget"
          value={money(summary.budgetTotal)}
          testId="finance-total-budget"
          icon={<DollarSign className="h-4 w-4" />}
          tone="primary"
          caption={`Locked budget v${plan.budgetVersionNumber}`}
        />
        <SummaryCard
          label="Secured Funding"
          value={money(summary.approvedTotal)}
          testId="finance-secured"
          icon={<TrendingUp className="h-4 w-4" />}
          tone="green"
          caption={`Soft committed ${money(summary.softCommittedTotal)} · targeted ${money(summary.targetedTotal)}`}
        />
        <SummaryCard
          label={summary.overFinancedBy !== "0.00" ? "Over-financed by" : "Funding Gap"}
          value={money(summary.overFinancedBy !== "0.00" ? summary.overFinancedBy : summary.fundingGap)}
          testId="finance-gap"
          icon={<AlertCircle className="h-4 w-4" />}
          tone={hasGap || summary.overFinancedBy !== "0.00" ? "amber" : "muted"}
          caption={hasGap ? "Approved sources only count as secured" : "Fully financed by approved sources"}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">Finance Plan</h2>
          <p className="text-sm text-muted-foreground">
            Against locked budget v{plan.budgetVersionNumber} ({currency}). Created by {plan.createdBy.displayName}.
            {otherLockedVersions.length > 0 && (
              <Button variant="link" className="h-auto p-0 ml-2 text-sm" onClick={() => setRebaseOpen(true)}>
                Change budget version
              </Button>
            )}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Funding Source
        </Button>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetDraft();
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Funding Source</DialogTitle>
            <DialogDescription>Record a source of financing for this plan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="source-name" className="text-right">
                Name
              </Label>
              <Input
                id="source-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="col-span-3"
                placeholder="e.g. Equity Investor A"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="source-amount" className="text-right">
                Amount
              </Label>
              <div className="col-span-3">
                <MoneyInput
                  aria-label="Source amount"
                  value={draft.amount}
                  onCommit={(amount) => setDraft((d) => ({ ...d, amount }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Type</Label>
              <Select value={draft.type} onValueChange={(type) => setDraft({ ...draft, type: type as FinanceSourceType })}>
                <SelectTrigger className="col-span-3" aria-label="Source type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {financeSourceTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {financeSourceTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Status</Label>
              <Select
                value={draft.status}
                onValueChange={(status) => setDraft({ ...draft, status: status as (typeof editableSourceStatuses)[number] })}
              >
                <SelectTrigger className="col-span-3" aria-label="Source status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editableSourceStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {financeSourceStatusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="source-expected" className="text-right">
                Expected
              </Label>
              <Input
                id="source-expected"
                type="date"
                value={draft.expectedDate}
                onChange={(e) => setDraft({ ...draft, expectedDate: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="source-notes" className="text-right">
                Notes
              </Label>
              <Textarea
                id="source-notes"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className="col-span-3"
                placeholder="Contact, conditions, next steps…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitNewSource} disabled={createSource.isPending || !draft.name.trim()}>
              Create Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {plan.sources.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
            <p className="text-muted-foreground">No funding sources added yet.</p>
          </div>
        ) : (
          plan.sources.map((source) => {
            const approved = source.status === "approved";
            const open = expanded[source.id] ?? false;
            return (
              <Card
                key={source.id}
                data-testid="finance-source"
                data-source-name={source.name}
                className={cn("overflow-hidden transition-all duration-200", open && "ring-1 ring-primary/20")}
              >
                <div
                  className="p-5 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpanded((prev) => ({ ...prev, [source.id]: !open }))}
                >
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className="p-3 rounded-full bg-primary/10 text-primary shadow-sm">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-foreground tracking-tight truncate">{source.name}</h3>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs px-2 py-0.5 font-medium">
                          {financeSourceTypeLabels[source.type]}
                        </Badge>
                        <Badge
                          variant={approved ? "default" : "secondary"}
                          data-testid="finance-source-status"
                          className={cn("text-xs px-2 py-0.5 font-medium", financeSourceStatusClass[source.status])}
                        >
                          {financeSourceStatusLabels[source.status]}
                        </Badge>
                        {source.documents.length > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1.5 ml-1 px-2 border-l border-border h-4">
                            <FileText className="h-3.5 w-3.5" /> {source.documents.length} doc
                            {source.documents.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 mr-2">
                    <div className="text-right">
                      <div className="text-xl font-mono font-bold tracking-tight" data-testid="finance-source-amount">
                        {money(source.amount)}
                      </div>
                      {source.expectedDate && (
                        <div className="text-xs font-medium text-muted-foreground mt-0.5">
                          Exp: {format(new Date(`${source.expectedDate}T00:00:00`), "d MMM yyyy")}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`Toggle ${source.name}`}>
                      {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </Button>
                  </div>
                </div>

                {open && (
                  <div className="p-8 border-t bg-muted/10 flex flex-col gap-8 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-5">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                          <DollarSign className="h-4 w-4" /> Source Details
                        </h4>
                        {!approved && canRemove(source) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(source)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Remove Source
                          </Button>
                        )}
                      </div>
                      {approved && (
                        <p className="text-xs text-muted-foreground" data-testid="finance-source-approval">
                          Approved by {source.approvedBy?.displayName}
                          {source.approvedAt ? ` on ${format(new Date(source.approvedAt), "d MMM yyyy")}` : ""}. Approved
                          sources are permanent and read-only.
                        </p>
                      )}
                      <div className="grid gap-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="grid gap-2">
                            <Label>Source Name</Label>
                            <CommitInput
                              aria-label="Source name"
                              value={source.name}
                              disabled={approved}
                              className="bg-background"
                              onCommit={(name) => commit(source.id, { name })}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Amount ({currency})</Label>
                            <MoneyInput
                              aria-label="Source amount"
                              value={source.amount}
                              disabled={approved}
                              className="bg-background"
                              onCommit={(amount) => commit(source.id, { amount })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="grid gap-2">
                            <Label>Type</Label>
                            <Select
                              value={source.type}
                              disabled={approved}
                              onValueChange={(type) => commit(source.id, { type: type as FinanceSourceType })}
                            >
                              <SelectTrigger className="bg-background" aria-label="Source type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {financeSourceTypes.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {financeSourceTypeLabels[type]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label>Status</Label>
                            {approved ? (
                              <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-green-50 text-green-700 border-green-200 text-sm font-medium dark:bg-green-950/40 dark:text-green-300 dark:border-green-900">
                                <CheckCircle2 className="h-4 w-4" />
                                Approved & Locked
                              </div>
                            ) : (
                              <Select
                                value={source.status}
                                onValueChange={(status) => {
                                  if (status === "approved") setApproveTargetId(source.id);
                                  else if (status === "targeted" || status === "soft_committed")
                                    changeStatus.mutate({ projectId, sourceId: source.id, input: { status, version: source.version } });
                                }}
                              >
                                <SelectTrigger className="bg-background" aria-label="Source status">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {editableSourceStatuses.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {financeSourceStatusLabels[status]}
                                    </SelectItem>
                                  ))}
                                  {isStudioAdmin && <SelectItem value="approved">Approved (verify & lock)</SelectItem>}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <div className="grid gap-2">
                            <Label>Expected Date</Label>
                            <CommitInput
                              type="date"
                              aria-label="Expected date"
                              value={source.expectedDate ?? ""}
                              allowEmpty
                              disabled={approved}
                              className="bg-background"
                              onCommit={(expectedDate) => commit(source.id, { expectedDate: expectedDate || null })}
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>Notes</Label>
                          <CommitInput
                            multiline
                            aria-label="Source notes"
                            value={source.notes ?? ""}
                            allowEmpty
                            disabled={approved}
                            className="h-20 bg-background resize-none"
                            placeholder="Contact points, conditions, next steps…"
                            onCommit={(notes) => commit(source.id, { notes })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Supporting Documents
                        </h4>
                      </div>
                      <OwnerDocumentList
                        ownerLabel={source.name}
                        documents={source.documents}
                        canDetach={!approved && canRemove(source)}
                        rowTestId="finance-source-document"
                        emptyMessage="No documents attached. Attach a term sheet, LOI or grant letter."
                        onAttachNew={(input) => attachDocument.mutateAsync({ projectId, sourceId: source.id, input })}
                        onDetach={(doc) => detachDocument.mutate({ projectId, sourceId: source.id, documentId: doc.id })}
                      />
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  caption,
  icon,
  tone,
  testId,
}: {
  label: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
  tone: "primary" | "green" | "amber" | "muted";
  testId: string;
}) {
  const tones = {
    primary: { value: "", badge: "border-primary/20 bg-primary/10 text-primary" },
    green: { value: "text-green-500", badge: "border-green-500/20 bg-green-500/10 text-green-500" },
    amber: { value: "text-amber-500", badge: "border-amber-500/20 bg-amber-500/10 text-amber-500" },
    muted: { value: "text-muted-foreground", badge: "border-muted bg-muted/50" },
  }[tone];
  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <div className={cn("text-2xl font-bold font-mono mt-1 truncate", tones.value)} data-testid={testId}>
            {value}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 truncate">{caption}</p>
        </div>
        <Badge variant="outline" className={cn("h-8 w-8 shrink-0 rounded-full flex items-center justify-center p-0", tones.badge)}>
          {icon}
        </Badge>
      </CardContent>
    </Card>
  );
}
