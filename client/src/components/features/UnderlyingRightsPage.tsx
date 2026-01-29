import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Project, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type RightsStage = "Evaluation" | "Development" | "Production";

type RightsType = "Original" | "Book" | "Article" | "Life Rights" | "Remake" | "Other";

type RightsStatusByStage = {
  Evaluation?: "Identified" | "Contacted" | "Under Review" | "Option Pending" | "Optioned" | "Not Available";
  Development?: "Optioned" | "Extended" | "Purchase Pending" | "Purchased" | "Rights Issue";
  Production?: "Cleared" | "Chain Complete" | "Missing Doc" | "Expired" | "Legal Hold";
};

type RightsItem = {
  id: string;
  rightsType: string;
  status: string;
  rightsHolder: string;
  expiryDate: string | null;
  notes: string;
  documents: Array<{ id: string; name: string; url?: string; createdAt: string }>;
};

const RIGHTS_TYPES: RightsType[] = ["Original", "Book", "Article", "Life Rights", "Remake", "Other"];

const STATUS_CONFIG: Record<
  RightsStage,
  {
    helper: string;
    statuses: NonNullable<RightsStatusByStage[RightsStage]>[];
    defaultStatus: RightsStatusByStage[RightsStage];
  }
> = {
  Evaluation: {
    helper: "Track rights early to avoid developing material you can’t control.",
    statuses: ["Identified", "Contacted", "Under Review", "Option Pending", "Optioned", "Not Available"],
    defaultStatus: "Identified",
  },
  Development: {
    helper: "Rights should be secured or under active option during development.",
    statuses: ["Optioned", "Extended", "Purchase Pending", "Purchased", "Rights Issue"],
    defaultStatus: "Optioned",
  },
  Production: {
    helper: "Production requires cleared rights and complete chain of title for finance & E&O.",
    statuses: ["Cleared", "Chain Complete", "Missing Doc", "Expired", "Legal Hold"],
    defaultStatus: "Cleared",
  },
};

function statusTone(stage: RightsStage, status: string | undefined) {
  if (!status) return "outline" as const;

  if (stage === "Production") {
    if (status === "Cleared" || status === "Chain Complete") return "default" as const;
    if (status === "Legal Hold" || status === "Expired") return "destructive" as const;
    return "secondary" as const;
  }

  if (stage === "Development") {
    if (status === "Purchased") return "default" as const;
    if (status === "Rights Issue") return "destructive" as const;
    if (status === "Purchase Pending" || status === "Extended") return "secondary" as const;
    return "outline" as const;
  }

  // Evaluation
  if (status === "Optioned") return "default" as const;
  if (status === "Not Available") return "destructive" as const;
  if (status === "Option Pending" || status === "Under Review") return "secondary" as const;
  return "outline" as const;
}

export default function UnderlyingRightsPage({ project, stage }: { project: Project; stage: RightsStage }) {
  const { updateProject } = useStore();

  const cfg = STATUS_CONFIG[stage];

  const holderInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  const ensureRightsItems = () => {
    const existing = project.rightsItems;
    if (existing && existing.length > 0) return;

    if (project.rights) {
      const migrated: RightsItem = {
        id: "ri-1",
        rightsType: project.rights.type,
        status:
          (project.rights.statusByStage?.[stage] as string | undefined) ||
          (cfg.defaultStatus as string),
        rightsHolder: project.rights.holder || "",
        expiryDate: project.rights.expiryDate ? project.rights.expiryDate : null,
        notes: project.rights.notes || "",
        documents: [],
      };

      updateProject(project.id, {
        rightsItems: [migrated],
      });
      return;
    }

    const seeded: RightsItem = {
      id: "ri-1",
      rightsType: "Original",
      status: cfg.statuses[0] as string,
      rightsHolder: "",
      expiryDate: null,
      notes: "",
      documents: [],
    };

    updateProject(project.id, {
      rightsItems: [seeded],
    });
  };

  useEffect(() => {
    ensureRightsItems();
  }, [project.id]);

  const rightsItems: RightsItem[] = (project.rightsItems || []) as RightsItem[];

  useEffect(() => {
    if (!rightsItems.length) return;
    if (selectedItemId && rightsItems.some((ri) => ri.id === selectedItemId)) return;
    setSelectedItemId(rightsItems[0].id);
  }, [rightsItems.length]);

  const selectedItem = useMemo(() => {
    if (!rightsItems.length) return null;
    const found = rightsItems.find((ri) => ri.id === selectedItemId);
    return found || rightsItems[0];
  }, [rightsItems, selectedItemId]);

  const headerStatus = useMemo(() => {
    if (!rightsItems.length) return cfg.defaultStatus as string;

    if (stage === "Production") {
      const atRisk = new Set(["Expired", "Legal Hold", "Missing Doc"]);
      if (rightsItems.some((i) => atRisk.has(i.status))) return "At Risk";
      const cleared = new Set(["Cleared", "Chain Complete"]);
      if (rightsItems.every((i) => cleared.has(i.status))) return "Cleared";
      return "In Progress";
    }

    if (stage === "Development") {
      const atRisk = new Set(["Rights Issue"]);
      if (rightsItems.some((i) => atRisk.has(i.status))) return "At Risk";
      const cleared = new Set(["Purchased"]);
      if (rightsItems.every((i) => cleared.has(i.status))) return "Cleared";
      return "In Progress";
    }

    // Evaluation
    const atRisk = new Set(["Not Available"]);
    if (rightsItems.some((i) => atRisk.has(i.status))) return "At Risk";
    const cleared = new Set(["Optioned"]);
    if (rightsItems.every((i) => cleared.has(i.status))) return "Cleared";
    return "In Progress";
  }, [rightsItems, stage, cfg.defaultStatus]);

  const headerVariant = useMemo(() => {
    if (headerStatus === "Cleared") return "default" as const;
    if (headerStatus === "At Risk") return "destructive" as const;
    return "secondary" as const;
  }, [headerStatus]);

  const updateItem = (id: string, patch: Partial<RightsItem>) => {
    updateProject(project.id, {
      rightsItems: rightsItems.map((ri) => (ri.id === id ? { ...ri, ...patch } : ri)),
    });
  };

  const addItem = () => {
    const next: RightsItem = {
      id: `ri-${nanoid(6)}`,
      rightsType: "Original",
      status: cfg.statuses[0] as string,
      rightsHolder: "",
      expiryDate: null,
      notes: "",
      documents: [],
    };

    updateProject(project.id, { rightsItems: [...rightsItems, next] });
    setSelectedItemId(next.id);

    setTimeout(() => {
      holderInputRef.current?.focus();
    }, 50);
  };

  const confirmDelete = () => {
    if (!deleteItemId) return;
    const nextItems = rightsItems.filter((ri) => ri.id !== deleteItemId);
    updateProject(project.id, { rightsItems: nextItems });

    const nextSelected = nextItems[0]?.id || null;
    setSelectedItemId(nextSelected);
    setDeleteItemId(null);
  };

  const uploadToSelected = (file: File) => {
    if (!selectedItem) return;
    const url = URL.createObjectURL(file);
    const doc = {
      id: `rid-${nanoid(6)}`,
      name: file.name,
      url,
      createdAt: new Date().toISOString(),
    };

    updateItem(selectedItem.id, {
      documents: [...(selectedItem.documents || []), doc],
    });
  };

  const removeDoc = (docId: string) => {
    if (!selectedItem) return;
    const doc = (selectedItem.documents || []).find((d) => d.id === docId);
    if (doc?.url) URL.revokeObjectURL(doc.url);
    updateItem(selectedItem.id, {
      documents: (selectedItem.documents || []).filter((d) => d.id !== docId),
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">Underlying Rights</h2>
            <Badge variant={headerVariant} data-testid="badge-rights-status">
              {headerStatus}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1" data-testid="text-rights-helper">
            {cfg.helper}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="shadow-lg shadow-primary/20"
            data-testid="button-upload-rights-document"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.onchange = () => {
                const f = input.files?.[0];
                if (f) uploadToSelected(f);
              };
              input.click();
            }}
            disabled={!selectedItem}
          >
            <Plus className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7 border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Rights Items
            </CardTitle>
            <CardDescription>Track multiple underlying rights sources without duplicating the whole page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground" data-testid="text-rights-items-count">
                {rightsItems.length} item{rightsItems.length === 1 ? "" : "s"}
              </div>
              <Button size="sm" variant="outline" onClick={addItem} data-testid="button-add-rights-item">
                <Plus className="h-4 w-4" />
                Add Rights Item
              </Button>
            </div>

            <div
              className={
                "grid gap-4 " +
                (rightsItems.length > 1 ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1")
              }
            >
              {/* Left: Item list (collapses when only 1 item) */}
              {rightsItems.length > 1 && (
                <div className="lg:col-span-5 space-y-2" data-testid="panel-rights-items-list">
                  {rightsItems.map((item) => {
                    const isActive = item.id === selectedItem?.id;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        data-testid={`row-rights-item-${item.id}`}
                        className={
                          "group flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors cursor-pointer " +
                          (isActive
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/60 hover:bg-secondary/30")
                        }
                        onClick={() => setSelectedItemId(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedItemId(item.id);
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-foreground truncate">{item.rightsType || "Untitled"}</div>
                            <Badge
                              variant={statusTone(stage, item.status)}
                              className="text-[10px]"
                              data-testid={`badge-rights-item-status-${item.id}`}
                            >
                              {item.status || "—"}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground truncate" data-testid={`text-rights-holder-${item.id}`}>
                            {item.rightsHolder || "No holder set"}
                          </div>
                          {item.expiryDate && (
                            <div className="mt-1 text-[11px] text-muted-foreground" data-testid={`text-rights-expiry-${item.id}`}>
                              Expiry: {item.expiryDate}
                            </div>
                          )}
                        </div>

                        {rightsItems.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteItemId(item.id);
                            }}
                            data-testid={`button-delete-rights-item-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Right: Details */}
              <div
                className={rightsItems.length > 1 ? "lg:col-span-7" : "lg:col-span-12"}
                data-testid="panel-rights-item-details"
              >
                {selectedItem ? (
                  <div className="rounded-lg border border-border/60 p-4 bg-card">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">Selected item</div>
                        <div className="font-semibold text-foreground truncate" data-testid="text-selected-rights-item">
                          {selectedItem.rightsType || "Untitled"}
                        </div>
                      </div>
                      <Badge variant={statusTone(stage, selectedItem.status)} data-testid="badge-selected-rights-status">
                        {selectedItem.status || "—"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rights-type" className="text-xs uppercase tracking-wider text-muted-foreground">
                          Rights Type
                        </Label>
                        <Select
                          value={selectedItem.rightsType || "Original"}
                          onValueChange={(v) => updateItem(selectedItem.id, { rightsType: v })}
                        >
                          <SelectTrigger id="rights-type" data-testid="select-rights-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {RIGHTS_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
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
                          value={selectedItem.status || (cfg.defaultStatus as string)}
                          onValueChange={(v) => updateItem(selectedItem.id, { status: v })}
                        >
                          <SelectTrigger id="rights-status" data-testid="select-rights-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {cfg.statuses.map((s) => (
                              <SelectItem key={s} value={s as string}>
                                {s}
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
                          ref={holderInputRef}
                          id="rights-holder"
                          value={selectedItem.rightsHolder}
                          onChange={(e) => updateItem(selectedItem.id, { rightsHolder: e.target.value })}
                          placeholder="e.g., Publisher, estate, author, studio"
                          data-testid="input-rights-holder"
                        />
                      </div>

                      <div className="md:col-span-2 space-y-2">
                        <Label htmlFor="rights-expiry" className="text-xs uppercase tracking-wider text-muted-foreground">
                          Expiry Date
                        </Label>
                        <Input
                          id="rights-expiry"
                          type="date"
                          value={selectedItem.expiryDate || ""}
                          onChange={(e) => updateItem(selectedItem.id, { expiryDate: e.target.value || null })}
                          data-testid="input-rights-expiry"
                        />
                      </div>

                      <div className="md:col-span-2 space-y-2">
                        <Label htmlFor="rights-notes" className="text-xs uppercase tracking-wider text-muted-foreground">
                          Notes
                        </Label>
                        <Textarea
                          id="rights-notes"
                          value={selectedItem.notes}
                          onChange={(e) => updateItem(selectedItem.id, { notes: e.target.value })}
                          placeholder="Key terms, contacts, constraints, renewal notes…"
                          className="min-h-[120px]"
                          data-testid="textarea-rights-notes"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
                    No rights items yet.
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
              <span className="font-medium text-foreground" data-testid="text-documents-for">
                {selectedItem?.rightsType || "Selected item"}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3" data-testid="section-rights-documents">
              {(selectedItem?.documents?.length || 0) === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-xl bg-secondary/5 text-center">
                  <div className="h-12 w-12 bg-secondary/20 rounded-full flex items-center justify-center mb-3">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-sm font-medium">No documents for this rights item</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                    Upload documents here to keep chain-of-title clearly tied to this specific rights source.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.onchange = () => {
                        const f = input.files?.[0];
                        if (f) uploadToSelected(f);
                      };
                      input.click();
                    }}
                    disabled={!selectedItem}
                    data-testid="button-upload-item-document-empty"
                  >
                    Upload File
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-4 py-2 border-b border-border bg-secondary/20 flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground">Item documents</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.onchange = () => {
                          const f = input.files?.[0];
                          if (f) uploadToSelected(f);
                        };
                        input.click();
                      }}
                      data-testid="button-upload-item-document"
                    >
                      <Plus className="h-4 w-4" />
                      Upload
                    </Button>
                  </div>

                  <div className="divide-y">
                    {(selectedItem?.documents || []).map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-foreground truncate" data-testid={`text-doc-name-${d.id}`}>
                            {d.name}
                          </div>
                          <div className="text-xs text-muted-foreground" data-testid={`text-doc-date-${d.id}`}>
                            Uploaded {new Date(d.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => d.url && window.open(d.url, "_blank")}
                            data-testid={`button-open-doc-${d.id}`}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeDoc(d.id)}
                            data-testid={`button-delete-doc-${d.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteItemId} onOpenChange={(o) => (!o ? setDeleteItemId(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rights item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the rights item and all documents attached to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-rights-item">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={confirmDelete}
              data-testid="button-confirm-delete-rights-item"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
