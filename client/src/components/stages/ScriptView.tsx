import { format } from "date-fns";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { FileText, Clock, ArrowRight, Upload, MessageSquare, BookOpen, Download, Trash2 } from "lucide-react";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useDeleteScript, useScript, useScripts } from "@/features/scripts/use-scripts";
import { scriptReaderPath } from "@/features/scripts/labels";
import { fileContentUrl } from "@/features/files/files-api";
import { ScriptUploadDialog } from "@/components/script/ScriptUploadDialog";

/**
 * The project's screenplay: current version, real version history from the
 * document lineage, upload of new drafts, and the Script folder library.
 */
export default function ScriptView() {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const currentUserId = useCurrentUser().data?.data.user.id;
  const scriptsQuery = useScripts(project.id);
  const script = scriptsQuery.data?.data.items[0];
  const detailQuery = useScript(project.id, script?.id);
  const versions = detailQuery.data?.data.versions ?? [];
  const remove = useDeleteScript();

  const previousVersions = [...versions].filter((v) => !v.isCurrent).sort((a, b) => b.versionNumber - a.versionNumber);
  const canRemove = script ? isStudioAdmin || script.createdBy.id === currentUserId : false;
  // A new version is added by the current version's uploader or an admin (server-enforced; hidden here as UX).
  const canAddVersion = script ? isStudioAdmin || script.currentVersion.createdBy.id === currentUserId : false;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold tracking-tight">Script</h2>
          <p className="text-muted-foreground mt-1">Manage script versions, reading, and creative development notes.</p>
        </div>
        <Link href={`/project/${project.id}/project-notes`}>
          <Button variant="outline" className="group">
            <MessageSquare className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>View Project Notes</span>
            <ArrowRight className="ml-2 h-4 w-4 opacity-50 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
        <CardContent className="p-6 md:p-8">
          {scriptsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading script…</p>
          ) : scriptsQuery.isError ? (
            <p className="text-sm text-destructive">The script could not be loaded.</p>
          ) : (
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="w-full md:w-48 aspect-[3/4] bg-white dark:bg-zinc-900 rounded shadow-md border flex items-center justify-center relative group transition-transform hover:scale-[1.02]">
                <div className="absolute inset-x-0 bottom-0 top-4 bg-white dark:bg-zinc-900 shadow-sm -z-10 translate-y-2 scale-95 rounded border" />
                <div className="absolute inset-x-0 bottom-0 top-8 bg-white dark:bg-zinc-900 shadow-sm -z-20 translate-y-4 scale-90 rounded border" />
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                {script && (
                  <Link
                    href={scriptReaderPath(project.id, script.id, script.currentVersion.id)}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded text-white font-medium backdrop-blur-sm z-10"
                  >
                    <BookOpen className="h-8 w-8 mb-2" />
                    Open Reader
                  </Link>
                )}
              </div>

              <div className="flex-1 space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Current Version</Badge>
                    {script && (
                      <span className="text-sm text-muted-foreground font-mono" data-testid="script-current-version">
                        v{script.currentVersion.versionNumber}
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-foreground">{script ? script.title : "No Script Uploaded"}</h3>
                  <p className="text-muted-foreground mt-2 max-w-2xl">
                    {script
                      ? `${script.currentVersion.file.originalFilename} · uploaded by ${script.currentVersion.createdBy.displayName} on ${format(new Date(script.currentVersion.createdAt), "MMMM d, yyyy")}`
                      : "Upload a screenplay PDF to begin reading, annotating and tracking drafts."}
                  </p>
                  {script && (
                    <p className="text-[11px] text-muted-foreground font-mono mt-1 truncate" title={script.currentVersion.file.sha256}>
                      SHA-256 {script.currentVersion.file.sha256.slice(0, 16)}…
                    </p>
                  )}
                </div>

                {script ? (
                  <div className="flex flex-wrap gap-3">
                    <Link href={scriptReaderPath(project.id, script.id, script.currentVersion.id)}>
                      <Button size="lg" className="shadow-lg shadow-primary/20">
                        <BookOpen className="mr-2 h-4 w-4" />
                        Open Script Reader
                      </Button>
                    </Link>
                    {canAddVersion && (
                      <ScriptUploadDialog projectId={project.id} mode={{ kind: "new-version", script }}>
                        <Button variant="outline" size="lg">
                          <Upload className="mr-2 h-4 w-4" />
                          Upload New Version
                        </Button>
                      </ScriptUploadDialog>
                    )}
                    <a href={fileContentUrl(script.currentVersion.file.id)} aria-label={`Download ${script.title}`}>
                      <Button variant="ghost" size="lg">
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </a>
                    {canRemove && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="lg" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove Script
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this script?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The script is removed from this page. Every version stays in the Documents library with its notes and provenance.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => remove.mutate({ projectId: project.id, scriptId: script.id })}
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ) : (
                  <ScriptUploadDialog projectId={project.id} mode={{ kind: "first-draft" }}>
                    <Button size="lg">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload First Draft
                    </Button>
                  </ScriptUploadDialog>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {script && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Version History
            </h3>
            <span className="text-xs text-muted-foreground">{versions.length} version{versions.length === 1 ? "" : "s"}</span>
          </div>
          <div className="space-y-3">
            {previousVersions.length > 0 ? (
              previousVersions.map((version) => (
                <div key={version.id} data-testid="script-version-row" className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-secondary/30 rounded flex items-center justify-center">
                      <span className="font-mono font-bold text-muted-foreground">v{version.versionNumber}</span>
                    </div>
                    <div>
                      <div className="font-medium">{version.file.originalFilename}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(version.createdAt), "MMM d, yyyy")} • by {version.createdBy.displayName}
                        {version.notes ? ` • ${version.notes}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={scriptReaderPath(project.id, script.id, version.id)}>
                      <Button variant="ghost" size="sm">Read v{version.versionNumber}</Button>
                    </Link>
                    <a href={fileContentUrl(version.file.id)} aria-label={`Download version ${version.versionNumber}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground italic py-2">No previous versions yet.</div>
            )}
          </div>
        </section>
      )}

      <Separator />

      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Script Folder
          </h3>
          <span className="text-xs text-muted-foreground">Every document filed under Script, including the screenplay itself.</span>
        </div>
        <DocumentLibrary projectId={project.id} folder="script" />
      </section>
    </div>
  );
}
