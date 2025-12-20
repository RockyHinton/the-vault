import { useState, useEffect } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { Shell } from "@/components/layout/Shell";
import DocumentLibrary from "@/pages/DocumentLibrary";
import EvaluationView from "@/components/stages/EvaluationView";
import DevelopmentView from "@/components/stages/DevelopmentView";
import ProductionView from "@/components/stages/ProductionView";
import FinancingView from "@/components/stages/FinancingView";
import { UploadDocumentDialog } from "@/components/features/UploadDocumentDialog";
import { Button } from "@/components/ui/button";
import { 
  ChevronRight, 
  Folder, 
  ChevronDown, 
  FileText,
  Users,
  CircleDollarSign,
  CheckSquare,
  FolderCheck,
  Globe,
  Building2,
  MoreVertical,
  Plus,
  Eye, 
  Briefcase, 
  Clapperboard, 
  Archive,
  ArrowRight,
  User,
  Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";

// Icon mapping helper
const iconMap: Record<string, any> = {
  FileText,
  Users,
  CircleDollarSign,
  CheckSquare,
  FolderCheck,
  Globe,
  Building2,
  User,
  Calendar
};

export default function ProjectWorkspace() {
  const [match, params] = useRoute("/project/:id/:category?/:subcategory?");
  const { projects, getProjectCategories, getCategorySubcategories, setCurrentProject } = useStore();
  const [location, setLocation] = useLocation();

  // Cast params
  const safeParams = params as { id: string; category?: string; subcategory?: string } | null;

  // Find current project
  const project = projects.find(p => p.id === safeParams?.id);
  const categories = project ? getProjectCategories(project.id) : [];

  // Sync current project id to store
  useEffect(() => {
    if (safeParams?.id) setCurrentProject(safeParams.id);
  }, [safeParams?.id, setCurrentProject]);

  // Sidebar Component - Conditional Rendering based on Stage?
  // For MVP, we keep the sidebar for all stages but maybe highlight "This is Evaluation Mode"
  const SidebarContent = () => {
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(
      safeParams?.category ? { [safeParams.category]: true } : {}
    );

    const toggleCategory = (slug: string) => {
      setExpandedCategories(prev => ({
        ...prev,
        [slug]: !prev[slug]
      }));
    };

    return (
      <div className="space-y-4">
        {project && (
          <div className="px-4 py-2 bg-secondary/10 border-y border-border/50 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Current Stage</div>
            <div className="flex items-center gap-2 text-primary font-bold">
               {project.stage === 'Evaluation' && <Eye className="h-4 w-4" />}
               {project.stage === 'Development' && <Briefcase className="h-4 w-4" />}
               {project.stage === 'Production' && <Clapperboard className="h-4 w-4" />}
               {project.stage}
            </div>
          </div>
        )}

        <div className="space-y-1">
          {/* Only show "New Item" if in generic mode, otherwise views handle it */}
          {(!project || project.stage === 'Development' || project.stage === 'Production') && (
            <div className="px-3 pb-2">
               {project && (
                 <UploadDocumentDialog projectId={project.id}>
                   <Button className="w-full justify-start gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary border-primary/20" variant="outline" size="sm">
                     <Plus className="h-4 w-4" />
                     New Item
                   </Button>
                 </UploadDocumentDialog>
               )}
            </div>
          )}
          
          {categories.map(category => {
            const Icon = category.icon ? iconMap[category.icon] : Folder;
            const isActive = safeParams?.category === category.slug;
            const isExpanded = expandedCategories[category.slug] || isActive;
            const subcategories = getCategorySubcategories(category.id);
            const hasSubcategories = subcategories.length > 0;

            return (
              <div key={category.id} className="space-y-0.5">
                <div 
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 rounded-md hover:bg-sidebar-accent/50 cursor-pointer transition-colors text-sm font-medium",
                    isActive && !safeParams?.subcategory ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground"
                  )}
                  onClick={() => {
                    if (hasSubcategories) toggleCategory(category.slug);
                    if (!hasSubcategories) setLocation(`/project/${project?.id}/${category.slug}`);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn("h-4 w-4", isActive ? "text-sidebar-primary" : "text-muted-foreground")} />
                    <span>{category.name}</span>
                  </div>
                  {hasSubcategories && (
                    <ChevronDown 
                      className={cn(
                        "h-3 w-3 text-muted-foreground transition-transform duration-200",
                        isExpanded ? "" : "-rotate-90"
                      )} 
                    />
                  )}
                </div>

                <AnimatePresence>
                  {isExpanded && hasSubcategories && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pl-9 pr-2 space-y-0.5 pb-2">
                        {subcategories.map(sub => {
                           const isSubActive = safeParams?.subcategory === sub.slug;
                           return (
                             <Link 
                               key={sub.id} 
                               href={`/project/${project?.id}/${category.slug}/${sub.slug}`}
                             >
                               <div className={cn(
                                 "block px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer hover:bg-sidebar-accent/50 truncate border-l border-transparent",
                                 isSubActive 
                                   ? "text-sidebar-primary font-medium bg-sidebar-accent/30 border-sidebar-primary" 
                                   : "text-muted-foreground hover:text-sidebar-foreground"
                               )}>
                                 {sub.name}
                               </div>
                             </Link>
                           )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (!project) return <div>Project not found</div>;

  // Derive breadcrumbs
  const currentCategory = categories.find(c => c.slug === safeParams?.category);
  const currentSubcategory = currentCategory 
    ? getCategorySubcategories(currentCategory.id).find(s => s.slug === safeParams?.subcategory)
    : null;

  // Decide what to render in Main Area
  const renderMainContent = () => {
    // SPECIAL CASE: Financing Dashboard (Top Level Category)
    if (currentCategory?.slug === 'financing') {
      return (
        <FinancingView 
          project={project} 
          currentSubcategory={currentSubcategory?.name}
          subcategoryId={currentSubcategory?.id}
        />
      );
    }

    // If deep-linked to a folder, show the folder (Document Library)
    if (currentCategory || currentSubcategory) {
      return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-end justify-between border-b border-border pb-6">
            <div>
               <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">
                 {currentSubcategory?.name || currentCategory?.name}
               </h2>
               <p className="text-muted-foreground mt-1">
                 {currentSubcategory 
                   ? `Manage documents and records for ${currentSubcategory.name}.`
                   : `Folder content for ${currentCategory?.name}.`
                 }
               </p>
            </div>
            <div className="flex gap-2">
              <UploadDocumentDialog 
                projectId={project.id} 
                defaultCategoryId={currentCategory?.id}
                defaultSubcategoryId={currentSubcategory?.id}
              >
                <Button size="sm" className="shadow-lg shadow-primary/20">
                  <Plus className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
              </UploadDocumentDialog>
            </div>
          </div>
          <DocumentLibrary 
             projectId={project.id} 
             categoryId={currentCategory?.id} 
             subcategoryId={currentSubcategory?.id} 
           />
        </div>
      );
    }

    // Otherwise, show the Stage-Specific Dashboard
    switch (project.stage) {
      case 'Evaluation':
        return <EvaluationView project={project} />;
      case 'Development':
        return <DevelopmentView project={project} />;
      case 'Production':
        return <ProductionView project={project} />;
      case 'Archived':
        return (
          <div className="flex flex-col items-center justify-center py-20 opacity-70">
            <Archive className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold text-foreground">Project Archived</h2>
            <p className="text-muted-foreground">This project is read-only.</p>
          </div>
        );
      default:
        return <div>Unknown Stage</div>;
    }
  };

  return (
    <Shell sidebar={<SidebarContent />}>
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/project/${project.id}`}>{project.title}</BreadcrumbLink>
            </BreadcrumbItem>
            {/* Stage Badge in Breadcrumb */}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Badge variant="secondary" className="text-xs font-normal opacity-75">{project.stage}</Badge>
            </BreadcrumbItem>

            {currentCategory && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href={`/project/${project.id}/${currentCategory.slug}`}>
                    {currentCategory.name}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            {currentSubcategory && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentSubcategory.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Content Area */}
        <div className="min-h-[500px]">
          {renderMainContent()}
        </div>
      </div>
    </Shell>
  );
}
