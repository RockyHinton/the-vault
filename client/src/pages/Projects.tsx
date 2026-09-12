import { Shell } from "@/components/layout/Shell";
import type { ProjectStage } from "@/lib/store";
import type { Project as ApiProject } from "@shared/contracts";
import {
  useDeleteProject,
  useProjects,
  useRestoreProject,
  useTransitionProjectStage,
} from "@/features/projects/use-projects";
import { toWorkspaceProject } from "@/features/projects/project-fixture-adapter";
import { 
  Card, 
  CardContent, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Archive,
  ArrowRight,
  Trash2,
  Star,
  Undo2
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { NewProjectDialog } from "@/components/features/NewProjectDialog";
import { ArchiveProjectDialog } from "@/components/features/ArchiveProjectDialog";
import { toast } from "sonner";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import project1 from "@/assets/project-1-new.jpg";
import project2 from "@/assets/That_Hurts_1778321788610.png";
import project3 from "@/assets/Linda_Lisboa_1778321255083.png";
import project4 from "@/assets/WASP_2026_1778321002468.png";

const placeholderImages = [project1, project2, project3, project4];

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
  const activeProjects = useProjects("false");
  const archivedProjects = useProjects("true");
  const transition = useTransitionProjectStage();
  const restore = useRestoreProject();
  const remove = useDeleteProject();
  const projects = [
    ...(activeProjects.data?.pages.flatMap((page) => page.data.items) ?? []),
    ...(archivedProjects.data?.pages.flatMap((page) => page.data.items) ?? []),
  ];
  const [activeTab, setActiveTab] = useState<ProjectStage | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [projectToArchive, setProjectToArchive] = useState<ApiProject | null>(null);

  // Archive Filter State
  const [archiveFilterReason, setArchiveFilterReason] = useState<string>('All');
  const [archiveFilterRevisit, setArchiveFilterRevisit] = useState<string>('All');
  const [archiveFilterStarred, setArchiveFilterStarred] = useState(false);
  
  // Delete confirmation state
  const [projectToDelete, setProjectToDelete] = useState<ApiProject | null>(null);

  const filteredProjects = projects.filter(p => {
    // 1. Filter by Stage
    const workspaceProject = toWorkspaceProject(p);
    const matchesStage = activeTab === 'All'
      ? !p.archivedAt
      : workspaceProject.stage === activeTab;

    // 2. Filter by Search Query
    if (!searchQuery && activeTab !== 'Archived') return matchesStage;
    
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      p.title.toLowerCase().includes(query) || 
      p.genre?.toLowerCase().includes(query) ||
      p.logline?.toLowerCase().includes(query);

    // 3. Special Filters for Archived Stage
    if (activeTab === 'Archived') {
       const details = workspaceProject.archiveDetails;
       
       // Filter by Reason
       const matchesReason = archiveFilterReason === 'All' || details?.reason === archiveFilterReason;
       
       // Filter by Revisit Status
       const matchesRevisit = archiveFilterRevisit === 'All' || details?.revisit === archiveFilterRevisit;

       // Filter by Starred
       const matchesStarred = !archiveFilterStarred || details?.starred === true;

       return matchesStage && matchesSearch && matchesReason && matchesStarred && matchesRevisit;
    }

    return matchesStage && matchesSearch;
  });

  const handleAdvanceStage = async (project: ApiProject) => {
    const nextStage = project.stage === "evaluation" ? "development" : project.stage === "development" ? "production" : null;
    
    if (nextStage) {
      try {
        await transition.mutateAsync({ id: project.id, input: { toStage: nextStage, version: project.version } });
        toast.success(`Project moved to ${nextStage === "development" ? "Development" : "Production"}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update project stage");
      }
    }
  };

  const openArchiveDialog = (project: ApiProject) => {
    setProjectToArchive(project);
    setIsArchiveDialogOpen(true);
  };

  const confirmDelete = () => {
    if (projectToDelete) {
      remove.mutate({ id: projectToDelete.id, version: projectToDelete.version }, {
        onSuccess: () => toast.success("Project deleted"),
        onError: (error) => toast.error(error.message),
      });
      setProjectToDelete(null);
    }
  };

  return (
    <Shell>
      <div className="max-w-7xl mx-auto space-y-12 pt-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Projects</h1>
            <p className="text-muted-foreground mt-1">Manage your slate across all stages of production.</p>
          </div>
          <Button size="lg" className="shadow-lg shadow-primary/20" onClick={() => setIsNewProjectDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>

        {/* Stage Tabs - Refined to be more text-based and editorial */}
        <Tabs defaultValue="All" className="w-full" onValueChange={(val) => setActiveTab(val as any)}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <TabsList className="bg-transparent p-0 h-auto gap-8 justify-start overflow-x-auto w-full sm:w-auto">
              {['All', 'Evaluation', 'Development', 'Production', 'Archived'].map((stage) => (
                <TabsTrigger 
                  key={stage}
                  value={stage} 
                  className="px-0 py-2 rounded-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none text-white/50 hover:text-white/80 data-[state=active]:text-white font-medium text-sm md:text-base tracking-wide border-b-2 border-transparent data-[state=active]:border-primary transition-all duration-300 capitalize"
                >
                  {stage === 'All' ? 'All Active' : stage}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex items-center w-full sm:w-auto">
               <div className="relative w-full sm:w-64 group">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-white transition-colors" />
                 <Input 
                   placeholder="Search slate..." 
                   className="pl-9 bg-white/5 border-transparent h-10 focus:border-primary/50 focus:bg-white/10 transition-all text-sm backdrop-blur-sm rounded-full text-white placeholder:text-white/30"
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                 />
               </div>
            </div>
          </div>

          <div className="mt-12">
             
             {/* Archive Filters (Only Visible in Archive Tab) */}
             {activeTab === 'Archived' && (
               <div className="mb-6 flex flex-wrap items-center gap-4 p-4 bg-secondary/10 border border-border/50 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                 <div className="flex items-center gap-2">
                   <Filter className="h-4 w-4 text-muted-foreground" />
                   <span className="text-sm font-medium">Filter Archive:</span>
                 </div>
                 
                 <Select 
                   value={archiveFilterReason} 
                   onValueChange={(val: any) => setArchiveFilterReason(val)}
                 >
                   <SelectTrigger className="w-[180px] h-8 text-xs">
                     <SelectValue placeholder="Reason" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="All">All reasons</SelectItem>
                     <SelectItem value="Creative pass">Creative pass</SelectItem>
                     <SelectItem value="Commercial viability">Commercial viability</SelectItem>
                     <SelectItem value="Financing not secured">Financing not secured</SelectItem>
                     <SelectItem value="Rights / legal issues">Rights / legal issues</SelectItem>
                     <SelectItem value="Packaging fell through">Packaging fell through</SelectItem>
                     <SelectItem value="Paused (strategic / timing)">Paused (strategic / timing)</SelectItem>
                     <SelectItem value="Produced / completed">Produced / completed</SelectItem>
                     <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                   </SelectContent>
                 </Select>

                 <ToggleGroup type="single" value={archiveFilterRevisit} onValueChange={(val) => val && setArchiveFilterRevisit(val)} className="h-8">
                   <ToggleGroupItem value="All" className="h-8 px-2 text-xs">All</ToggleGroupItem>
                   <ToggleGroupItem value="Yes" className="h-8 px-2 text-xs">Yes</ToggleGroupItem>
                   <ToggleGroupItem value="Maybe" className="h-8 px-2 text-xs">Maybe</ToggleGroupItem>
                   <ToggleGroupItem value="No" className="h-8 px-2 text-xs">No</ToggleGroupItem>
                 </ToggleGroup>

                 <div className="flex items-center space-x-2 border border-input rounded-md px-3 py-1.5 h-8 bg-background">
                   <Checkbox 
                     id="filter-starred" 
                     checked={archiveFilterStarred}
                     onCheckedChange={(checked) => setArchiveFilterStarred(checked as boolean)}
                   />
                   <Label htmlFor="filter-starred" className="text-xs cursor-pointer flex items-center gap-1.5 font-normal">
                     <Star className={`h-3 w-3 ${archiveFilterStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                     Starred only
                   </Label>
                 </div>

                 {/* Reset Filter Button if active */}
                 {(archiveFilterReason !== 'All' || archiveFilterStarred || archiveFilterRevisit !== 'All') && (
                   <Button 
                     variant="ghost" 
                     size="sm" 
                     className="h-8 text-xs text-muted-foreground hover:text-foreground ml-auto"
                     onClick={() => {
                       setArchiveFilterReason('All');
                       setArchiveFilterRevisit('All');
                       setArchiveFilterStarred(false);
                     }}
                   >
                     Reset Filters
                   </Button>
                 )}
               </div>
             )}

             {/* Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {filteredProjects.map((apiProject, index) => {
                 const project = toWorkspaceProject(apiProject);
                 const StageIcon = stageIcons[project.stage];
                
                // Keep the archived visual indicator but adapt it for the cinematic card
                let borderAccent = "border-white/10";
                if (project.stage === 'Archived' && project.archiveDetails) {
                   if (project.archiveDetails.revisit === 'Yes') borderAccent = "border-green-500/50";
                   else if (project.archiveDetails.revisit === 'Maybe') borderAccent = "border-blue-500/30";
                   else borderAccent = "border-muted/50";
                }

                // If project has an image property we use it, else we use a placeholder gradient
                const hasImage = (project as any).coverImage || (project as any).posterUrl;
                const projectImage = hasImage ? ((project as any).coverImage || (project as any).posterUrl) : undefined;
                
                // Deterministic placeholder based on project ID so images don't shift when filtering
                 const originalIndex = projects.findIndex(p => p.id === project.id);
                const imageUrl = projectImage || placeholderImages[Math.max(0, originalIndex) % placeholderImages.length];

                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    className="h-full"
                  >
                      <Link href={`/project/${project.id}`}>
                      <Card className={`group relative h-full min-h-[280px] flex flex-col cursor-pointer overflow-hidden rounded-xl border ${borderAccent} bg-black/40 shadow-xl transition-all duration-500 hover:shadow-2xl hover:shadow-black/50 hover:border-white/20`}>
                        
                        {/* Background Image / Placeholder */}
                        <div className="absolute inset-0 z-0 overflow-hidden bg-gradient-to-br from-secondary/30 to-background/80">
                          {/* Noise Texture */}
                          <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
                          
                          {/* Abstract Gradient for placeholder */}
                          {!imageUrl && (
                            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-purple-500/5 opacity-50 group-hover:opacity-70 transition-opacity duration-700" />
                          )}

                          {/* Actual Image (scaled and brightened on hover) */}
                          <div 
                            className="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-out group-hover:scale-105 group-hover:brightness-110"
                            style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : {}}
                          />

                          {/* Dark Gradient Overlay for text readability (bottom up) */}
                          {/* Changed to be lighter on hover rather than darker to let the image shine */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-100 group-hover:opacity-60 transition-opacity duration-500" />
                        </div>

                        {/* Top Action Bar (Three-dot Menu & Star) */}
                        <div className="absolute top-0 inset-x-0 p-4 flex justify-end z-20">
                          <div className="flex items-center gap-3">
                            {project.archiveDetails?.starred && (
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 drop-shadow-md animate-in zoom-in duration-300" />
                            )}
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/20 hover:bg-black/40 backdrop-blur-md border border-white/5 text-white/70 hover:text-white rounded-full transition-all">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                
                                {/* Advance Option */}
                                {(project.stage === 'Evaluation' || project.stage === 'Development') && (
                                  <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation();
                                     handleAdvanceStage(apiProject);
                                  }}>
                                    <ArrowRight className="mr-2 h-4 w-4" />
                                    Advance Stage
                                  </DropdownMenuItem>
                                )}
                                
                                {/* Archive Option */}
                                {project.stage !== 'Archived' && (
                                  <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation();
                                     openArchiveDialog(apiProject);
                                  }}>
                                    <Archive className="mr-2 h-4 w-4" />
                                    Archive
                                  </DropdownMenuItem>
                                )}

                                {/* Unarchive Option */}
                                {project.stage === 'Archived' && (
                                  <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation();
                                     restore.mutate({ id: apiProject.id, version: apiProject.version }, {
                                       onSuccess: () => toast.success("Project restored to active list"),
                                       onError: (error) => toast.error(error.message),
                                     });
                                  }}>
                                    <Undo2 className="mr-2 h-4 w-4" />
                                    Restore Project
                                  </DropdownMenuItem>
                                )}

                                <DropdownMenuSeparator />
                                
                                {/* Delete Option */}
                                <DropdownMenuItem 
                                  className="text-destructive focus:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                     setProjectToDelete(apiProject);
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {/* Content Area - Bottom Left */}
                        <div className="absolute bottom-0 inset-x-0 p-6 md:p-8 z-10 flex flex-col justify-end">
                          <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500 ease-out">
                            <CardTitle className="text-2xl md:text-3xl font-display font-medium text-white/90 group-hover:text-white mb-2 drop-shadow-xl transition-colors tracking-wide leading-tight">
                              {project.title}
                            </CardTitle>
                            
                            <div className="flex items-center gap-3">
                              {/* Refined Text-Based Stage Label */}
                              <span className="text-xs font-semibold text-white/60 tracking-[0.1em] capitalize drop-shadow-md group-hover:text-white/80 transition-colors duration-300">
                                {project.stage}
                              </span>
                              
                              {/* Animated Entry Indicator on Hover */}
                              <div className="h-px w-0 bg-primary/80 group-hover:w-8 transition-all duration-500 ease-out opacity-0 group-hover:opacity-100" />
                            </div>
                          </div>
                        </div>

                      </Card>
                    </Link>
                  </motion.div>
                );
              })}

              {/* New Project Evaluation Placeholder */}
              {(activeTab === 'All' || activeTab === 'Evaluation') && (
                <motion.div
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ duration: 0.3, delay: filteredProjects.length * 0.1 }}
                   className="h-full"
                >
                  <button 
                    className="group relative w-full h-full min-h-[280px] rounded-xl border border-white/10 bg-secondary/5 hover:bg-secondary/10 shadow-lg overflow-hidden transition-all duration-500 flex flex-col items-center justify-center gap-4 cursor-pointer"
                    onClick={() => setIsNewProjectDialogOpen(true)}
                  >
                    {/* Noise Texture */}
                    <div className="absolute inset-0 opacity-[0.02] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
                    
                    <div className="h-14 w-14 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center group-hover:scale-110 group-hover:bg-white/10 transition-all duration-500 z-10 shadow-xl">
                      <Plus className="h-6 w-6 text-white/70 group-hover:text-white transition-colors" />
                    </div>
                    <span className="font-display font-light text-lg text-white/60 group-hover:text-white/90 tracking-wide z-10 transition-colors">
                      New Project
                    </span>
                  </button>
                </motion.div>
              )}
            </div>
             {(activeProjects.hasNextPage || archivedProjects.hasNextPage) && (
               <div className="mt-6 flex justify-center">
                 <Button
                   variant="outline"
                   disabled={activeProjects.isFetchingNextPage || archivedProjects.isFetchingNextPage}
                   onClick={() => {
                     if (activeProjects.hasNextPage) void activeProjects.fetchNextPage();
                     if (archivedProjects.hasNextPage) void archivedProjects.fetchNextPage();
                   }}
                 >
                   Load more projects
                 </Button>
               </div>
             )}
            
            {filteredProjects.length === 0 && activeTab !== 'Evaluation' && activeTab !== 'All' && (
              <div className="text-center py-20 text-muted-foreground">
                <div className="h-16 w-16 bg-secondary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Archive className="h-8 w-8 opacity-50" />
                </div>
                <h3 className="text-lg font-medium">No projects found in {activeTab}</h3>
                <p className="mt-2">
                  {activeTab === 'Archived' 
                    ? "Try adjusting your filters to see more archived projects." 
                    : "Projects will appear here when they move to this stage."}
                </p>
              </div>
            )}
          </div>
        </Tabs>

        <NewProjectDialog 
          isOpen={isNewProjectDialogOpen} 
          onClose={() => setIsNewProjectDialogOpen(false)} 
        />

        {projectToArchive && (
          <ArchiveProjectDialog 
            isOpen={isArchiveDialogOpen}
            onClose={() => {
              setIsArchiveDialogOpen(false);
              setProjectToArchive(null);
            }}
             project={projectToArchive}
            projectTitle={projectToArchive.title}
          />
        )}

        <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the project and all associated data including scripts, budgets, and reviews.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete Project
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </Shell>
  );
}
