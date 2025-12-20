import { Shell } from "@/components/layout/Shell";
import { useStore, ProjectStatus, ProjectStage } from "@/lib/store";
import { 
  Card, 
  CardContent, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  MoreHorizontal,
  FolderOpen,
  Eye,
  Briefcase,
  Clapperboard,
  Archive
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

const stageColors: Record<ProjectStage, string> = {
  Evaluation: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20",
  Development: "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20",
  Production: "bg-green-500/10 text-green-500 hover:bg-green-500/20",
  Archived: "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20",
};

const stageIcons: Record<ProjectStage, any> = {
  Evaluation: Eye,
  Development: Briefcase,
  Production: Clapperboard,
  Archived: Archive,
};

export default function ProjectsPage() {
  const { projects, setCurrentProject } = useStore();
  const [activeTab, setActiveTab] = useState<ProjectStage | 'All'>('All');

  const filteredProjects = activeTab === 'All' 
    ? projects.filter(p => p.stage !== 'Archived') // Don't show archived in 'All' view usually
    : projects.filter(p => p.stage === activeTab);

  return (
    <Shell>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Projects</h1>
            <p className="text-muted-foreground mt-1">Manage your slate across all stages of production.</p>
          </div>
          <Button size="lg" className="shadow-lg shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>

        {/* Stage Tabs */}
        <Tabs defaultValue="All" className="w-full" onValueChange={(val) => setActiveTab(val as any)}>
          <div className="flex items-center justify-between overflow-x-auto pb-2">
            <TabsList className="bg-secondary/20 p-1 border border-border">
              <TabsTrigger value="All" className="px-4">All Active</TabsTrigger>
              <TabsTrigger value="Evaluation" className="px-4 gap-2">
                <Eye className="h-4 w-4" /> Evaluation
              </TabsTrigger>
              <TabsTrigger value="Development" className="px-4 gap-2">
                <Briefcase className="h-4 w-4" /> Development
              </TabsTrigger>
              <TabsTrigger value="Production" className="px-4 gap-2">
                <Clapperboard className="h-4 w-4" /> Production
              </TabsTrigger>
              <TabsTrigger value="Archived" className="px-4 gap-2">
                <Archive className="h-4 w-4" /> Archived
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
               <div className="relative w-64">
                 <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                 <Input 
                   placeholder="Search..." 
                   className="pl-9 bg-secondary/20 border-transparent h-9"
                 />
               </div>
            </div>
          </div>

          <div className="mt-6">
             {/* Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project, index) => {
                const StageIcon = stageIcons[project.stage];
                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <Link href={`/project/${project.id}`} onClick={() => setCurrentProject(project.id)}>
                      <Card className="group h-full flex flex-col hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 cursor-pointer overflow-hidden border-secondary">
                        <div className="h-1.5 w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start gap-2">
                            <Badge variant="secondary" className={stageColors[project.stage]}>
                              <StageIcon className="h-3 w-3 mr-1" />
                              {project.stage}
                            </Badge>
                            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                          <CardTitle className="text-xl font-bold mt-2 group-hover:text-primary transition-colors">
                            {project.title}
                          </CardTitle>
                          <div className="text-sm font-medium text-muted-foreground">{project.genre}</div>
                        </CardHeader>
                        <CardContent className="flex-1 pb-4">
                          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                            {project.logline}
                          </p>
                          
                          {/* Key Stats based on Stage */}
                          <div className="mt-4 pt-4 border-t border-border/30 flex gap-4 text-xs font-mono text-muted-foreground">
                             {project.stage === 'Evaluation' && (
                               <div>
                                 <span className="block text-foreground/50 text-[10px] uppercase">Est. Budget</span>
                                 <span className="text-foreground">{project.evaluation.plannedBudget || 'TBD'}</span>
                               </div>
                             )}
                             {project.stage === 'Evaluation' && (
                               <div>
                                 <span className="block text-foreground/50 text-[10px] uppercase">Score</span>
                                 <span className="text-foreground">{project.evaluation.scores?.creative || '-'} / 10</span>
                               </div>
                             )}
                          </div>

                        </CardContent>
                        <CardFooter className="pt-0 text-xs text-muted-foreground flex items-center justify-between border-t border-border/50 p-4 bg-secondary/20">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Updated {format(new Date(project.updatedAt), 'MMM d')}
                          </div>
                          <div className="flex items-center gap-1 font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300">
                            Open Workspace
                            <FolderOpen className="h-3 w-3" />
                          </div>
                        </CardFooter>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}

              {/* New Project Placeholder - Only show on All or Evaluation */}
              {(activeTab === 'All' || activeTab === 'Evaluation') && (
                <motion.div
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ duration: 0.3, delay: filteredProjects.length * 0.1 }}
                >
                  <button className="w-full h-full min-h-[280px] rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-secondary/10 transition-all flex flex-col items-center justify-center gap-4 text-muted-foreground hover:text-primary group">
                    <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Plus className="h-6 w-6" />
                    </div>
                    <span className="font-medium">New Project Evaluation</span>
                  </button>
                </motion.div>
              )}
            </div>
            
            {filteredProjects.length === 0 && activeTab !== 'Evaluation' && activeTab !== 'All' && (
              <div className="text-center py-20 text-muted-foreground">
                <div className="h-16 w-16 bg-secondary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Archive className="h-8 w-8 opacity-50" />
                </div>
                <h3 className="text-lg font-medium">No projects in {activeTab}</h3>
                <p className="mt-2">Projects will appear here when they move to this stage.</p>
              </div>
            )}
          </div>
        </Tabs>

      </div>
    </Shell>
  );
}
