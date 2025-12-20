import { Project, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TaskManager } from "@/components/features/TaskManager";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { Clapperboard, Globe, CalendarDays, MapPin, Truck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductionViewProps {
  project: Project;
}

export default function ProductionView({ project }: ProductionViewProps) {
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Top Bar: Production Status */}
      <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex items-center justify-between">
         <div className="flex items-center gap-4">
           <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
             <Clapperboard className="h-6 w-6" />
           </div>
           <div>
             <h2 className="text-lg font-bold font-display">Active Production</h2>
             <p className="text-xs text-muted-foreground">Day 14 of 45 • On Schedule</p>
           </div>
         </div>
         <div className="flex gap-2">
           <Button variant="outline" size="sm">Daily Call Sheet</Button>
           <Button size="sm">Update Status</Button>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-250px)]">
        
        {/* Left: Task Control Room */}
        <div className="lg:col-span-4 h-full flex flex-col">
          <TaskManager projectId={project.id} />
        </div>

        {/* Right: Operational Tabs */}
        <div className="lg:col-span-8 h-full flex flex-col">
          <Tabs defaultValue="schedule" className="h-full flex flex-col">
            <TabsList className="w-full justify-start bg-transparent border-b border-border p-0 h-auto rounded-none">
              <TabsTrigger value="schedule" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 py-3">
                <CalendarDays className="h-4 w-4 mr-2" />
                Schedules
              </TabsTrigger>
              <TabsTrigger value="logistics" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 py-3">
                <Truck className="h-4 w-4 mr-2" />
                Logistics & Deliverables
              </TabsTrigger>
              <TabsTrigger value="distribution" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 py-3">
                <Globe className="h-4 w-4 mr-2" />
                Distribution
              </TabsTrigger>
            </TabsList>

            <TabsContent value="schedule" className="flex-1 mt-4">
               <Card className="h-full border-none shadow-none bg-transparent">
                 <CardContent className="p-0 h-full">
                    {/* Placeholder for Shoot Schedule */}
                    <div className="grid gap-4">
                      <div className="p-4 border border-border rounded-lg bg-card flex justify-between items-center">
                         <div>
                           <h4 className="font-medium">Shoot Schedule v4.2</h4>
                           <p className="text-xs text-muted-foreground">Updated yesterday by AD Team</p>
                         </div>
                         <Button variant="outline" size="sm">View PDF</Button>
                      </div>
                      <div className="p-4 border border-border rounded-lg bg-card flex justify-between items-center">
                         <div>
                           <h4 className="font-medium">Call Sheet - Day 15</h4>
                           <p className="text-xs text-muted-foreground">For tomorrow, Nov 21</p>
                         </div>
                         <Button variant="outline" size="sm">View PDF</Button>
                      </div>
                    </div>
                 </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="logistics" className="flex-1 mt-4">
              <DocumentLibrary projectId={project.id} categoryId="c5" />
            </TabsContent>
            
            <TabsContent value="distribution" className="flex-1 mt-4">
              <DocumentLibrary projectId={project.id} categoryId="c6" />
            </TabsContent>
          </Tabs>
        </div>

      </div>
    </div>
  );
}
