import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Upload, File, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadDocumentDialogProps {
  projectId: string;
  defaultCategoryId?: string;
  nextVersion?: number;
  children?: React.ReactNode;
}

export function UploadDocumentDialog({ 
  projectId, 
  defaultCategoryId, 
  nextVersion,
  children 
}: UploadDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState(defaultCategoryId || "");
  const [status, setStatus] = useState("Draft");
  const [notes, setNotes] = useState("");
  
  const { getProjectCategories, addDocument } = useStore();
  const categories = getProjectCategories(projectId);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file || !categoryId) return;

    addDocument({
      projectId,
      categoryId,
      title: file.name,
      type: file.name.split('.').pop()?.toUpperCase() as any || 'OTHER',
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      version: nextVersion || 1,
      status: status as any,
      tags: ['upload'], // Could be enhanced to accept tags as prop
      filePath: '#', // Mock path
    });

    setOpen(false);
    setFile(null);
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Drag and drop files or select from your computer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* File Drop Zone */}
          <div 
            className={cn(
              "border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-colors",
              file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/20"
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
          >
            {file ? (
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-primary/20 text-primary rounded-lg flex items-center justify-center">
                  <File className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm truncate max-w-[200px]">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setFile(null)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="h-12 w-12 bg-secondary/50 rounded-full flex items-center justify-center mb-3">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Click to browse or drag file here</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX up to 50MB</p>
                <Input 
                  type="file" 
                  className="hidden" 
                  id="file-upload"
                  onChange={(e) => e.target.files && setFile(e.target.files[0])}
                />
                <label htmlFor="file-upload" className="absolute inset-0 cursor-pointer" />
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Review">In Review</SelectItem>
                <SelectItem value="Final">Final</SelectItem>
                <SelectItem value="Signed">Signed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea 
              placeholder="Add metadata, synopsis, or instructions..." 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || !categoryId}>
            {file ? "Upload File" : "Select File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
