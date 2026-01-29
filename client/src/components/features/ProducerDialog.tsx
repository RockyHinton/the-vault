import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, X, ChevronDown, ChevronRight, Briefcase } from "lucide-react";
import { useStore, ProducerProfile } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const contactSchema = z.object({
  type: z.string().min(1, "Type is required"),
  value: z.string().min(1, "Value is required"),
});

const linkSchema = z.object({
  label: z.string().min(1, "Label is required"),
  url: z.string().url("Must be a valid URL"),
});

const engagementSchema = z.object({
  status: z.enum(['Identified', 'Contacted', 'Interested', 'Offered', 'Confirmed', 'Contracted', 'Attached', 'Unavailable / Passed', '']),
  roleOnProject: z.string().optional(),
  startDate: z.string().optional(),
  contractStatus: z.enum(['Not sent', 'Sent', 'Signed', 'Pending amendments', '']),
  notes: z.string().optional(),
});

const producerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().min(1, "Company is required"),
  role: z.string().min(1, "Role is required"),
  notes: z.string().optional(),
  contactDetails: z.array(contactSchema),
  links: z.array(linkSchema),
  engagement: engagementSchema.optional(),
});

type ProducerFormValues = z.infer<typeof producerSchema>;

interface ProducerDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  existingProfile?: ProducerProfile;
}

export function ProducerDialog({ projectId, isOpen, onClose, existingProfile }: ProducerDialogProps) {
  const { addProducerProfile, updateProducerProfile } = useStore();
  const [isEngagementOpen, setIsEngagementOpen] = useState(false);
  
  const defaultValues: ProducerFormValues = existingProfile ? {
    name: existingProfile.name,
    company: existingProfile.company,
    role: existingProfile.role,
    notes: existingProfile.notes,
    contactDetails: existingProfile.contactDetails.map(c => ({ type: c.type, value: c.value })),
    links: existingProfile.links.map(l => ({ label: l.label, url: l.url })),
    engagement: existingProfile.engagement || {
      status: 'Identified',
      roleOnProject: existingProfile.role, // Prefill with existing role
      startDate: '',
      contractStatus: '',
      notes: ''
    }
  } : {
    name: "",
    company: "",
    role: "",
    notes: "",
    contactDetails: [{ type: "Email", value: "" }],
    links: [],
    engagement: {
      status: 'Identified',
      roleOnProject: '',
      startDate: '',
      contractStatus: '',
      notes: ''
    }
  };

  const { register, control, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<ProducerFormValues>({
    resolver: zodResolver(producerSchema),
    defaultValues
  });

  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray({
    control,
    name: "contactDetails"
  });

  const { fields: linkFields, append: appendLink, remove: removeLink } = useFieldArray({
    control,
    name: "links"
  });

  const onSubmit = (data: ProducerFormValues) => {
    const formattedData = {
      ...data,
      notes: data.notes || "",
      contactDetails: data.contactDetails.map((c, i) => ({ ...c, id: existingProfile?.contactDetails[i]?.id || `cd-${Date.now()}-${i}` })),
      links: data.links.map((l, i) => ({ ...l, id: existingProfile?.links[i]?.id || `l-${Date.now()}-${i}` })),
      engagement: data.engagement
    };

    if (existingProfile) {
      updateProducerProfile(existingProfile.id, formattedData);
    } else {
      addProducerProfile({
        ...formattedData,
        projectId
      });
    }
    reset();
    onClose();
  };

  // Reset form when dialog opens/closes or profile changes
  useState(() => {
    if (isOpen) {
      reset(defaultValues);
      setIsEngagementOpen(false); // Reset collapse state
    }
  });

  const engagementValues = watch("engagement");

  // Helper to generate summary string
  const getEngagementSummary = () => {
    if (!engagementValues) return "Not set";
    const parts = [];
    if (engagementValues.status && engagementValues.status !== 'Not approached') parts.push(engagementValues.status);
    if (engagementValues.startDate) parts.push(`Start: ${engagementValues.startDate}`);
    if (engagementValues.contractStatus && engagementValues.contractStatus !== 'Not sent') parts.push(`Contract: ${engagementValues.contractStatus}`);
    
    return parts.length > 0 ? parts.join(" · ") : "Not set";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingProfile ? "Edit Producer Profile" : "Add Producer Profile"}</DialogTitle>
          <DialogDescription>
            Add a new producer or partner to the project team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" {...register("name")} placeholder="e.g. Jane Doe" />
              {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" {...register("company")} placeholder="e.g. Acme Productions" />
              {errors.company && <p className="text-destructive text-xs">{errors.company.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Input id="role" {...register("role")} placeholder="e.g. Executive Producer" />
            {errors.role && <p className="text-destructive text-xs">{errors.role.message}</p>}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Contact Details</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => appendContact({ type: "Email", value: "" })}>
                <Plus className="h-3 w-3 mr-1" /> Add Contact
              </Button>
            </div>
            {contactFields.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-start">
                <div className="w-1/3">
                  <Input {...register(`contactDetails.${index}.type`)} placeholder="Type (Email, Phone...)" />
                  {errors.contactDetails?.[index]?.type && <p className="text-destructive text-xs">{errors.contactDetails[index]?.type?.message}</p>}
                </div>
                <div className="flex-1">
                  <Input {...register(`contactDetails.${index}.value`)} placeholder="Value" />
                  {errors.contactDetails?.[index]?.value && <p className="text-destructive text-xs">{errors.contactDetails[index]?.value?.message}</p>}
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeContact(index)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Links</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => appendLink({ label: "IMDb", url: "" })}>
                <Plus className="h-3 w-3 mr-1" /> Add Link
              </Button>
            </div>
            {linkFields.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-start">
                <div className="w-1/3">
                  <Input {...register(`links.${index}.label`)} placeholder="Label (IMDb, Website...)" />
                  {errors.links?.[index]?.label && <p className="text-destructive text-xs">{errors.links[index]?.label?.message}</p>}
                </div>
                <div className="flex-1">
                  <Input {...register(`links.${index}.url`)} placeholder="https://..." />
                  {errors.links?.[index]?.url && <p className="text-destructive text-xs">{errors.links[index]?.url?.message}</p>}
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLink(index)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} placeholder="Additional details..." className="min-h-[100px]" />
          </div>

          {/* Project Engagement Section */}
          <div className="border border-border/60 rounded-lg overflow-hidden bg-card/50">
            <div 
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors"
              onClick={() => setIsEngagementOpen(!isEngagementOpen)}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Project Engagement</h3>
                </div>
                {!isEngagementOpen && (
                  <p className="text-xs text-muted-foreground">{getEngagementSummary()}</p>
                )}
              </div>
              {isEngagementOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>

            {isEngagementOpen && (
              <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                <Separator className="mb-4" />
                <p className="text-xs text-muted-foreground mb-4">Track project-specific hiring status and key dates.</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="eng-status">Status</Label>
                    <Select 
                      onValueChange={(val) => setValue("engagement.status", val as any)} 
                      defaultValue={engagementValues?.status}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Identified">Identified</SelectItem>
                        <SelectItem value="Contacted">Contacted</SelectItem>
                        <SelectItem value="Interested">Interested</SelectItem>
                        <SelectItem value="Offered">Offered</SelectItem>
                        <SelectItem value="Confirmed">Confirmed</SelectItem>
                        <SelectItem value="Contracted">Contracted</SelectItem>
                        <SelectItem value="Attached">Attached</SelectItem>
                        <SelectItem value="Unavailable / Passed">Unavailable / Passed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="eng-role">Role on this project (optional)</Label>
                    <Input id="eng-role" {...register("engagement.roleOnProject")} placeholder={watch("role") || "Same as main role"} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                    <Label htmlFor="eng-start">Start date</Label>
                    <Input id="eng-start" type="date" {...register("engagement.startDate")} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="eng-contract">Contract status</Label>
                     <Select 
                      onValueChange={(val) => setValue("engagement.contractStatus", val as any)} 
                      defaultValue={engagementValues?.contractStatus}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Not sent">Not sent</SelectItem>
                        <SelectItem value="Sent">Sent</SelectItem>
                        <SelectItem value="Signed">Signed</SelectItem>
                        <SelectItem value="Pending amendments">Pending amendments</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="eng-notes">Engagement notes</Label>
                  <Textarea 
                    id="eng-notes" 
                    {...register("engagement.notes")} 
                    placeholder="Short context (deal terms, constraints, start conditions)..." 
                    className="h-20"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save Profile</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
