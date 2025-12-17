import { Shell } from "@/components/layout/Shell";
import { useStore, ProjectStatus } from "@/lib/store";
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
  FolderOpen
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { motion } from "framer-motion";

const statusColors: Record<ProjectStatus, string> = {
  Development: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20",
  Packaging: "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20",
  Financing: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20",
  Production: "bg-green-500/10 text-green-500 hover:bg-green-500/20",
  Post: "bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20",
  Distribution: "bg-pink-500/10 text-pink-500 hover:bg-pink-500/20",
};

export default function ProjectsPage() {
  const { projects, setCurrentProject } = useStore();

  return (
    <Shell>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Projects</h1>
            <p className="text-muted-foreground mt-1">Manage your active productions and development slate.</p>
          </div>
          <Button size="lg" className="shadow-lg shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 bg-card p-2 rounded-lg border border-border">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by title, genre..." 
              className="pl-9 bg-secondary/50 border-transparent focus:border-primary/20"
            />
          </div>
          <div className="h-8 w-[1px] bg-border mx-2" />
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Filter className="mr-2 h-4 w-4" />
            Status
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            Sort by: Last Updated
          </Button>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Link href={`/project/${project.id}`} onClick={() => setCurrentProject(project.id)}>
                <Card className="group h-full flex flex-col hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 cursor-pointer overflow-hidden border-secondary">
                  <div className="h-2 w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-2">
                      <Badge variant="secondary" className={statusColors[project.status]}>
                        {project.status}
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
                  </CardContent>
                  <CardFooter className="pt-0 text-xs text-muted-foreground flex items-center justify-between border-t border-border/50 p-4 bg-secondary/20">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Updated {format(new Date(project.updatedAt), 'MMM d, yyyy')}
                    </div>
                    <div className="flex items-center gap-1 font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300">
                      Open Workspace
                      <FolderOpen className="h-3 w-3" />
                    </div>
                  </CardFooter>
                </Card>
              </Link>
            </motion.div>
          ))}

          {/* New Project Placeholder Card */}
          <motion.div
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.3, delay: projects.length * 0.1 }}
          >
            <button className="w-full h-full min-h-[250px] rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-secondary/10 transition-all flex flex-col items-center justify-center gap-4 text-muted-foreground hover:text-primary group">
              <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Plus className="h-6 w-6" />
              </div>
              <span className="font-medium">Create New Project</span>
            </button>
          </motion.div>
        </div>

      </div>
    </Shell>
  );
}
