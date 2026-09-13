import { useState } from "react";
import type { EngagementStatus, Person } from "@shared/contracts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Edit,
  ExternalLink,
  Globe,
  HardHat,
  Mail,
  Phone,
  Star,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser, useIsStudioAdmin } from "@/features/auth/use-current-user";
import { useChangePersonStatus, useDeletePerson } from "@/features/people/use-people";
import {
  attentionReasons,
  contractStatusLabels,
  creativeRoleTypeLabels,
  engagementStatusLabel,
  engagementStatusLabels,
  engagementStatuses,
  statusBadgeVariant,
  statusTone,
} from "@/features/people/labels";
import { PersonFormDialog } from "./PersonFormDialog";
import { PersonDocumentsSection } from "./PersonDocumentsSection";

const NONE = "none";

const toneClass = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  attention: "border-rose-500/30 bg-rose-500/10 text-rose-700",
} as const;

function contactIcon(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes("mail")) return <Mail className="h-4 w-4" />;
  if (lower.includes("phone") || lower.includes("cell") || lower.includes("mobile"))
    return <Phone className="h-4 w-4" />;
  return <User className="h-4 w-4" />;
}

export function creativeRoleIcon(type: Person["creativeRoleType"], className = "h-4 w-4 mr-1.5") {
  switch (type) {
    case "director":
      return <Clapperboard className={className} />;
    case "cast":
      return <Star className={className} />;
    case "head_of_department":
      return <HardHat className={className} />;
    default:
      return <User className={className} />;
  }
}

interface PersonDetailsDialogProps {
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Read view plus the status command, documents, edit and remove. */
export function PersonDetailsDialog({ person, open, onOpenChange }: PersonDetailsDialogProps) {
  const currentUserId = useCurrentUser().data?.data.user.id;
  const isStudioAdmin = useIsStudioAdmin();
  const changeStatus = useChangePersonStatus();
  const remove = useDeletePerson();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEngagementOpen, setIsEngagementOpen] = useState(false);

  const canRemove = isStudioAdmin || person.createdBy.id === currentUserId;
  const status = person.engagement.status;
  const reasons = attentionReasons(person);
  const engagementSummary = [
    engagementStatusLabel(status),
    person.engagement.startDate ? `Start: ${person.engagement.startDate}` : null,
    person.engagement.contractStatus
      ? `Contract: ${contractStatusLabels[person.engagement.contractStatus]}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const onStatusChange = (value: string) => {
    const next = value === NONE ? null : (value as EngagementStatus);
    if (next === status) return;
    changeStatus.mutate({
      projectId: person.projectId,
      personId: person.id,
      input: { status: next, version: person.version },
    });
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync({
        projectId: person.projectId,
        personId: person.id,
        version: person.version,
      });
      setShowDeleteConfirm(false);
      onOpenChange(false);
    } catch {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl pr-2">{person.name}</DialogTitle>
            <DialogDescription asChild>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                <div className="flex items-center">
                  {person.kind === "producer" ? (
                    <Building2 className="h-4 w-4 mr-1.5" />
                  ) : (
                    creativeRoleIcon(person.creativeRoleType)
                  )}
                  <span className="font-medium truncate">
                    {person.kind === "producer" ? person.company : person.roleTitle}
                  </span>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "h-6 w-6 rounded-md border flex items-center justify-center",
                          toneClass[statusTone(status)],
                        )}
                      >
                        <AlertCircle className="h-3.5 w-3.5" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {engagementStatusLabel(status)}
                      {reasons.length ? ` · ${reasons.join(" · ")}` : ""}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Badge variant={statusBadgeVariant(status)} className="text-xs font-normal bg-background/50">
                  {engagementStatusLabel(status)}
                </Badge>
                <Badge variant="secondary" className="text-xs font-normal">
                  {person.kind === "producer"
                    ? person.roleTitle
                    : creativeRoleTypeLabels[person.creativeRoleType ?? "head_of_department"]}
                </Badge>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-8 py-4">
            {person.agent && (
              <div className="p-3 bg-secondary/10 rounded-md border border-border/50 flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Rep:
                </span>
                <span className="font-medium text-sm">{person.agent}</span>
              </div>
            )}

            {person.contacts.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Contact
                </h4>
                <div className="grid gap-2">
                  {person.contacts.map((contact, index) => (
                    <div
                      key={`${contact.type}-${index}`}
                      className="flex items-center gap-3 p-2 rounded-md bg-secondary/10 border border-border/50"
                    >
                      <div className="p-2 rounded-full bg-background border border-border text-primary">
                        {contactIcon(contact.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{contact.type}</div>
                        <div className="font-medium truncate select-all">{contact.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {person.links.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Links
                </h4>
                <div className="flex flex-wrap gap-2">
                  {person.links.map((link, index) => (
                    <a
                      key={`${link.url}-${index}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors text-sm font-medium"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {link.label}
                      <ExternalLink className="h-3 w-3 ml-0.5 opacity-50" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {person.notes && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Notes
                </h4>
                <div className="bg-secondary/10 p-3 rounded-lg border border-border/50 text-sm leading-relaxed whitespace-pre-wrap">
                  {person.notes}
                </div>
              </div>
            )}

            <div className="border border-border/60 rounded-lg overflow-hidden bg-card/50">
              <button
                type="button"
                className="w-full p-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
                onClick={() => setIsEngagementOpen((v) => !v)}
                aria-expanded={isEngagementOpen}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Project Engagement</h3>
                  </div>
                  {!isEngagementOpen && (
                    <p className="text-xs text-muted-foreground">{engagementSummary}</p>
                  )}
                </div>
                {isEngagementOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {isEngagementOpen && (
                <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                  <Separator className="mb-4" />
                  <p className="text-xs text-muted-foreground">
                    Track project-specific hiring status and key dates.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="person-engagement-status" className="text-xs font-medium text-muted-foreground">
                        Status
                      </Label>
                      <Select
                        value={status ?? NONE}
                        onValueChange={onStatusChange}
                        disabled={changeStatus.isPending}
                      >
                        <SelectTrigger id="person-engagement-status" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not set</SelectItem>
                          {engagementStatuses.map((option) => (
                            <SelectItem key={option} value={option}>
                              {engagementStatusLabels[option]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">Role on this project</div>
                      <div className="text-sm">
                        {person.engagement.roleOnProject || person.roleTitle}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">Start date</div>
                      <div className="text-sm">{person.engagement.startDate ?? "Not set"}</div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">Contract status</div>
                      <div className="text-sm">
                        {person.engagement.contractStatus
                          ? contractStatusLabels[person.engagement.contractStatus]
                          : "Not set"}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">Engagement notes</div>
                    <div className="text-sm whitespace-pre-wrap rounded-md border border-border/50 bg-secondary/10 p-3">
                      {person.engagement.notes ?? "Not set"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <PersonDocumentsSection person={person} canDetach={canRemove} />
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between sm:gap-0">
            <div>
              {canRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Profile
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => setIsEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PersonFormDialog
        projectId={person.projectId}
        kind={person.kind}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        person={person}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {person.name} from the project. Attached documents stay in the
              project library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
