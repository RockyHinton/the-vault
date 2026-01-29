import { useMemo, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, Globe, ExternalLink, Trash2, Edit, User, Clapperboard, Star, HardHat, Briefcase, ChevronDown, ChevronRight, FileText, Plus, X, AlertCircle } from "lucide-react";
import { CreativeProfile, ProfileDocument, ProfileDocumentType, ProfileDocumentStatus, useStore } from "@/lib/store";
import { CreativeDialog } from "./CreativeDialog";
import { cn } from "@/lib/utils";

const isBlobUrl = (url?: string) => {
  return !!url && url.startsWith("blob:");
};

interface CreativeDetailsDialogProps {
  profile: CreativeProfile;
  isOpen: boolean;
  onClose: () => void;
}

export function CreativeDetailsDialog({ profile, isOpen, onClose }: CreativeDetailsDialogProps) {
  const { deleteCreativeProfile, updateCreativeProfile } = useStore();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEngagementOpen, setIsEngagementOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [deleteDocConfirmOpen, setDeleteDocConfirmOpen] = useState(false);
  const [docIdPendingDelete, setDocIdPendingDelete] = useState<string | null>(null);

  const [newDocFileName, setNewDocFileName] = useState("");
  const [newDocType, setNewDocType] = useState<ProfileDocumentType>("Agreement");
  const [newDocStatus, setNewDocStatus] = useState<ProfileDocumentStatus>("Draft");
  const [newDocFileUrl, setNewDocFileUrl] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  const docs = profile.profileDocuments || [];

  const visibleStatus = useMemo(() => {
    const s = profile.engagement?.status;
    if (!s) return "Not set";
    return s;
  }, [profile.engagement?.status]);

  const attentionReasons = useMemo(() => {
    const reasons: string[] = [];
    const status = profile.engagement?.status || "";
    const contractStatus = profile.engagement?.contractStatus || "";

    if ((status === "Offered" || status === "Confirmed" || status === "Contracted" || status === "Attached") && contractStatus && contractStatus !== "Signed") {
      reasons.push("Contract pending");
    }

    const hasApprovedOrSigned = docs.some((d) => d.status === "Approved" || d.status === "Signed");
    if (!hasApprovedOrSigned) reasons.push("Missing docs");

    const needsApproval = status !== "Contracted" && status !== "Attached" && status !== "Unavailable / Passed";
    if (needsApproval) reasons.push("Needs approval");

    return reasons;
  }, [docs, profile.engagement?.contractStatus, profile.engagement?.status]);

  const statusBadgeVariant = useMemo(() => {
    if (visibleStatus === "Contracted" || visibleStatus === "Attached") return "default" as const;
    if (visibleStatus === "Unavailable / Passed") return "destructive" as const;
    if (visibleStatus === "Offered" || visibleStatus === "Confirmed" || visibleStatus === "Interested") return "secondary" as const;
    return "outline" as const;
  }, [visibleStatus]);

  const engagementSummary = useMemo(() => {
    const e = profile.engagement;
    if (!e) return "Not set";

    const parts: string[] = [];
    if (e.status) parts.push(e.status);
    if (e.startDate) parts.push(`Start: ${e.startDate}`);
    if (e.contractStatus) parts.push(`Contract: ${e.contractStatus}`);

    return parts.length ? parts.join(" · ") : "Not set";
  }, [profile.engagement]);

  const docsSummary = useMemo(() => {
    return docs.length > 0 ? `Documents: ${docs.length}` : "No documents";
  }, [docs.length]);

  const handleAddDocument = () => {
    const fileName = (selectedFile?.name || newDocFileName).trim();
    if (!fileName) return;

    const objectUrl = selectedFile ? URL.createObjectURL(selectedFile) : undefined;
    const fileUrl = newDocFileUrl.trim() || objectUrl;

    const nextDoc: ProfileDocument = {
      id: `pd-${Date.now()}`,
      fileName,
      docType: newDocType,
      status: newDocStatus,
      uploadedAt: new Date().toISOString(),
      fileUrl,
    };

    updateCreativeProfile(profile.id, {
      profileDocuments: [...docs, nextDoc],
    });

    setNewDocFileName("");
    setNewDocType("Agreement");
    setNewDocStatus("Draft");
    setNewDocFileUrl("");
    setSelectedFile(null);
    setIsAddDocOpen(false);
    setIsDocsOpen(true);
  };

  const requestDeleteDocument = (docId: string) => {
    setDocIdPendingDelete(docId);
    setDeleteDocConfirmOpen(true);
  };

  const confirmDeleteDocument = () => {
    if (!docIdPendingDelete) return;
    updateCreativeProfile(profile.id, {
      profileDocuments: docs.filter(d => d.id !== docIdPendingDelete),
    });
    setDeleteDocConfirmOpen(false);
    setDocIdPendingDelete(null);
  };

  const docPendingDelete = useMemo(() => {
    if (!docIdPendingDelete) return null;
    return docs.find(d => d.id === docIdPendingDelete) || null;
  }, [docIdPendingDelete, docs]);

  const handleUpdateDocMeta = (docId: string, patch: Partial<ProfileDocument>) => {
    updateCreativeProfile(profile.id, {
      profileDocuments: docs.map(d => (d.id === docId ? { ...d, ...patch } : d)),
    });
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
            <div className="relative pr-10">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-2xl pr-2">{profile.name}</DialogTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                    <div className="flex items-center">
                      {getRoleIcon(profile.roleType)}
                      <span className="font-medium truncate">{profile.specificRole}</span>
                    </div>

                    {attentionReasons.length > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              data-testid="status-attention-creative-header"
                              className="h-6 w-6 rounded-md border border-destructive/30 bg-destructive/10 text-destructive flex items-center justify-center"
                            >
                              <AlertCircle className="h-3.5 w-3.5" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            Needs attention: {attentionReasons.join(" · ")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    <Badge
                      data-testid="badge-creative-status"
                      variant={statusBadgeVariant}
                      className="text-xs font-normal bg-background/50"
                    >
                      {visibleStatus}
                    </Badge>

                    <Badge
                      variant={
                        profile.roleType === 'Director'
                          ? 'default'
                          : profile.roleType === 'Cast'
                            ? 'secondary'
                            : 'outline'
                      }
                      className="text-xs font-normal"
                    >
                      {profile.roleType}
                    </Badge>
                  </div>
                </div>
              </div>
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

            {/* Project Engagement (read-only) */}
            <div className="border border-border/60 rounded-lg overflow-hidden bg-card/50">
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => setIsEngagementOpen(v => !v)}
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
              </div>

              {isEngagementOpen && (
                <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                  <Separator className="mb-4" />
                  <p className="text-xs text-muted-foreground">Track project-specific hiring status and key dates.</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">Status</div>
                      <div className="text-sm">{profile.engagement?.status || "Not set"}</div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">Role on this project</div>
                      <div className="text-sm">{profile.engagement?.roleOnProject || profile.specificRole || "Not set"}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">Start date</div>
                      <div className="text-sm">{profile.engagement?.startDate || "Not set"}</div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">Contract status</div>
                      <div className="text-sm">{profile.engagement?.contractStatus || "Not set"}</div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">Engagement notes</div>
                    <div className="text-sm whitespace-pre-wrap rounded-md border border-border/50 bg-secondary/10 p-3">{profile.engagement?.notes || "Not set"}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Documents */}
            <div className="border border-border/60 rounded-lg overflow-hidden bg-card/50">
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => setIsDocsOpen(v => !v)}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Documents</h3>
                  </div>
                  {!isDocsOpen && (
                    <p className="text-xs text-muted-foreground">{docsSummary}</p>
                  )}
                </div>
                {isDocsOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {isDocsOpen && (
                <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                  <Separator className="mb-4" />

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Attach documents to this profile (design mode).</p>
                    <Button size="sm" variant="secondary" onClick={() => setIsAddDocOpen(true)} data-testid="button-upload-profile-document">
                      <Plus className="h-4 w-4 mr-2" />
                      Upload Document
                    </Button>
                  </div>

                  {docs.length === 0 ? (
                    <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 bg-background/30">
                      No documents yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {docs.map((doc) => (
                        <div key={doc.id} className="rounded-lg border border-border/60 bg-background/30 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate" data-testid={`text-doc-filename-${doc.id}`}>{doc.fileName}</div>
                              <div className="text-xs text-muted-foreground mt-1">Uploaded {new Date(doc.uploadedAt).toLocaleString()}</div>
                              {doc.fileUrl ? (
                                <a
                                  href={doc.fileUrl}
                                  download
                                  target={isBlobUrl(doc.fileUrl) ? undefined : "_blank"}
                                  rel={isBlobUrl(doc.fileUrl) ? undefined : "noopener noreferrer"}
                                  className="mt-1 inline-flex text-xs text-primary hover:underline"
                                  data-testid={`link-doc-download-${doc.id}`}
                                >
                                  Download
                                </a>
                              ) : (
                                <div className="mt-1 text-xs text-muted-foreground" data-testid={`text-doc-nofile-${doc.id}`}>No file attached</div>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => requestDeleteDocument(doc.id)}
                              data-testid={`button-delete-doc-${doc.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <div className="text-xs font-medium text-muted-foreground">Document type</div>
                              <Select
                                value={doc.docType}
                                onValueChange={(val) => handleUpdateDocMeta(doc.id, { docType: val as ProfileDocumentType })}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Agreement">Agreement</SelectItem>
                                  <SelectItem value="Deal Memo">Deal Memo</SelectItem>
                                  <SelectItem value="ID / KYC">ID / KYC</SelectItem>
                                  <SelectItem value="NDA">NDA</SelectItem>
                                  <SelectItem value="Release">Release</SelectItem>
                                  <SelectItem value="Contract Amendment">Contract Amendment</SelectItem>
                                  <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1.5">
                              <div className="text-xs font-medium text-muted-foreground">Status</div>
                              <Select
                                value={doc.status}
                                onValueChange={(val) => handleUpdateDocMeta(doc.id, { status: val as ProfileDocumentStatus })}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Draft">Draft</SelectItem>
                                  <SelectItem value="Pending">Pending</SelectItem>
                                  <SelectItem value="Signed">Signed</SelectItem>
                                  <SelectItem value="Approved">Approved</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              className="px-2 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              data-testid="button-delete-profile"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Profile
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} data-testid="button-close-profile">Close</Button>
              <Button onClick={() => setIsEditOpen(true)} data-testid="button-edit-profile">
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
            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the profile from the project.
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

      <AlertDialog open={deleteDocConfirmOpen} onOpenChange={setDeleteDocConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{docPendingDelete?.fileName || 'this document'}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDocument}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-doc"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isAddDocOpen} onOpenChange={setIsAddDocOpen}>
        <AlertDialogContent data-testid="dialog-add-profile-document" className="sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Upload document</AlertDialogTitle>
            <AlertDialogDescription>
              Add a document to this profile (design mode only).
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="doc-file">File</Label>
              <Input
                id="doc-file"
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedFile(file);
                  if (file) {
                    setNewDocFileName(file.name);
                  }
                }}
                data-testid="input-doc-file"
              />
              <p className="text-xs text-muted-foreground">
                This is a real device file picker. In design mode we store a temporary link; later this will upload to storage.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-file-name">File name (optional override)</Label>
              <Input
                id="doc-file-name"
                value={newDocFileName}
                onChange={(e) => setNewDocFileName(e.target.value)}
                placeholder={selectedFile?.name || "e.g. Deal_Memo_v2.pdf"}
                data-testid="input-doc-file-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-file-url">File URL (future storage path)</Label>
              <Input
                id="doc-file-url"
                value={newDocFileUrl}
                onChange={(e) => setNewDocFileUrl(e.target.value)}
                placeholder="https://... (leave blank for now)"
                data-testid="input-doc-file-url"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Document type</Label>
                <Select value={newDocType} onValueChange={(val) => setNewDocType(val as ProfileDocumentType)}>
                  <SelectTrigger data-testid="select-doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Agreement">Agreement</SelectItem>
                    <SelectItem value="Deal Memo">Deal Memo</SelectItem>
                    <SelectItem value="ID / KYC">ID / KYC</SelectItem>
                    <SelectItem value="NDA">NDA</SelectItem>
                    <SelectItem value="Release">Release</SelectItem>
                    <SelectItem value="Contract Amendment">Contract Amendment</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={newDocStatus} onValueChange={(val) => setNewDocStatus(val as ProfileDocumentStatus)}>
                  <SelectTrigger data-testid="select-doc-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Signed">Signed</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-add-doc">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAddDocument}
              className={cn(!(selectedFile || newDocFileName.trim()) ? "pointer-events-none opacity-50" : "")}
              data-testid="button-save-add-doc"
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
