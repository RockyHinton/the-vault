import { useStore, Document } from "@/lib/store";
import { format } from "date-fns";
import { Link } from "wouter";
import { 
  FileText, 
  File, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  Download, 
  MoreHorizontal,
  Eye,
  Clock,
  Share2,
  Trash2,
  FileIcon,
  Search,
  Filter
} from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareDialog } from "@/components/features/ShareDialog";
import { UploadDocumentDialog } from "@/components/features/UploadDocumentDialog";

interface DocumentLibraryProps {
  projectId: string;
  categoryId?: string;
  subcategoryId?: string;
}

const fileIcons: Record<string, any> = {
  PDF: FileText,
  XLSX: FileSpreadsheet,
  DOCX: FileText,
  IMG: ImageIcon,
  OTHER: File,
};

const fileColors: Record<string, string> = {
  PDF: "text-red-500 bg-red-500/10",
  XLSX: "text-green-500 bg-green-500/10",
  DOCX: "text-blue-500 bg-blue-500/10",
  IMG: "text-purple-500 bg-purple-500/10",
  OTHER: "text-gray-500 bg-gray-500/10",
};

export default function DocumentLibrary({ projectId, categoryId, subcategoryId }: DocumentLibraryProps) {
  const { getProjectDocuments, deleteDocument } = useStore();
  const documents = getProjectDocuments(projectId, categoryId, subcategoryId);

  const getFileIcon = (type: string) => {
    const Icon = fileIcons[type] || File;
    return Icon;
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl bg-secondary/5 text-center">
        <div className="h-16 w-16 bg-secondary/20 rounded-full flex items-center justify-center mb-4">
          <FileIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">No documents yet</h3>
        <p className="text-muted-foreground max-w-sm mt-2 mb-6">
          This folder is empty. Upload a document to get started.
        </p>
        <UploadDocumentDialog 
          projectId={projectId} 
          defaultCategoryId={categoryId} 
          defaultSubcategoryId={subcategoryId}
        >
          <Button variant="outline">Upload File</Button>
        </UploadDocumentDialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 bg-card p-2 rounded-lg border border-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Filter documents..." 
            className="pl-9 bg-secondary/50 border-transparent focus:border-primary/20 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[40%]">Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc, index) => {
              const Icon = getFileIcon(doc.type);
              const colorClass = fileColors[doc.type] || fileColors.OTHER;

              return (
                <TableRow key={doc.id} className="group hover:bg-secondary/20 border-border transition-colors">
                  <TableCell className="font-medium">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="flex items-center gap-3 cursor-pointer">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {doc.title}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {doc.tags.map(tag => (
                                <span key={tag} className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-sm">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80 p-0 border-border bg-popover shadow-2xl overflow-hidden" align="start" sideOffset={8}>
                        {/* Mock Preview Content */}
                        <div className="relative h-32 bg-secondary/50 flex items-center justify-center border-b border-border">
                           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] opacity-10"></div>
                           <Icon className="h-12 w-12 text-muted-foreground/50" />
                           <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                             Preview
                           </div>
                        </div>
                        <div className="p-4 space-y-3">
                           <div className="space-y-1">
                             <h4 className="text-sm font-semibold text-foreground">Document Metadata</h4>
                             <p className="text-xs text-muted-foreground">Quick glance details for this file.</p>
                           </div>
                           <div className="grid grid-cols-2 gap-2 text-xs">
                             <div className="bg-secondary/30 p-2 rounded">
                               <span className="block text-muted-foreground mb-1">Uploaded By</span>
                               <span className="font-medium text-foreground">{doc.uploadedBy}</span>
                             </div>
                             <div className="bg-secondary/30 p-2 rounded">
                               <span className="block text-muted-foreground mb-1">Date</span>
                               <span className="font-medium text-foreground">{format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</span>
                             </div>
                             <div className="bg-secondary/30 p-2 rounded col-span-2">
                               <span className="block text-muted-foreground mb-1">Synopsis/Notes</span>
                               <span className="font-medium text-foreground line-clamp-2">
                                 This is the latest locked version ready for distribution review. Please sign off by EOD.
                               </span>
                             </div>
                           </div>
                           <Button className="w-full h-8 text-xs bg-primary/10 text-primary hover:bg-primary/20 border-transparent shadow-none">
                             View Full Details
                           </Button>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </TableCell>
                  <TableCell>
                    <Badge variant={doc.status === 'Final' ? 'default' : 'secondary'} className={doc.status === 'Final' ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30 border-transparent' : ''}>
                      {doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono">{doc.fileSize}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                       <span className="bg-secondary text-secondary-foreground text-xs font-mono px-2 py-0.5 rounded-full">v{doc.version}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(doc.uploadedAt), 'MMM d, h:mm a')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => window.open(doc.filePath, '_blank')}>
                         <Eye className="h-4 w-4" />
                       </Button>
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => {
                         // Mock download
                         const link = document.createElement('a');
                         link.href = doc.filePath;
                         link.download = doc.title;
                         link.click();
                       }}>
                         <Download className="h-4 w-4" />
                       </Button>
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteDocument(doc.id)}>
                         <Trash2 className="h-4 w-4" />
                       </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
