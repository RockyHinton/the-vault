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
import { Plus, Trash2, X } from "lucide-react";
import { useStore, CreativeProfile, CreativeRoleType } from "@/lib/store";

const contactSchema = z.object({
  type: z.string().min(1, "Type is required"),
  value: z.string().min(1, "Value is required"),
});

const linkSchema = z.object({
  label: z.string().min(1, "Label is required"),
  url: z.string().url("Must be a valid URL"),
});

const creativeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  roleType: z.enum(['Director', 'Cast', 'Head of Department']),
  specificRole: z.string().min(1, "Specific Role is required"),
  agent: z.string().optional(),
  notes: z.string().optional(),
  contactDetails: z.array(contactSchema),
  links: z.array(linkSchema),
});

type CreativeFormValues = z.infer<typeof creativeSchema>;

interface CreativeDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  existingProfile?: CreativeProfile;
}

export function CreativeDialog({ projectId, isOpen, onClose, existingProfile }: CreativeDialogProps) {
  const { addCreativeProfile, updateCreativeProfile } = useStore();
  
  const defaultValues: CreativeFormValues = existingProfile ? {
    name: existingProfile.name,
    roleType: existingProfile.roleType,
    specificRole: existingProfile.specificRole,
    agent: existingProfile.agent || "",
    notes: existingProfile.notes,
    contactDetails: existingProfile.contactDetails.map(c => ({ type: c.type, value: c.value })),
    links: existingProfile.links.map(l => ({ label: l.label, url: l.url })),
  } : {
    name: "",
    roleType: "Director",
    specificRole: "",
    agent: "",
    notes: "",
    contactDetails: [{ type: "Agent Email", value: "" }],
    links: [],
  };

  const { register, control, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<CreativeFormValues>({
    resolver: zodResolver(creativeSchema),
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

  const onSubmit = (data: CreativeFormValues) => {
    const formattedData = {
      ...data,
      agent: data.agent || undefined,
      notes: data.notes || "",
      contactDetails: data.contactDetails.map((c, i) => ({ ...c, id: existingProfile?.contactDetails[i]?.id || `cd-${Date.now()}-${i}` })),
      links: data.links.map((l, i) => ({ ...l, id: existingProfile?.links[i]?.id || `l-${Date.now()}-${i}` })),
    };

    if (existingProfile) {
      updateCreativeProfile(existingProfile.id, formattedData);
    } else {
      addCreativeProfile({
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
    }
  });

  const selectedRoleType = watch("roleType");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingProfile ? "Edit Creative Profile" : "Add Creative Profile"}</DialogTitle>
          <DialogDescription>
            Add a new director, cast member, or head of department to the project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" {...register("name")} placeholder="e.g. John Smith" />
              {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="roleType">Category</Label>
               <Select 
                 onValueChange={(val) => setValue("roleType", val as CreativeRoleType)} 
                 defaultValue={selectedRoleType}
               >
                <SelectTrigger>
                  <SelectValue placeholder="Select role type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Director">Director</SelectItem>
                  <SelectItem value="Cast">Cast</SelectItem>
                  <SelectItem value="Head of Department">Head of Department</SelectItem>
                </SelectContent>
              </Select>
              {errors.roleType && <p className="text-destructive text-xs">{errors.roleType.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label htmlFor="specificRole">Specific Role</Label>
              <Input id="specificRole" {...register("specificRole")} placeholder="e.g. Lead Actor, DoP, Stunt Coordinator" />
              {errors.specificRole && <p className="text-destructive text-xs">{errors.specificRole.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent">Agent / Rep (Optional)</Label>
              <Input id="agent" {...register("agent")} placeholder="e.g. CAA, WME" />
            </div>
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
            <Textarea id="notes" {...register("notes")} placeholder="Additional details, casting notes, etc." className="min-h-[100px]" />
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
