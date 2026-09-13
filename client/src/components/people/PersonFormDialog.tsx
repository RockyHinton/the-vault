import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  contractStatusSchema,
  creativeRoleTypeSchema,
  engagementStatusSchema,
  personContactSchema,
  personLinkSchema,
  type CreatePersonInput,
  type Person,
  type PersonKind,
  type UpdatePersonInput,
} from "@shared/contracts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, ChevronDown, ChevronRight, Briefcase } from "lucide-react";
import { useCreatePerson, useUpdatePerson } from "@/features/people/use-people";
import {
  contractStatusLabels,
  contractStatuses,
  creativeRoleTypeLabels,
  creativeRoleTypes,
  engagementStatusLabel,
  engagementStatusLabels,
  engagementStatuses,
  personKindLabels,
} from "@/features/people/labels";

const NONE = "none";

/** One form for both kinds; kind-only fields are validated against `kind`. */
const formSchema = z
  .object({
    kind: z.enum(["producer", "creative"]),
    name: z.string().trim().min(1, "Name is required").max(200),
    roleTitle: z.string().trim().min(1, "Role is required").max(120),
    company: z.string().trim().max(200),
    creativeRoleType: creativeRoleTypeSchema,
    agent: z.string().trim().max(200),
    contacts: z.array(personContactSchema),
    links: z.array(personLinkSchema),
    notes: z.string().trim().max(4_000),
    status: z.union([engagementStatusSchema, z.literal(NONE)]),
    roleOnProject: z.string().trim().max(120),
    startDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use YYYY-MM-DD."),
    contractStatus: z.union([contractStatusSchema, z.literal(NONE)]),
    engagementNotes: z.string().trim().max(4_000),
  })
  .superRefine((value, context) => {
    if (value.kind === "producer" && value.company.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["company"],
        message: "Company is required",
      });
    }
  });
type FormValues = z.infer<typeof formSchema>;

function defaultsFor(kind: PersonKind, person?: Person): FormValues {
  return {
    kind,
    name: person?.name ?? "",
    roleTitle: person?.roleTitle ?? "",
    company: person?.company ?? "",
    creativeRoleType: person?.creativeRoleType ?? "director",
    agent: person?.agent ?? "",
    contacts: person?.contacts ?? [
      { type: kind === "producer" ? "Email" : "Agent Email", value: "" },
    ],
    links: person?.links ?? [],
    notes: person?.notes ?? "",
    status: person?.engagement.status ?? (person ? NONE : "identified"),
    roleOnProject: person?.engagement.roleOnProject ?? "",
    startDate: person?.engagement.startDate ?? "",
    contractStatus: person?.engagement.contractStatus ?? NONE,
    engagementNotes: person?.engagement.notes ?? "",
  };
}

interface PersonFormDialogProps {
  projectId: string;
  kind: PersonKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this person; status is then changed from the profile. */
  person?: Person;
}

export function PersonFormDialog({
  projectId,
  kind,
  open,
  onOpenChange,
  person,
}: PersonFormDialogProps) {
  const create = useCreatePerson();
  const update = useUpdatePerson();
  const [isEngagementOpen, setIsEngagementOpen] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFor(kind, person),
  });
  const contacts = useFieldArray({ control, name: "contacts" });
  const links = useFieldArray({ control, name: "links" });

  useEffect(() => {
    if (!open) return;
    reset(defaultsFor(kind, person));
    setIsEngagementOpen(false);
  }, [open, kind, person, reset]);

  const busy = create.isPending || update.isPending;
  const labels = personKindLabels[kind];

  const onSubmit = async (values: FormValues) => {
    const engagement = {
      roleOnProject: values.roleOnProject || null,
      startDate: values.startDate || null,
      contractStatus: values.contractStatus === NONE ? null : values.contractStatus,
      notes: values.engagementNotes || null,
    };
    try {
      if (person) {
        const input: UpdatePersonInput = {
          name: values.name,
          roleTitle: values.roleTitle,
          ...(kind === "producer"
            ? { company: values.company }
            : { creativeRoleType: values.creativeRoleType, agent: values.agent || null }),
          contacts: values.contacts,
          links: values.links,
          notes: values.notes || null,
          engagement,
          version: person.version,
        };
        await update.mutateAsync({ projectId, personId: person.id, input });
      } else {
        const common = {
          name: values.name,
          roleTitle: values.roleTitle,
          contacts: values.contacts,
          links: values.links,
          notes: values.notes || null,
          engagement,
          status: values.status === NONE ? null : values.status,
        };
        const input: CreatePersonInput =
          kind === "producer"
            ? { kind, company: values.company, ...common }
            : {
                kind,
                creativeRoleType: values.creativeRoleType,
                agent: values.agent || null,
                ...common,
              };
        await create.mutateAsync({ projectId, input });
      }
      onOpenChange(false);
    } catch {
      // Reported by the mutation hook; keep the form open.
    }
  };

  const statusValue = watch("status");
  const startDate = watch("startDate");
  const contractValue = watch("contractStatus");
  const engagementSummary = [
    person
      ? engagementStatusLabel(person.engagement.status)
      : statusValue === NONE
        ? null
        : engagementStatusLabels[statusValue],
    startDate ? `Start: ${startDate}` : null,
    contractValue !== NONE && contractValue !== "not_sent"
      ? `Contract: ${contractStatusLabels[contractValue]}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {person ? `Edit ${labels.singular} Profile` : `Add ${labels.singular} Profile`}
          </DialogTitle>
          <DialogDescription>
            {kind === "producer"
              ? "Add a producer or partner to the project team."
              : "Add a director, cast member or head of department."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="person-name">Full Name</Label>
              <Input id="person-name" {...register("name")} placeholder="e.g. Jane Doe" />
              {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
            </div>
            {kind === "producer" ? (
              <div className="space-y-2">
                <Label htmlFor="person-company">Company</Label>
                <Input id="person-company" {...register("company")} placeholder="e.g. Acme Productions" />
                {errors.company && <p className="text-destructive text-xs">{errors.company.message}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="person-role-type">Role Type</Label>
                <Controller
                  control={control}
                  name="creativeRoleType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="person-role-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {creativeRoleTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {creativeRoleTypeLabels[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}
          </div>

          <div className={kind === "creative" ? "grid grid-cols-2 gap-4" : "space-y-2"}>
            <div className="space-y-2">
              <Label htmlFor="person-role-title">
                {kind === "producer" ? "Role" : "Specific Role"}
              </Label>
              <Input
                id="person-role-title"
                {...register("roleTitle")}
                placeholder={kind === "producer" ? "e.g. Executive Producer" : "e.g. Director of Photography"}
              />
              {errors.roleTitle && <p className="text-destructive text-xs">{errors.roleTitle.message}</p>}
            </div>
            {kind === "creative" && (
              <div className="space-y-2">
                <Label htmlFor="person-agent">Agent / Rep (optional)</Label>
                <Input id="person-agent" {...register("agent")} placeholder="e.g. CAA" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Contact Details</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => contacts.append({ type: "Email", value: "" })}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Contact
              </Button>
            </div>
            {contacts.fields.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-start">
                <div className="w-1/3">
                  <Input
                    aria-label={`Contact ${index + 1} type`}
                    {...register(`contacts.${index}.type`)}
                    placeholder="Type (Email, Phone…)"
                  />
                  {errors.contacts?.[index]?.type && (
                    <p className="text-destructive text-xs">{errors.contacts[index]?.type?.message}</p>
                  )}
                </div>
                <div className="flex-1">
                  <Input
                    aria-label={`Contact ${index + 1} value`}
                    {...register(`contacts.${index}.value`)}
                    placeholder="Value"
                  />
                  {errors.contacts?.[index]?.value && (
                    <p className="text-destructive text-xs">{errors.contacts[index]?.value?.message}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove contact ${index + 1}`}
                  onClick={() => contacts.remove(index)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Links</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => links.append({ label: "IMDb", url: "" })}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Link
              </Button>
            </div>
            {links.fields.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-start">
                <div className="w-1/3">
                  <Input
                    aria-label={`Link ${index + 1} label`}
                    {...register(`links.${index}.label`)}
                    placeholder="Label (IMDb, Website…)"
                  />
                  {errors.links?.[index]?.label && (
                    <p className="text-destructive text-xs">{errors.links[index]?.label?.message}</p>
                  )}
                </div>
                <div className="flex-1">
                  <Input
                    aria-label={`Link ${index + 1} URL`}
                    {...register(`links.${index}.url`)}
                    placeholder="https://…"
                  />
                  {errors.links?.[index]?.url && (
                    <p className="text-destructive text-xs">{errors.links[index]?.url?.message}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove link ${index + 1}`}
                  onClick={() => links.remove(index)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="person-notes">Notes</Label>
            <Textarea
              id="person-notes"
              {...register("notes")}
              placeholder="Additional details…"
              className="min-h-[100px]"
            />
          </div>

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
                  <p className="text-xs text-muted-foreground">{engagementSummary || "Not set"}</p>
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
                <p className="text-xs text-muted-foreground mb-4">
                  Track project-specific hiring status and key dates.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="person-status">Status</Label>
                    {person ? (
                      <p id="person-status" className="text-sm py-2">
                        {engagementStatusLabel(person.engagement.status)}
                        <span className="block text-xs text-muted-foreground">
                          Change the status from the profile view.
                        </span>
                      </p>
                    ) : (
                      <Controller
                        control={control}
                        name="status"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger id="person-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Not set</SelectItem>
                              {engagementStatuses.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {engagementStatusLabels[status]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="person-role-on-project">Role on this project (optional)</Label>
                    <Input
                      id="person-role-on-project"
                      {...register("roleOnProject")}
                      placeholder={watch("roleTitle") || "Same as main role"}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="person-start-date">Start date</Label>
                    <Input id="person-start-date" type="date" {...register("startDate")} />
                    {errors.startDate && (
                      <p className="text-destructive text-xs">{errors.startDate.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="person-contract-status">Contract status</Label>
                    <Controller
                      control={control}
                      name="contractStatus"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="person-contract-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Not set</SelectItem>
                            {contractStatuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                {contractStatusLabels[status]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="person-engagement-notes">Engagement notes</Label>
                  <Textarea
                    id="person-engagement-notes"
                    {...register("engagementNotes")}
                    placeholder="Short context (deal terms, constraints, start conditions)…"
                    className="h-20"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save Profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
