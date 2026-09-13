import { useState } from "react";
import { format } from "date-fns";
import {
  createLegalRecordSchema,
  isLegalRecordConfirmed,
  summarizeLegalCategory,
  type LegalCategory,
  type LegalRecord,
} from "@shared/contracts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronDown, ChevronRight, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useCurrentUser } from "@/features/auth/use-current-user";
import {
  useAttachNewLegalDocument,
  useCreateLegalRecord,
  useDeleteLegalRecord,
  useDetachLegalDocument,
  useLegalRecords,
  useUpdateAttachedDocumentStatus,
} from "@/features/legal/use-legal-records";
import {
  detailsFromForm,
  legalCategoryConfig,
  legalDocumentStatusLabels,
  type LegalFieldDescriptor,
} from "@/features/legal/categories";
import { OwnerDocumentList } from "@/components/documents/OwnerDocumentList";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: LegalFieldDescriptor;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `legal-${field.key}`;
  if (field.kind === "select") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      id={id}
      type={field.kind === "date" ? "date" : field.kind === "email" ? "email" : "text"}
      inputMode={field.kind === "amount" ? "decimal" : undefined}
      placeholder={field.kind === "amount" ? "e.g. 25000" : field.kind === "text" ? field.placeholder : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** One documentation category: its records, their details and attached documents. */
export default function DocumentationEntityPage({ category }: { category: LegalCategory }) {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const currentUserId = useCurrentUser().data?.data.user.id;
  const config = legalCategoryConfig[category];
  const recordsQuery = useLegalRecords(project.id, category);
  const create = useCreateLegalRecord();
  const remove = useDeleteLegalRecord();
  const attachNew = useAttachNewLegalDocument();
  const detach = useDetachLegalDocument();
  const updateDocumentStatus = useUpdateAttachedDocumentStatus();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toDelete, setToDelete] = useState<LegalRecord | null>(null);

  const records = recordsQuery.data?.data.items ?? [];
  const overview = summarizeLegalCategory(
    records.map((record) => ({ documentStatuses: record.documents.map((d) => d.status) })),
  );
  const lastUpdated = records.reduce<string | null>(
    (latest, record) => (!latest || record.updatedAt > latest ? record.updatedAt : latest),
    null,
  );
  const canRemove = (record: LegalRecord) => isStudioAdmin || record.createdBy.id === currentUserId;
  /** Documents policy: the uploader or an admin manages a document's status. */
  const canManageDocument = (doc: LegalRecord["documents"][number]) =>
    isStudioAdmin || doc.createdBy.id === currentUserId;

  const openAdd = () => {
    const defaults: Record<string, string> = {};
    for (const field of config.fields) {
      if (field.kind === "select" && field.defaultValue) defaults[field.key] = field.defaultValue;
    }
    setValues(defaults);
    setName("");
    setNotes("");
    setFormError(null);
    setIsAddOpen(true);
  };

  const submit = async () => {
    const parsed = createLegalRecordSchema.safeParse({
      name,
      notes: notes.trim() || null,
      details: detailsFromForm(category, values),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const key = String(issue.path.at(-1) ?? "");
      const field = config.fields.find((f) => f.key === key);
      setFormError(`${field?.label ?? (key === "name" ? config.nameLabel : "Form")}: ${issue.message}`);
      return;
    }
    try {
      await create.mutateAsync({ projectId: project.id, input: parsed.data });
      setIsAddOpen(false);
    } catch {
      // Reported by the mutation hook; keep the dialog open.
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove.mutateAsync({ projectId: project.id, recordId: toDelete.id, version: toDelete.version });
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between bg-card border rounded-lg p-3 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Status</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {overview.completion === "completed" ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700 h-5 px-1.5 text-[10px]">Complete</Badge>
              ) : overview.completion === "in_progress" ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">In Progress</Badge>
              ) : (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Empty</Badge>
              )}
            </div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Entities</span>
            <span className="text-sm font-mono font-bold">{overview.total}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Confirmed</span>
            <span className="text-sm font-mono font-bold text-green-600">{overview.confirmed}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pending</span>
            <span className="text-sm font-mono font-bold text-amber-500">{overview.pending}</span>
          </div>
        </div>
        {lastUpdated && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Updated {format(new Date(lastUpdated), "MMM d, h:mm a")}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          {config.addButtonLabel}
        </Button>
      </div>

      <Dialog open={isAddOpen} onOpenChange={(open) => !create.isPending && setIsAddOpen(open)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{config.modalTitle}</DialogTitle>
            <DialogDescription>
              Enter the details below. You can upload documents after creating the entity.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="legal-name">
                {config.nameLabel} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="legal-name"
                value={name}
                maxLength={200}
                placeholder={config.namePlaceholder}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {config.fields.map((field) => (
              <div key={field.key} className="grid gap-2">
                <Label htmlFor={`legal-${field.key}`}>
                  {field.label}{" "}
                  {"required" in field && field.required && <span className="text-destructive">*</span>}
                </Label>
                <FieldInput
                  field={field}
                  value={values[field.key] ?? ""}
                  onChange={(value) => setValues({ ...values, [field.key]: value })}
                />
              </div>
            ))}
            <div className="grid gap-2">
              <Label htmlFor="legal-notes">Notes</Label>
              <Textarea id="legal-notes" value={notes} maxLength={4000} onChange={(event) => setNotes(event.target.value)} />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create Entity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {recordsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading records…</p>
        ) : recordsQuery.isError ? (
          <p className="text-sm text-destructive py-8 text-center">Records could not be loaded.</p>
        ) : records.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No entities added yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
                Start by adding an entity, then upload relevant documents to track their status.
              </p>
              <Button variant="outline" onClick={openAdd}>
                {config.addButtonLabel}
              </Button>
            </CardContent>
          </Card>
        ) : (
          records.map((record) => {
            const confirmed = isLegalRecordConfirmed(record.documents.map((d) => d.status));
            const isExpanded = expanded[record.id] ?? false;
            return (
              <Card key={record.id} data-testid="legal-record" className="overflow-hidden transition-all duration-200">
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpanded({ ...expanded, [record.id]: !isExpanded })}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                        confirmed ? "bg-green-100 dark:bg-green-900/30 text-green-600" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {confirmed ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="font-semibold text-base">{record.name}</div>
                      <div className="text-sm text-muted-foreground">{config.secondaryLine(record)}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-3 mr-4">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Docs</span>
                        <span className="text-xs font-medium">{record.documents.length}</span>
                      </div>
                      <Badge
                        variant={confirmed ? "outline" : "secondary"}
                        className={cn(
                          "ml-2",
                          confirmed &&
                            "border-green-200 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
                        )}
                      >
                        {confirmed ? "Confirmed" : "Pending"}
                      </Badge>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="border-t bg-muted/5 p-6 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{config.nameLabel}</div>
                        <div className="text-sm font-medium break-words">{record.name}</div>
                      </div>
                      {config.fields.map((field) => {
                        const value = (record.details as Record<string, unknown>)[field.key];
                        return (
                          <div key={field.key} className="space-y-1">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{field.label}</div>
                            <div className="text-sm font-medium break-words">
                              {typeof value === "string" && value ? value : <span className="text-muted-foreground italic">-</span>}
                            </div>
                          </div>
                        );
                      })}
                      {record.notes && (
                        <div className="space-y-1 col-span-full">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Notes</div>
                          <div className="text-sm whitespace-pre-wrap">{record.notes}</div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2 border-b pb-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Documents
                      </h4>
                      <OwnerDocumentList
                        ownerLabel={record.name}
                        documents={record.documents}
                        canDetach={canRemove(record)}
                        rowTestId="legal-document"
                        emptyMessage="No documents uploaded."
                        statusLabels={legalDocumentStatusLabels}
                        onAttachNew={(input) =>
                          attachNew.mutateAsync({ projectId: project.id, recordId: record.id, input })
                        }
                        onDetach={(doc) =>
                          detach.mutate({ projectId: project.id, recordId: record.id, documentId: doc.id })
                        }
                        statusEditor={{
                          canEdit: canManageDocument,
                          onChange: (doc, status) =>
                            updateDocumentStatus.mutate({
                              projectId: project.id,
                              documentId: doc.id,
                              status,
                              version: doc.version,
                            }),
                        }}
                      />
                    </div>

                    {canRemove(record) && (
                      <div className="mt-8 pt-4 border-t flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setToDelete(record)}
                        >
                          <Trash2 className="h-3 w-3 mr-1.5" />
                          Remove Entity
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this entity?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.name} is removed from {config.label}. Its {toDelete?.documents.length ?? 0} attached
              document(s) stay in the project library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>
              Delete Entity
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
