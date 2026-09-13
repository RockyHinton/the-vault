import { useEffect, useMemo, useState } from "react";
import {
  rightsStatusesByStage,
  summarizeRightsForStage,
  type Right,
  type RightsStatus,
  type RightsType,
} from "@shared/contracts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { FileText, Plus, Scale, Trash2 } from "lucide-react";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useCurrentUser } from "@/features/auth/use-current-user";
import {
  useAttachNewRightDocument,
  useChangeRightStatus,
  useCreateRight,
  useDeleteRight,
  useDetachRightDocument,
  useRights,
  useUpdateRight,
} from "@/features/rights/use-rights";
import {
  rightsStageHelper,
  rightsStatusLabels,
  rightsStatusVariant,
  rightsSummaryLabels,
  rightsSummaryVariant,
  rightsTypeLabels,
  rightsTypes,
} from "@/features/rights/labels";
import { OwnerDocumentList } from "@/components/documents/OwnerDocumentList";

interface Draft {
  rightsType: RightsType;
  rightsHolder: string;
  expiryDate: string;
  notes: string;
}

const draftOf = (right: Right): Draft => ({
  rightsType: right.rightsType,
  rightsHolder: right.rightsHolder ?? "",
  expiryDate: right.expiryDate ?? "",
  notes: right.notes ?? "",
});

/**
 * Underlying rights for the project. Items are server records; the status
 * vocabulary follows the project's current stage. Edits are saved explicitly
 * with the item's version; status changes are their own command.
 */
export default function UnderlyingRightsPage() {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const currentUserId = useCurrentUser().data?.data.user.id;
  const stage = project.stage;
  const rightsQuery = useRights(project.id);
  const create = useCreateRight();
  const update = useUpdateRight();
  const changeStatus = useChangeRightStatus();
  const remove = useDeleteRight();
  const attachNew = useAttachNewRightDocument();
  const detach = useDetachRightDocument();

  const items = useMemo(() => rightsQuery.data?.data.items ?? [], [rightsQuery.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  // Reset the draft whenever a different item is selected or the server copy changes.
  useEffect(() => {
    setDraft(selected ? draftOf(selected) : null);
  }, [selected?.id, selected?.version]);

  const summary = summarizeRightsForStage(
    stage,
    items.map((item) => item.status),
  );
  const statusesForStage = rightsStatusesByStage[stage];
  const canRemove = (right: Right) => isStudioAdmin || right.createdBy.id === currentUserId;
  const isDirty =
    selected !== null && draft !== null && JSON.stringify(draft) !== JSON.stringify(draftOf(selected));

  const addItem = async () => {
    try {
      const created = await create.mutateAsync({
        projectId: project.id,
        input: { rightsType: "original" },
      });
      setSelectedId(created.data.id);
    } catch {
      // Reported by the mutation hook.
    }
  };

  const saveDraft = () => {
    if (!selected || !draft) return;
    update.mutate({
      projectId: project.id,
      rightId: selected.id,
      input: {
        rightsType: draft.rightsType,
        rightsHolder: draft.rightsHolder.trim() || null,
        expiryDate: draft.expiryDate || null,
        notes: draft.notes.trim() || null,
        version: selected.version,
      },
    });
  };

  const confirmDelete = async () => {
    const target = items.find((item) => item.id === deleteId);
    if (!target) return;
    try {
      await remove.mutateAsync({ projectId: project.id, rightId: target.id, version: target.version });
      setSelectedId(null);
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">
              Underlying Rights
            </h2>
            <Badge variant={rightsSummaryVariant(summary)} data-testid="badge-rights-status">
              {rightsSummaryLabels[summary]}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">{rightsStageHelper[stage]}</p>
        </div>
        <Button size="sm" onClick={addItem} disabled={create.isPending} className="shadow-lg shadow-primary/20">
          <Plus className="mr-2 h-4 w-4" />
          Add Rights Item
        </Button>
      </div>

      {rightsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading rights…</p>
      ) : rightsQuery.isError ? (
        <p className="text-sm text-destructive py-8 text-center">Rights could not be loaded.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7 border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                Rights Items
              </CardTitle>
              <CardDescription>
                Track multiple underlying rights sources without duplicating the whole page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {items.length} item{items.length === 1 ? "" : "s"}
              </div>

              <div className={"grid gap-4 " + (items.length > 1 ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1")}>
                {items.length > 1 && (
                  <div className="lg:col-span-5 space-y-2" data-testid="panel-rights-items-list">
                    {items.map((item) => {
                      const isActive = item.id === selected?.id;
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          data-testid="rights-item-row"
                          className={
                            "group flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors cursor-pointer " +
                            (isActive ? "border-primary/40 bg-primary/5" : "border-border/60 hover:bg-secondary/30")
                          }
                          onClick={() => setSelectedId(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") setSelectedId(item.id);
                          }}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-foreground truncate">
                                {rightsTypeLabels[item.rightsType]}
                              </div>
                              <Badge variant={rightsStatusVariant(stage, item.status)} className="text-[10px]">
                                {rightsStatusLabels[item.status]}
                              </Badge>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground truncate">
                              {item.rightsHolder || "No holder set"}
                            </div>
                            {item.expiryDate && (
                              <div className="mt-1 text-[11px] text-muted-foreground">Expiry: {item.expiryDate}</div>
                            )}
                          </div>
                          {canRemove(item) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Delete ${rightsTypeLabels[item.rightsType]} rights item`}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteId(item.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className={items.length > 1 ? "lg:col-span-7" : "lg:col-span-12"}>
                  {selected && draft ? (
                    <div className="rounded-lg border border-border/60 p-4 bg-card">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="min-w-0">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Selected item</div>
                          <div className="font-semibold text-foreground truncate" data-testid="text-selected-rights-item">
                            {rightsTypeLabels[selected.rightsType]}
                          </div>
                        </div>
                        <Badge variant={rightsStatusVariant(stage, selected.status)} data-testid="badge-selected-rights-status">
                          {rightsStatusLabels[selected.status]}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="rights-type" className="text-xs uppercase tracking-wider text-muted-foreground">
                            Rights Type
                          </Label>
                          <Select
                            value={draft.rightsType}
                            onValueChange={(value) => setDraft({ ...draft, rightsType: value as RightsType })}
                          >
                            <SelectTrigger id="rights-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {rightsTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {rightsTypeLabels[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="rights-status" className="text-xs uppercase tracking-wider text-muted-foreground">
                            Status
                          </Label>
                          <Select
                            value={selected.status}
                            disabled={changeStatus.isPending}
                            onValueChange={(value) =>
                              changeStatus.mutate({
                                projectId: project.id,
                                rightId: selected.id,
                                input: { status: value as RightsStatus, version: selected.version },
                              })
                            }
                          >
                            <SelectTrigger id="rights-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {!statusesForStage.includes(selected.status) && (
                                <SelectItem value={selected.status} disabled>
                                  {rightsStatusLabels[selected.status]} (earlier stage)
                                </SelectItem>
                              )}
                              {statusesForStage.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {rightsStatusLabels[status]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor="rights-holder" className="text-xs uppercase tracking-wider text-muted-foreground">
                            Rights Holder
                          </Label>
                          <Input
                            id="rights-holder"
                            value={draft.rightsHolder}
                            maxLength={200}
                            onChange={(event) => setDraft({ ...draft, rightsHolder: event.target.value })}
                            placeholder="e.g., Publisher, estate, author, studio"
                          />
                        </div>

                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor="rights-expiry" className="text-xs uppercase tracking-wider text-muted-foreground">
                            Expiry Date
                          </Label>
                          <Input
                            id="rights-expiry"
                            type="date"
                            value={draft.expiryDate}
                            onChange={(event) => setDraft({ ...draft, expiryDate: event.target.value })}
                          />
                        </div>

                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor="rights-notes" className="text-xs uppercase tracking-wider text-muted-foreground">
                            Notes
                          </Label>
                          <Textarea
                            id="rights-notes"
                            value={draft.notes}
                            maxLength={4000}
                            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                            placeholder="Key terms, contacts, constraints, renewal notes…"
                            className="min-h-[120px]"
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        {canRemove(selected) && items.length === 1 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeleteId(selected.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Remove item
                          </Button>
                        ) : (
                          <span />
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isDirty || update.isPending}
                            onClick={() => setDraft(draftOf(selected))}
                          >
                            Discard
                          </Button>
                          <Button size="sm" disabled={!isDirty || update.isPending} onClick={saveDraft}>
                            {update.isPending ? "Saving…" : "Save Item"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
                      No rights items yet. Add one to start tracking a rights source.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-5 border-border/60" data-testid="card-rights-documents">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Documents
              </CardTitle>
              <CardDescription>
                <span className="text-muted-foreground">Documents for:</span>{" "}
                <span className="font-medium text-foreground">
                  {selected ? rightsTypeLabels[selected.rightsType] : "Selected item"}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selected ? (
                <OwnerDocumentList
                  ownerLabel={`the ${rightsTypeLabels[selected.rightsType].toLowerCase()} rights item`}
                  documents={selected.documents}
                  canDetach={canRemove(selected)}
                  rowTestId="rights-document"
                  emptyMessage="No documents for this rights item. Upload chain-of-title documents here."
                  onAttachNew={(input) =>
                    attachNew.mutateAsync({ projectId: project.id, rightId: selected.id, input })
                  }
                  onDetach={(doc) =>
                    detach.mutate({ projectId: project.id, rightId: selected.id, documentId: doc.id })
                  }
                />
              ) : (
                <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4">
                  Select a rights item to manage its documents.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rights item?</AlertDialogTitle>
            <AlertDialogDescription>
              The item is removed from the project. Its documents stay in the project library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
