import { useState } from "react";
import { Project, useStore, Document, ProjectNoteCategory } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { 
  FileText, 
  Calendar, 
  User, 
  Clock, 
  ArrowRight,
  Upload,
  MessageSquare,
  Filter,
  Search,
  BookOpen,
  Plus,
  Download,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { UploadDocumentDialog } from "@/components/features/UploadDocumentDialog";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ScriptViewProps {
  project: Project;
}

export default function ScriptView({ project }: ScriptViewProps) {
  const { 
    getProjectDocuments, 
    deleteDocument,
    user 
  } = useStore();

  // Documents
  const documents = getProjectDocuments(project.id);
  
  // Filter for scripts - IMPROVED LOGIC: Filter by Category ID 'c1' (Script) or title/tags
  // This ensures newly uploaded files with 'c1' category appear here, even if title doesn't say "script"
  const scriptDocs = documents.filter(d => 
    (d.categoryId === 'c1' || d.title.toLowerCase().includes('script')) && 
    d.type === 'PDF'
  ).sort((a, b) => b.version - a.version);

  const activeScript = scriptDocs[0];
  const previousScripts = scriptDocs.slice(1);

  // Other Related Documents
  const castDocs = documents.filter(d => 
    !d.title.toLowerCase().includes('script') && 
    (d.tags?.includes('cast') || d.title.toLowerCase().includes('cast') || d.categoryId === 'c8')
  );
  
  const devDocs = documents.filter(d => 
    !d.title.toLowerCase().includes('script') && 
    !castDocs.includes(d) &&
    (d.stageContext === 'Development' || d.tags?.includes('research'))
  );

  const otherDocs = documents.filter(d => 
    !scriptDocs.includes(d) && !castDocs.includes(d) && !devDocs.includes(d)
  );

  const handleDeleteDocument = (docId: string) => {
    deleteDocument(docId);
    toast.success("Document deleted");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold tracking-tight">Script</h2>
          <p className="text-muted-foreground mt-1">Manage script versions, analysis, and creative development notes.</p>
        </div>
        <Link href={`/project/${project.id}/project-notes`}>
          <Button variant="outline" className="group">
            <MessageSquare className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>View Project Notes</span>
            <ArrowRight className="ml-2 h-4 w-4 opacity-50 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </div>

      {/* 1. Primary Script Section */}
      <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Visual Preview Placeholder */}
            <div className="w-full md:w-48 aspect-[3/4] bg-white dark:bg-zinc-900 rounded shadow-md border flex items-center justify-center relative group cursor-pointer transition-transform hover:scale-[1.02]">
               <div className="absolute inset-x-0 bottom-0 top-4 bg-white dark:bg-zinc-900 shadow-sm -z-10 translate-y-2 scale-95 rounded border" />
               <div className="absolute inset-x-0 bottom-0 top-8 bg-white dark:bg-zinc-900 shadow-sm -z-20 translate-y-4 scale-90 rounded border" />
               <FileText className="h-12 w-12 text-muted-foreground/50" />
               {activeScript && (
                 <Link href={`/script/${activeScript.id}`} className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded text-white font-medium backdrop-blur-sm z-10">
                   <BookOpen className="h-8 w-8 mb-2" />
                   Open Reader
                 </Link>
               )}
             </div>

            <div className="flex-1 space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Current Version</Badge>
                  {activeScript && <span className="text-sm text-muted-foreground font-mono">v{activeScript.version}.0</span>}
                </div>
                <h3 className="text-2xl font-bold text-foreground">
                  {activeScript ? activeScript.title : "No Script Uploaded"}
                </h3>
                <p className="text-muted-foreground mt-2 max-w-2xl">
                  {activeScript 
                    ? `Uploaded by ${activeScript.uploadedBy} on ${format(new Date(activeScript.uploadedAt), 'MMMM d, yyyy')}` 
                    : "Upload a script to begin analysis and development tracking."}
                </p>
              </div>

              {activeScript && (
                <div className="flex flex-wrap gap-3">
                  <Link href={`/script/${activeScript.id}`}>
                    <Button size="lg" className="shadow-lg shadow-primary/20">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Open Script Analysis
                    </Button>
                  </Link>
                  <UploadDocumentDialog projectId={project.id} defaultCategoryId="c1" nextVersion={activeScript.version + 1}>
                    <Button variant="outline" size="lg">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload New Version
                    </Button>
                  </UploadDocumentDialog>
                </div>
              )}
              
              {!activeScript && (
                <UploadDocumentDialog projectId={project.id} defaultCategoryId="c1">
                  <Button size="lg">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload First Draft
                  </Button>
                </UploadDocumentDialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-8">
        
        {/* Full Width: Versions & Docs */}
        <div className="space-y-8">
          
          {/* 2. Script Versions */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Version History
              </h3>
            </div>
            
            <div className="space-y-3">
              {previousScripts.length > 0 ? (
                previousScripts.map((script) => (
                  <div key={script.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-secondary/20 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-secondary/30 rounded flex items-center justify-center">
                        <span className="font-mono font-bold text-muted-foreground">v{script.version}</span>
                      </div>
                      <div>
                        <div className="font-medium">{script.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(script.uploadedAt), 'MMM d, yyyy')} • by {script.uploadedBy}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/script/${script.id}`}>
                        <Button variant="ghost" size="sm">Review Script</Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Version?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this script version? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteDocument(script.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground italic py-2">No previous versions available.</div>
              )}
            </div>
          </section>

          <Separator />

          {/* 3. Related Documents */}
          <section>
             <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Related Documents
              </h3>
              <UploadDocumentDialog projectId={project.id}>
                <Button variant="outline" size="sm">
                  <Plus className="mr-2 h-3 w-3" />
                  Add Document
                </Button>
              </UploadDocumentDialog>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {otherDocs.length > 0 || castDocs.length > 0 || devDocs.length > 0 ? (
                [...castDocs, ...devDocs, ...otherDocs].map(doc => (
                  <div key={doc.id} className="p-4 border rounded-lg bg-card hover:bg-secondary/10 transition-colors flex items-center gap-4">
                    <div className="h-10 w-10 bg-primary/10 text-primary rounded flex items-center justify-center">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="font-medium truncate">{doc.title}</div>
                        <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                           {doc.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</span>
                        <span>•</span>
                        <span>{doc.fileSize}</span>
                        {doc.tags && doc.tags.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="capitalize">{doc.tags[0]}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                        <Download className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{doc.title}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteDocument(doc.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl border-border/50 bg-secondary/5">
                  <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No related documents uploaded yet.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Project Notes - REMOVED per requirements */}
        {/* Moved to dedicated Project Notes page */}

      </div>
    </div>
  );
}
