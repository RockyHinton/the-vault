import { Project, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Clapperboard, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  MapPin, 
  Users, 
  TrendingUp, 
  AlertTriangle,
  ChevronRight,
  Download,
  Printer,
  MoreHorizontal,
  ArrowUpRight,
  Box,
  Truck
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ProductionViewProps {
  project: Project;
}

export default function ProductionView({ project }: ProductionViewProps) {
  const { tasks } = useStore();

  // --- Data Extraction & Mock Logic ---
  const schedule = project.schedule || {
    currentDay: 1,
    totalDays: 45,
    shootDays: [],
    locations: []
  };

  const todayShoot = schedule.shootDays?.find(d => d.dayNumber === schedule.currentDay) || {
    dayNumber: schedule.currentDay,
    date: new Date().toISOString(),
    locationId: 'loc1',
    scenes: ['Unknown'],
    pages: 0,
    status: 'Scheduled',
    callSheetStatus: 'Pending'
  };

  const currentLocation = schedule.locations?.find(l => l.id === todayShoot.locationId);

  // Status Logic
  const isDelayed = false; // Mock
  const isAtRisk = false; // Mock
  const statusColor = isDelayed ? "text-red-500" : isAtRisk ? "text-amber-500" : "text-green-500";
  const statusBg = isDelayed ? "bg-red-500/10" : isAtRisk ? "bg-amber-500/10" : "bg-green-500/10";
  const statusBorder = isDelayed ? "border-red-500/20" : isAtRisk ? "border-amber-500/20" : "border-green-500/20";
  const StatusIcon = isDelayed ? AlertCircle : isAtRisk ? AlertTriangle : CheckCircle2;

  // Task Filtering
  const projectTasks = tasks.filter(t => t.projectId === project.id && t.status !== 'Done');
  const highPriorityTasks = projectTasks.filter(t => t.priority === 'High');
  const otherTasks = projectTasks.filter(t => t.priority !== 'High').slice(0, 3);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 w-full px-4 lg:px-8 py-6">
      
      {/* 1. Today in Production Overview (Control Room Anchor) */}
      <Card className="border-none shadow-xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-black text-white overflow-hidden relative">
        {/* Subtle texture/grid */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
        <div className="absolute top-0 right-0 p-32 bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />
        
        <CardContent className="p-0 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[220px]">
            
            {/* Left: Day & Status */}
            <div className="lg:col-span-8 p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10">
               <div>
                 <div className="flex items-center gap-3 mb-4">
                   <Badge variant="outline" className="bg-red-600/20 text-red-400 border-red-500/30 animate-pulse px-3 py-1 tracking-wider uppercase text-xs font-bold">
                      Live Production
                   </Badge>
                   <span className="text-zinc-400 text-xs font-mono uppercase tracking-widest">
                      {format(new Date(), "EEEE, MMMM do")}
                   </span>
                 </div>
                 
                 <div className="flex items-baseline gap-4 mb-2">
                   <h1 className="text-6xl font-black tracking-tighter font-display">
                     Day {schedule.currentDay}
                   </h1>
                   <span className="text-2xl text-zinc-500 font-medium">/ {schedule.totalDays}</span>
                 </div>
                 
                 <div className="flex items-center gap-3 mt-4">
                    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium", statusBg, statusColor, statusBorder)}>
                      <StatusIcon className="h-4 w-4" />
                      <span>On Schedule — No delays reported</span>
                    </div>
                    {currentLocation && (
                       <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-zinc-300 text-sm">
                         <MapPin className="h-3.5 w-3.5" />
                         <span className="truncate max-w-[200px]">{currentLocation.name}</span>
                       </div>
                    )}
                 </div>
               </div>
            </div>

            {/* Right: Actions & Call Sheet Quick Access */}
            <div className="lg:col-span-4 p-8 bg-white/5 flex flex-col justify-center space-y-4">
               <div className="space-y-1">
                 <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Current Call Sheet</h3>
                 <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-white/10 hover:border-blue-500/50 transition-colors group cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-blue-600/20 text-blue-400 rounded flex items-center justify-center">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors">Day {schedule.currentDay} Call Sheet</div>
                        <div className="text-xs text-zinc-500">Published yesterday at 6:00 PM</div>
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-zinc-500 group-hover:text-white transition-colors" />
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-3 pt-2">
                 <Button className="w-full bg-white text-black hover:bg-zinc-200 font-semibold" size="lg">
                    View Call Sheet
                 </Button>
                 <Button variant="outline" className="w-full border-white/20 text-white hover:bg-white/10 hover:text-white hover:border-white/40" size="lg">
                    Update Status
                 </Button>
               </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 2. Production Health Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card/50 border-border/60 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-4">
               <div className="p-2.5 bg-green-500/10 text-green-600 rounded-lg">
                 <Calendar className="h-5 w-5" />
               </div>
               <div>
                 <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Schedule</p>
                 <p className="text-sm font-bold text-foreground">On Track</p>
               </div>
             </div>
             <Badge variant="secondary" className="bg-green-500/10 text-green-700 hover:bg-green-500/20 border-green-200">Stable</Badge>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/60 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-4">
               <div className="p-2.5 bg-blue-500/10 text-blue-600 rounded-lg">
                 <TrendingUp className="h-5 w-5" />
               </div>
               <div>
                 <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Budget</p>
                 <p className="text-sm font-bold text-foreground">Under Estimate</p>
               </div>
             </div>
             <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border-blue-200">~1.2% Var</Badge>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/60 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-4">
               <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-lg">
                 <Box className="h-5 w-5" />
               </div>
               <div>
                 <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Deliverables</p>
                 <p className="text-sm font-bold text-foreground">2 Pending Review</p>
               </div>
             </div>
             <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-amber-200">Action Req</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* 3. Main Operational Column */}
        <div className="xl:col-span-8 space-y-8">
           
           {/* First-Class Schedules */}
           <div className="space-y-4">
             <div className="flex items-center justify-between">
               <h3 className="text-lg font-bold font-display flex items-center gap-2">
                 <Clapperboard className="h-5 w-5 text-primary" />
                 Production Documents
               </h3>
               <Button variant="ghost" size="sm" className="text-muted-foreground">View All Documents</Button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {/* Shooting Schedule Card */}
               <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
                 <CardContent className="p-5 flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center shrink-0">
                       <Calendar className="h-6 w-6" />
                    </div>
                    <div className="space-y-1 flex-1">
                       <div className="flex justify-between items-start">
                         <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">Shooting Schedule v4.2</h4>
                         <Badge variant="secondary" className="text-[10px]">LATEST</Badge>
                       </div>
                       <p className="text-sm text-muted-foreground">Updated yesterday by AD Team</p>
                       <div className="pt-2 flex gap-3">
                         <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                           <Download className="h-3 w-3" /> PDF
                         </Button>
                         <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                           <Clock className="h-3 w-3" /> History
                         </Button>
                       </div>
                    </div>
                 </CardContent>
               </Card>

               {/* Next Call Sheet Card */}
               <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
                 <CardContent className="p-5 flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                       <FileText className="h-6 w-6" />
                    </div>
                    <div className="space-y-1 flex-1">
                       <div className="flex justify-between items-start">
                         <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">Call Sheet - Day {schedule.currentDay + 1}</h4>
                         <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">DRAFT</Badge>
                       </div>
                       <p className="text-sm text-muted-foreground">For tomorrow • Pending Approval</p>
                       <div className="pt-2 flex gap-3">
                         <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                           <Users className="h-3 w-3" /> Review
                         </Button>
                       </div>
                    </div>
                 </CardContent>
               </Card>
             </div>
           </div>

           {/* Today's Priorities (Reframed Task Board) */}
           <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <h3 className="text-lg font-bold font-display flex items-center gap-2">
                   <CheckCircle2 className="h-5 w-5 text-primary" />
                   Today's Priorities
                 </h3>
                 <Button variant="link" size="sm" className="text-primary">View All Tasks</Button>
              </div>

              <Card>
                <CardContent className="p-0 divide-y divide-border/50">
                  {highPriorityTasks.length > 0 ? (
                    highPriorityTasks.map(task => (
                      <div key={task.id} className="p-4 flex items-center gap-4 hover:bg-secondary/20 transition-colors">
                        <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" title="High Priority" />
                        <div className="flex-1">
                           <div className="flex items-center gap-2">
                             <span className="font-medium text-foreground">{task.title}</span>
                             {task.assignedTo && <Badge variant="secondary" className="text-[10px] h-5">{task.assignedTo}</Badge>}
                           </div>
                           <p className="text-xs text-muted-foreground mt-0.5">Due Today • {task.status}</p>
                        </div>
                        <Button size="sm" variant="outline">Complete</Button>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-muted-foreground text-sm">No high priority tasks for today.</div>
                  )}
                  
                  {/* Show a few normal tasks if space permits */}
                  {otherTasks.map(task => (
                      <div key={task.id} className="p-4 flex items-center gap-4 hover:bg-secondary/20 transition-colors opacity-80">
                        <div className="h-2 w-2 rounded-full bg-blue-400 shrink-0" title="Medium Priority" />
                        <div className="flex-1">
                           <div className="flex items-center gap-2">
                             <span className="font-medium text-foreground">{task.title}</span>
                             {task.assignedTo && <Badge variant="secondary" className="text-[10px] h-5">{task.assignedTo}</Badge>}
                           </div>
                        </div>
                        <Button size="sm" variant="ghost">View</Button>
                      </div>
                  ))}
                  
                  <div className="p-2 bg-secondary/10 text-center">
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground w-full h-8">
                       + Add New Priority Task
                    </Button>
                  </div>
                </CardContent>
              </Card>
           </div>
        </div>

        {/* 4. Secondary Column (Context & De-emphasized) */}
        <div className="xl:col-span-4 space-y-6">
           
           {/* Weather / Location Quick View (Optional flair, kept simple for now) */}
           {currentLocation && (
             <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-100 dark:border-blue-900/30">
               <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> Current Location
                    </h4>
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded">Secured</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-blue-950 dark:text-blue-50">{currentLocation.name}</p>
                    <p className="text-sm text-blue-800/70 dark:text-blue-200/70">{currentLocation.address}</p>
                  </div>
                  <Separator className="my-4 bg-blue-200 dark:bg-blue-800/50" />
                  <div className="flex justify-between text-xs text-blue-700 dark:text-blue-300">
                     <span>Basecamp Open: 06:00</span>
                     <span>Wrap Est: 19:30</span>
                  </div>
               </CardContent>
             </Card>
           )}

           {/* De-emphasized Sections (Logistics, Distribution) */}
           <div className="space-y-4">
             <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Secondary Operations</h4>
             
             {/* Collapsible-style Cards for quick access without clutter */}
             <Card className="hover:bg-secondary/10 transition-colors cursor-pointer">
               <CardContent className="p-4 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-secondary rounded-md text-muted-foreground">
                     <Truck className="h-4 w-4" />
                   </div>
                   <div>
                     <p className="font-medium text-sm">Logistics & Deliverables</p>
                     <p className="text-xs text-muted-foreground">Transport, Catering, Equipment</p>
                   </div>
                 </div>
                 <ChevronRight className="h-4 w-4 text-muted-foreground" />
               </CardContent>
             </Card>

             <Card className="hover:bg-secondary/10 transition-colors cursor-pointer">
               <CardContent className="p-4 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-secondary rounded-md text-muted-foreground">
                     <Users className="h-4 w-4" />
                   </div>
                   <div>
                     <p className="font-medium text-sm">Crew & Vendor List</p>
                     <p className="text-xs text-muted-foreground">Manage Access & Contacts</p>
                   </div>
                 </div>
                 <ChevronRight className="h-4 w-4 text-muted-foreground" />
               </CardContent>
             </Card>
             
             <Card className="hover:bg-secondary/10 transition-colors cursor-pointer opacity-75">
               <CardContent className="p-4 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-secondary rounded-md text-muted-foreground">
                     <Box className="h-4 w-4" />
                   </div>
                   <div>
                     <p className="font-medium text-sm">Distribution</p>
                     <p className="text-xs text-muted-foreground">Post-Production Handover</p>
                   </div>
                 </div>
                 <ChevronRight className="h-4 w-4 text-muted-foreground" />
               </CardContent>
             </Card>

           </div>
        </div>

      </div>
    </div>
  );
}
