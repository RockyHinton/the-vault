import { Clapperboard, Calendar, FileText, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskManager } from "@/components/features/TaskManager";
import { useProjectWorkspace } from "@/features/projects/workspace-context";

const upcoming = [
  { Icon: Calendar, title: "Shooting schedule", detail: "Day-by-day planning against the locked budget." },
  { Icon: FileText, title: "Call sheets", detail: "Published from the schedule, filed with the project's documents." },
  { Icon: MapPin, title: "Locations and daily reports", detail: "Where the unit is, and what was shot." },
];

/**
 * The Production stage. Scheduling, call sheets and daily reporting are
 * not part of this Vault release, so this page states that plainly and
 * gives the stage its one real working surface: the project's tasks.
 */
export default function ProductionView() {
  const { project } = useProjectWorkspace();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Card className="border-none shadow-xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-black text-white overflow-hidden">
        <CardContent className="p-8 md:p-10 space-y-6">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-white/20 bg-white/5 text-zinc-200 uppercase tracking-wider text-xs">
              Production
            </Badge>
            <span className="text-zinc-400 text-sm">{project.title}</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Clapperboard className="h-6 w-6 text-white" />
            </div>
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-3xl font-display font-bold tracking-tight">Production tools are not yet available</h2>
              <p className="text-zinc-300 leading-relaxed">
                This project has moved into production. Its budget, financing, cash flow, documents, people, rights and
                distribution stay live in the sidebar. Scheduling and daily reporting will be added to this stage in a later
                release; until then, production paperwork can be filed under Schedules and Documents.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2" data-testid="production-upcoming">
            {upcoming.map(({ Icon, title, detail }) => (
              <div key={title} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Icon className="h-4 w-4 text-zinc-400" />
                  {title}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{detail}</p>
                <Badge variant="outline" className="border-white/10 text-[10px] text-zinc-400">
                  Coming later
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-bold font-display">Production tasks</h3>
          <p className="text-sm text-muted-foreground">The team's open and completed work for this project.</p>
        </div>
        <TaskManager projectId={project.id} />
      </section>
    </div>
  );
}
