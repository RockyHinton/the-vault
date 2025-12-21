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

      {/* 2. Two Core Sections Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        
        {/* A. Today's Call Sheet & Key Documents (Focus: What is happening today) */}
        <div className="space-y-6">
           <div className="flex items-center justify-between">
             <h3 className="text-xl font-bold font-display flex items-center gap-2">
               <FileText className="h-5 w-5 text-primary" />
               Today's Documents
             </h3>
           </div>

           <div className="space-y-4">
               {/* Call Sheet - Hero Card */}
               <Card className="border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-all cursor-pointer group">
                 <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                       <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                             <FileText className="h-6 w-6" />
                          </div>
                          <div>
                             <h4 className="text-lg font-bold group-hover:text-blue-600 transition-colors">Call Sheet - Day {schedule.currentDay}</h4>
                             <p className="text-sm text-muted-foreground">For Today, {format(new Date(), "MMM do")}</p>
                          </div>
                       </div>
                       <Badge className="bg-green-500 hover:bg-green-600">PUBLISHED</Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                       <div className="p-3 bg-secondary/50 rounded-lg">
                          <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">Call Time</span>
                          <span className="font-semibold text-lg">06:00 AM</span>
                       </div>
                       <div className="p-3 bg-secondary/50 rounded-lg">
                          <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">Location</span>
                          <span className="font-semibold truncate block">{currentLocation?.name || "TBD"}</span>
                       </div>
                    </div>

                    <Button className="w-full" size="lg">
                       <ArrowUpRight className="mr-2 h-4 w-4" /> View Call Sheet
                    </Button>
                 </CardContent>
               </Card>

               {/* Shooting Schedule - Secondary */}
               <div className="pt-2">
                 <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-4">
                       <div className="p-2 bg-orange-100 dark:bg-orange-900/20 text-orange-600 rounded-lg">
                          <Calendar className="h-5 w-5" />
                       </div>
                       <div>
                          <p className="font-medium">Shooting Schedule v4.2</p>
                          <p className="text-xs text-muted-foreground">Latest revision</p>
                       </div>
                    </div>
                    <Button variant="ghost" size="sm">View</Button>
                 </div>
               </div>
           </div>
        </div>

        {/* B. Today's Priorities (Focus: What needs attention) */}
        <div className="space-y-6">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold font-display flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Today's Priorities
              </h3>
              <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">View All Tasks</Button>
           </div>

           <Card className="border-none shadow-none bg-transparent">
             <CardContent className="p-0 space-y-3">
               {highPriorityTasks.length > 0 ? (
                 highPriorityTasks.map(task => (
                   <div key={task.id} className="group flex items-start gap-4 p-4 rounded-xl border bg-card hover:border-primary/50 hover:shadow-sm transition-all">
                     <div className="mt-1 h-5 w-5 rounded-full border-2 border-muted-foreground/30 group-hover:border-primary cursor-pointer flex items-center justify-center transition-colors">
                        <div className="h-2.5 w-2.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                     </div>
                     <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-foreground leading-snug">{task.title}</span>
                          <Badge variant="outline" className="text-[10px] text-red-500 border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30 whitespace-nowrap">High Priority</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                           {task.assignedTo && (
                             <div className="flex items-center gap-1.5">
                               <div className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold">
                                 {task.assignedTo.charAt(0)}
                               </div>
                               <span>{task.assignedTo}</span>
                             </div>
                           )}
                           <span>•</span>
                           <span className="text-orange-500 font-medium">Due Today</span>
                        </div>
                     </div>
                   </div>
                 ))
               ) : (
                 <div className="p-8 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p>All high priority tasks cleared.</p>
                 </div>
               )}
               
               {/* Add New Task Quick Action */}
               <Button variant="outline" className="w-full border-dashed text-muted-foreground hover:text-foreground h-12">
                  + Add New Task
               </Button>
             </CardContent>
           </Card>
        </div>

      </div>
    </div>
  );
}
