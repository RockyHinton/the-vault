import { useState } from "react";
import { format } from "date-fns";
import type { Document, DocumentFolder, DocumentStatus } from "@shared/contracts";
import {
  Download,
  Eye,
  File,
  FileIcon,
  FileSpreadsheet,
  FileText,
  History,
  Image as ImageIcon,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { useCurrentUser, useIsStudioAdmin } from "@/features/auth/use-current-user";
import { useDeleteDocument, useDocuments } from "@/features/documents/use-documents";
import { documentFolders, folderLabel } from "@/features/documents/folders";
import { fileContentUrl } from "@/features/files/files-api";

interface DocumentLibraryProps {
  projectId: string;
  /** Fixed folder for embedded use; omit to browse every folder. */
  folder?: DocumentFolder;
}

const statusLabels: Record<DocumentStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  final: "Final",
  signed: "Signed",
};

function iconFor(mediaType: string) {
  if (mediaType === "application/pdf") return { Icon: FileText, color: "text-red-500 bg-red-500/10" };
  if (mediaType.includes("spreadsheet") || mediaType === "application/vnd.ms-excel" || mediaType === "text/csv")
    return { Icon: FileSpreadsheet, color: "text-green-500 bg-green-500/10" };
  if (mediaType.includes("wordprocessing") || mediaType === "application/msword")
    return { Icon: FileText, color: "text-blue-500 bg-blue-500/10" };
  if (mediaType.startsWith("image/")) return { Icon: ImageIcon, color: "text-purple-500 bg-purple-500/10" };
  return { Icon: File, color: "text-gray-500 bg-gray-500/10" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const inlineViewable = (mediaType: string) =>
  mediaType === "application/pdf" || mediaType.startsWith("image/");

/**
 * Real document library over the Documents domain. Every row is a current
 * version; earlier versions stay reachable through "New version" history on
 * the server. Bytes are fetched through the authenticated content endpoint.
 */
export default function DocumentLibrary({ projectId, folder }: DocumentLibraryProps) {
  const [folderFilter, setFolderFilter] = useState<DocumentFolder | "all">("all");
  const activeFolder = folder ?? (folderFilter === "all" ? undefined : folderFilter);
  const documents = useDocuments(projectId, activeFolder);
  const remove = useDeleteDocument();
  const isStudioAdmin = useIsStudioAdmin();
  const { data: me } = useCurrentUser();
  const [filter, setFilter] = useState("");
  const [toDelete, setToDelete] = useState<Document | null>(null);

  const items = (documents.data?.data.items ?? []).filter((doc) => {
    const q = filter.trim().toLowerCase();
    return !q || doc.title.toLowerCase().includes(q) || doc.file.originalFilename.toLowerCase().includes(q);
  });
  const canManage = (doc: Document) => isStudioAdmin || doc.createdBy.id === me?.data.user.id;
  const uploadButton = (
    <DocumentUploadDialog projectId={projectId} mode={{ kind: "create", folder }}>
      <Button size="sm" className="h-9">
        <Upload className="mr-2 h-4 w-4" />
        Upload Document
      </Button>
    </DocumentUploadDialog>
  );

  if (documents.isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading documents…</p>;
  }
  if (documents.isError) {
    return <p className="text-sm text-destructive py-8 text-center">Documents could not be loaded.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 bg-card p-2 rounded-lg border border-border">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter documents..."
              aria-label="Filter documents"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9 bg-secondary/50 border-transparent focus:border-primary/20 h-9"
            />
          </div>
          {!folder && (
            <Select value={folderFilter} onValueChange={(value) => setFolderFilter(value as DocumentFolder | "all")}>
              <SelectTrigger className="h-9 w-[240px]" aria-label="Folder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All folders</SelectItem>
                {documentFolders.map((f) => (
                  <SelectItem key={f} value={f}>{folderLabel(f)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {uploadButton}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl bg-secondary/5 text-center">
          <div className="h-16 w-16 bg-secondary/20 rounded-full flex items-center justify-center mb-4">
            <FileIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No documents yet</h3>
          <p className="text-muted-foreground max-w-sm mt-2">
            {filter ? "Nothing matches your filter." : "This folder is empty. Upload a document to get started."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/30">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="w-[36%]">Name</TableHead>
                {!folder && <TableHead>Folder</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((doc) => {
                const { Icon, color } = iconFor(doc.file.mediaType);
                return (
                  <TableRow key={doc.id} className="group hover:bg-secondary/20 border-border transition-colors" data-testid={`document-row-${doc.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">{doc.title}</div>
                          <div className="text-xs text-muted-foreground truncate" title={doc.file.sha256}>
                            {doc.file.originalFilename}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    {!folder && <TableCell className="text-sm text-muted-foreground">{folderLabel(doc.folder)}</TableCell>}
                    <TableCell>
                      <Badge
                        variant={doc.status === "final" || doc.status === "signed" ? "default" : "secondary"}
                        className={doc.status === "final" || doc.status === "signed" ? "bg-green-500/20 text-green-500 hover:bg-green-500/30 border-transparent" : ""}
                      >
                        {statusLabels[doc.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">{formatBytes(doc.file.byteSize)}</TableCell>
                    <TableCell>
                      <span className="bg-secondary text-secondary-foreground text-xs font-mono px-2 py-0.5 rounded-full">v{doc.versionNumber}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <div>{format(new Date(doc.createdAt), "MMM d, yyyy h:mm a")}</div>
                      <div className="text-xs">{doc.createdBy.displayName ?? doc.createdBy.email}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {inlineViewable(doc.file.mediaType) && (
                          <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <a href={fileContentUrl(doc.file.id, "inline")} target="_blank" rel="noreferrer" aria-label={`View ${doc.title}`}>
                              <Eye className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <a href={fileContentUrl(doc.file.id)} download={doc.file.originalFilename} aria-label={`Download ${doc.title}`}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <DocumentUploadDialog projectId={projectId} mode={{ kind: "version", document: doc }}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label={`New version of ${doc.title}`}>
                            <History className="h-4 w-4" />
                          </Button>
                        </DocumentUploadDialog>
                        {canManage(doc) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setToDelete(doc)} aria-label={`Delete ${doc.title}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.title}" and all of its versions will be removed from the library. Stored files are retained for provenance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) remove.mutate({ projectId, documentId: toDelete.id, version: toDelete.version });
                setToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
