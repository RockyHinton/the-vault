import type { DocumentFolder } from "@shared/contracts";
import { Calendar, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { Link } from "wouter";

interface SchedulesViewProps {
  currentSubcategory?: string;
  subcategoryId?: string;
  folder?: DocumentFolder;
}

/**
 * Schedules: the two document folders (shooting schedule, call sheets) are
 * real libraries. A scheduling dashboard is not part of this release, so the
 * category page says so rather than simulating one.
 */
export default function SchedulesView({ currentSubcategory, subcategoryId, folder }: SchedulesViewProps) {
  const { project } = useProjectWorkspace();

  if (subcategoryId) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
            <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">{currentSubcategory}</h2>
            <p className="text-muted-foreground mt-1">Production schedules and call sheets.</p>
          </div>
        </div>
        <DocumentLibrary projectId={project.id} folder={folder} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-border pb-6">
        <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">Schedules</h2>
        <p className="text-muted-foreground mt-1">Shooting schedules and daily call sheets for this project.</p>
      </div>
      <Card className="border-dashed">
        <CardContent className="py-12 flex flex-col items-center text-center gap-4">
          <div className="p-3 rounded-full bg-primary/10 text-primary">
            <Calendar className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">Scheduling tools are not yet available</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            A live shooting-day dashboard will arrive with production scheduling in a later release. Schedule and call-sheet
            documents can already be filed and shared here.
          </p>
          <Badge variant="outline" className="text-[10px]">
            Coming later
          </Badge>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href={`/project/${project.id}/schedules/shooting-schedule`} className="text-sm text-primary hover:underline flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> Shooting Schedule documents
            </Link>
            <Link href={`/project/${project.id}/schedules/call-sheets`} className="text-sm text-primary hover:underline flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> Daily Call Sheet documents
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
