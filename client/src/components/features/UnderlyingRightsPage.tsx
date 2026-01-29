import { useMemo } from "react";
import { Project, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Scale } from "lucide-react";
import { UploadDocumentDialog } from "@/components/features/UploadDocumentDialog";
import DocumentLibrary from "@/pages/DocumentLibrary";

type RightsStage = "Evaluation" | "Development" | "Production";

type RightsType = "Original" | "Book" | "Article" | "Life Rights" | "Remake" | "Other";

type RightsStatusByStage = {
  Evaluation?: "Identified" | "Contacted" | "Under Review" | "Option Pending" | "Optioned" | "Not Available";
  Development?: "Optioned" | "Extended" | "Purchase Pending" | "Purchased" | "Rights Issue";
  Production?: "Cleared" | "Chain Complete" | "Missing Doc" | "Expired" | "Legal Hold";
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

  const rights = project.rights || {
    type: "Original" as RightsType,
    holder: "",
    statusByStage: {} as RightsStatusByStage,
    expiryDate: "",
    notes: "",
  };

  const status = (rights.statusByStage?.[stage] as string | undefined) || cfg.defaultStatus;

  const statusVariant = useMemo(() => statusTone(stage, status), [stage, status]);

  const setRights = (patch: Partial<Project["rights"]>) => {
    updateProject(project.id, {
      rights: {
        ...rights,
        ...patch,
      },
    });
  };

  const setStatus = (next: string) => {
    updateProject(project.id, {
      rights: {
        ...rights,
        statusByStage: {
          ...(rights.statusByStage || {}),
          [stage]: next,
        },
      },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">Underlying Rights</h2>
            <Badge variant={statusVariant} data-testid="badge-rights-status">
              {status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1" data-testid="text-rights-helper">
            {cfg.helper}
          </p>
        </div>

        <div className="flex gap-2">
          <UploadDocumentDialog projectId={project.id} defaultCategoryId="c11">
            <Button size="sm" className="shadow-lg shadow-primary/20" data-testid="button-upload-rights-document">
              <Plus className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          </UploadDocumentDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Rights Overview
            </CardTitle>
            <CardDescription>Core rights data for this project.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rights-type" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Rights Type
                </Label>
                <Select
                  value={rights.type}
                  onValueChange={(v) => setRights({ type: v as RightsType })}
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
                <Select value={status} onValueChange={(v) => setStatus(v)}>
                  <SelectTrigger id="rights-status" data-testid="select-rights-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {cfg.statuses.map((s) => (
                      <SelectItem key={s} value={s}>
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
                  id="rights-holder"
                  value={rights.holder}
                  onChange={(e) => setRights({ holder: e.target.value })}
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
                  value={rights.expiryDate}
                  onChange={(e) => setRights({ expiryDate: e.target.value })}
                  data-testid="input-rights-expiry"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="rights-notes" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </Label>
                <Textarea
                  id="rights-notes"
                  value={rights.notes}
                  onChange={(e) => setRights({ notes: e.target.value })}
                  placeholder="Key terms, contacts, constraints, renewal notes…"
                  className="min-h-[120px]"
                  data-testid="textarea-rights-notes"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7 border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Chain of Title / Documents
            </CardTitle>
            <CardDescription>Upload and track key rights documents (MVP).</CardDescription>
          </CardHeader>
          <CardContent>
            <div data-testid="section-rights-documents">
              <DocumentLibrary projectId={project.id} categoryId="c11" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
