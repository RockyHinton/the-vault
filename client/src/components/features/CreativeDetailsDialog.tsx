import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
import { Mail, Phone, Globe, ExternalLink, Trash2, Edit, User, Clapperboard, Star, HardHat } from "lucide-react";
import { CreativeProfile, useStore } from "@/lib/store";
import { CreativeDialog } from "./CreativeDialog";

interface CreativeDetailsDialogProps {
  profile: CreativeProfile;
  isOpen: boolean;
  onClose: () => void;
}

export function CreativeDetailsDialog({ profile, isOpen, onClose }: CreativeDetailsDialogProps) {
  const { deleteCreativeProfile } = useStore();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteCreativeProfile(profile.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  const getIconForType = (type: string) => {
    const lower = type.toLowerCase();
    if (lower.includes('mail')) return <Mail className="h-4 w-4" />;
    if (lower.includes('phone') || lower.includes('cell') || lower.includes('mobile')) return <Phone className="h-4 w-4" />;
    return <User className="h-4 w-4" />;
  };

  const getRoleIcon = (roleType: string) => {
    switch(roleType) {
      case 'Director': return <Clapperboard className="h-4 w-4 mr-1.5" />;
      case 'Cast': return <Star className="h-4 w-4 mr-1.5" />;
      case 'Head of Department': return <HardHat className="h-4 w-4 mr-1.5" />;
      default: return <User className="h-4 w-4 mr-1.5" />;
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <DialogTitle className="text-2xl">{profile.name}</DialogTitle>
                <div className="flex items-center text-muted-foreground">
                  {getRoleIcon(profile.roleType)}
                  <span className="font-medium">{profile.specificRole}</span>
                </div>
              </div>
              <Badge variant={
                profile.roleType === 'Director' ? 'default' : 
                profile.roleType === 'Cast' ? 'secondary' : 'outline'
              } className="text-sm font-normal">
                {profile.roleType}
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Agent Info */}
            {profile.agent && (
              <div className="p-3 bg-secondary/10 rounded-md border border-border/50 flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Rep:</span>
                <span className="font-medium text-sm">{profile.agent}</span>
              </div>
            )}

            {/* Contact Details */}
            {profile.contactDetails.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Contact</h4>
                <div className="grid gap-2">
                  {profile.contactDetails.map((contact) => (
                    <div key={contact.id} className="flex items-center gap-3 p-2 rounded-md bg-secondary/10 border border-border/50">
                      <div className="p-2 rounded-full bg-background border border-border text-primary">
                        {getIconForType(contact.type)}
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

            {/* Links */}
            {profile.links.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Links</h4>
                <div className="flex flex-wrap gap-2">
                  {profile.links.map((link) => (
                    <a 
                      key={link.id} 
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

            {/* Notes */}
            {profile.notes && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
                <div className="bg-secondary/10 p-3 rounded-lg border border-border/50 text-sm leading-relaxed whitespace-pre-wrap">
                  {profile.notes}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between sm:gap-0">
            <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Profile
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => setIsEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreativeDialog
        projectId={profile.projectId}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        existingProfile={profile}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Creative Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the profile for {profile.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
