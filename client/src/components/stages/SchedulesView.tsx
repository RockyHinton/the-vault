import { Project } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Calendar, 
  MapPin, 
  Clapperboard, 
  FileCheck,
  Clock,
  Sun,
  CloudRain,
  Download
} from "lucide-react";
import { format, parseISO, isSameDay } from "date-fns";

interface SchedulesViewProps {
  project: Project;
  currentSubcategory?: string;
  subcategoryId?: string;
}

export default function SchedulesView({ project, currentSubcategory, subcategoryId }: SchedulesViewProps) {
  
  // Drill-down view for documents
  if (subcategoryId) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
             <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">
               {currentSubcategory}
             </h2>
             <p className="text-muted-foreground mt-1">
               Production schedules and call sheets.
             </p>
          </div>
        </div>
        <DocumentLibrary 
           projectId={project.id} 
           categoryId="c10" // Hardcoded for Schedules category
           subcategoryId={subcategoryId} 
         />
      </div>
    );
  }

  // Dashboard View
  const schedule = project.schedule;

  if (!schedule) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-70">
        <Calendar className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground">No Schedule Data</h2>
        <p className="text-muted-foreground">Production schedule has not been published yet.</p>
      </div>
    );
  }

  const completionPercentage = (schedule.currentDay / schedule.totalDays) * 100;
  const todayShoot = schedule.shootDays.find(d => d.dayNumber === schedule.currentDay);
  const nextShoot = schedule.shootDays.find(d => d.dayNumber === schedule.currentDay + 1);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
            <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center p-0 border-purple-500/20 bg-purple-500/10 text-purple-500">
              <Calendar className="h-4 w-4" />
            </Badge>
            Production Schedule
          </h2>
          <p className="text-muted-foreground mt-1 ml-11">
            Day {schedule.currentDay} of {schedule.totalDays}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-muted-foreground mb-1">Production Progress</div>
          <div className="w-48 flex items-center gap-2">
             <Progress value={completionPercentage} className="h-2" />
             <span className="text-xs font-mono">{Math.round(completionPercentage)}%</span>
          </div>
        </div>
      </div>

      {/* Active Call Sheet (Today) */}
      {todayShoot && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
               <CardTitle className="text-xl text-purple-500 flex items-center gap-2">
                 <Clapperboard className="h-5 w-5" />
                 Active Call Sheet: Day {todayShoot.dayNumber}
               </CardTitle>
               <CardDescription className="text-purple-500/70 mt-1">
                 {format(parseISO(todayShoot.date), "EEEE, MMMM do")}
               </CardDescription>
            </div>
            <Button variant="outline" className="border-purple-500/30 text-purple-600 hover:bg-purple-500/10">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </CardHeader>
          <CardContent>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Location</div>
                  <div className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-purple-500" />
                    {schedule.locations.find(l => l.id === todayShoot.locationId)?.name}
                  </div>
                  <div className="text-sm text-muted-foreground pl-6">
                    {schedule.locations.find(l => l.id === todayShoot.locationId)?.address}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Schedule</div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                       <div className="text-sm text-muted-foreground">Call Time</div>
                       <div className="font-mono font-bold">06:00</div>
                     </div>
                     <div>
                       <div className="text-sm text-muted-foreground">Lunch</div>
                       <div className="font-mono font-bold">13:00</div>
                     </div>
                     <div>
                       <div className="text-sm text-muted-foreground">Wrap (Est)</div>
                       <div className="font-mono font-bold">18:00</div>
                     </div>
                     <div>
                       <div className="text-sm text-muted-foreground">Pages</div>
                       <div className="font-mono font-bold">{todayShoot.pages}</div>
                     </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Scenes</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {todayShoot.scenes.map(scene => (
                      <Badge key={scene} variant="secondary" className="bg-background/80 font-mono">
                        Sc. {scene}
                      </Badge>
                    ))}
                  </div>
                </div>
             </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Week */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Shoot Days</CardTitle>
          <CardDescription>Rolling 5-day outlook.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
             {schedule.shootDays
               .filter(d => d.dayNumber > schedule.currentDay)
               .slice(0, 5)
               .map((day) => (
                 <div key={day.dayNumber} className="flex items-center justify-between p-3 border rounded-lg hover:bg-card/50 transition-colors">
                    <div className="flex items-center gap-4">
                       <div className="flex flex-col items-center justify-center h-12 w-12 rounded-md bg-secondary/20 border border-border">
                          <span className="text-xs text-muted-foreground">{format(parseISO(day.date), "MMM")}</span>
                          <span className="text-lg font-bold">{format(parseISO(day.date), "d")}</span>
                       </div>
                       <div>
                          <div className="font-medium flex items-center gap-2">
                             Day {day.dayNumber}
                             {day.status === 'Rescheduled' && (
                               <Badge variant="destructive" className="text-[10px] h-5 px-1.5">Change</Badge>
                             )}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                             <MapPin className="h-3 w-3" />
                             {schedule.locations.find(l => l.id === day.locationId)?.name}
                             <span className="text-border">|</span>
                             {day.pages} pgs
                          </div>
                       </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right hidden md:block">
                        <div className="text-xs text-muted-foreground">Call Sheet</div>
                        <Badge variant={
                          day.callSheetStatus === 'Published' ? 'outline' :
                          day.callSheetStatus === 'Draft' ? 'secondary' : 'default' // Default is invisible/outline usually, using destructive for attention
                        } className={
                          day.callSheetStatus === 'Published' ? "text-green-600 border-green-200 bg-green-50" :
                          day.callSheetStatus === 'Pending' ? "text-amber-600 border-amber-200 bg-amber-50" : ""
                        }>
                          {day.callSheetStatus}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="icon">
                         <FileCheck className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                 </div>
               ))
             }
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
