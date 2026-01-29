import { useState, useEffect, useCallback } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { Shell } from "@/components/layout/Shell";
import DocumentLibrary from "@/pages/DocumentLibrary";
import EvaluationView from "@/components/stages/EvaluationView";
import DevelopmentView from "@/components/stages/DevelopmentView";
import ProductionView from "@/components/stages/ProductionView";
import FinancingView from "@/components/stages/FinancingView";
import LegalView from "@/components/stages/LegalView";
import SchedulesView from "@/components/stages/SchedulesView";
import ScriptView from "@/components/stages/ScriptView";
import ProjectNotesView from "@/components/stages/ProjectNotesView";
import ProducersView from "@/components/stages/ProducersView";
import CreativesView from "@/components/stages/CreativesView";
import DocumentationEntityPage from "@/components/features/documentation/DocumentationEntityPage";
import { UploadDocumentDialog } from "@/components/features/UploadDocumentDialog";
import UnderlyingRightsPage from "@/components/features/UnderlyingRightsPage";
import { Button } from "@/components/ui/button";
import { 
  Folder, 
  ChevronDown, 
  FileText,
  Users,
  CircleDollarSign,
  CheckSquare,
  FolderCheck,
  Globe,
  Building2,
  Plus,
  Eye, 
  Briefcase, 
  Clapperboard, 
  Archive,
  Scale,
  Calendar,
  User,
  MoreVertical,
  ChevronRight
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
  Calendar,
  Scale
};

// --- Extracted Sidebar Component ---
// Defined outside to prevent re-mounting on parent re-renders
const ProjectSidebar = ({ 
  project, 
  categories, 
  currentCategorySlug, 
  currentSubcategorySlug,
  getCategorySubcategories
}: {
  project: any;
  categories: any[];
  currentCategorySlug?: string;
  currentSubcategorySlug?: string;
  getCategorySubcategories: (id: string) => any[];
}) => {
  const [location, setLocation] = useLocation();
  
  // Local state for expansion
  // We initialize based on current URL, but then user has full control
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Sync expansion with URL ONLY when entering a new category that isn't expanded yet
  // This ensures deep-linking works, but doesn't force re-expansion if user collapsed it
  useEffect(() => {
    if (currentCategorySlug && expanded[currentCategorySlug] === undefined) {
      setExpanded(prev => ({ ...prev, [currentCategorySlug]: true }));
    }
  }, [currentCategorySlug]);

  const toggleExpand = (slug: string, force?: boolean) => {
    setExpanded(prev => ({
      ...prev,
      [slug]: force !== undefined ? force : !prev[slug]
    }));
  };

  return (
    <div 
      className="space-y-4 min-h-full cursor-default select-none" 
      onClick={(e) => {
        // Clicking empty space deselects / clears focus visually (optional)
        if (e.target === e.currentTarget) {
          // No navigation, just chill
        }
      }}
    >
      {/* Project Header in Sidebar */}
      {project && (
        <div className="px-2 pt-2">
          <Link href={`/project/${project.id}`}>
            <div className="group px-3 py-3 rounded-xl bg-secondary/5 border border-border/40 hover:bg-secondary/10 hover:border-border cursor-pointer transition-all duration-200">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1.5">
                 {project.stage === 'Evaluation' && <Eye className="h-3 w-3 text-orange-500" />}
                 {project.stage === 'Development' && <Briefcase className="h-3 w-3 text-blue-500" />}
                 {project.stage === 'Production' && <Clapperboard className="h-3 w-3 text-green-500" />}
                 {project.stage === 'Archived' && <Archive className="h-3 w-3 text-gray-500" />}
                 <span>{project.stage}</span>
              </div>
              <div className="font-bold text-base truncate text-foreground group-hover:text-primary transition-colors">
                {project.title}
              </div>
            </div>
          </Link>
        </div>
      )}

      <div className="space-y-1 px-2">
        
        {categories.map(category => {
          const Icon = category.icon && iconMap[category.icon] ? iconMap[category.icon] : Folder;
          const isSelected = currentCategorySlug === category.slug;
          const isExpanded = expanded[category.slug];
          const subcategories = getCategorySubcategories(category.id);
          const hasSubcategories = subcategories.length > 0;

          // If selected and no subcategory selected, highlight main
          const isMainActive = isSelected && !currentSubcategorySlug;

          return (
            <div key={category.id} className="space-y-0.5">
              <div 
                className={cn(
                  "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 text-sm font-medium",
                  isMainActive 
                    ? "bg-primary/10 text-primary hover:bg-primary/15" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  // Add subtle left border for active state visual
                  isMainActive && "shadow-sm"
                )}
                onClick={(e) => {
                  e.stopPropagation();

                  // LOGIC:
                  // 1. If has children:
                  //    - If collapsed: Expand & Navigate
                  //    - If expanded: 
                  //        - If we are NOT on this page (e.g. on a different category), Navigate & ensure expanded
                  //        - If we ARE on this page (or a child), Collapse?
                  
                  if (hasSubcategories) {
                    if (!isExpanded) {
                      // Open it up and go there
                      toggleExpand(category.slug, true);
                      setLocation(`/project/${project?.id}/${category.slug}`);
                    } else {
                      // Already expanded
                      if (currentCategorySlug !== category.slug) {
                         // If we are coming from another category, just go there, keep expanded
                         setLocation(`/project/${project?.id}/${category.slug}`);
                      } else {
                         // We are already here (or in a child).
                         // User wants to toggle collapse if they click the header of an open folder
                         toggleExpand(category.slug, false);
                         // Optional: If we collapse, do we navigate up to root? 
                         // User said "don't take me to home page".
                         // If we are in a subcategory and collapse parent, we are technically still viewing the subcategory page, just hiding the menu.
                         // If we are on the parent page, we stay there.
                         // This feels right.
                      }
                    }
                  } else {
                    // No children, simple navigation
                    setLocation(`/project/${project?.id}/${category.slug}`);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn(
                    "h-4 w-4 transition-colors", 
                    isMainActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )} />
                  <span>{category.name}</span>
                </div>
                
                {/* Chevron is strictly for toggling, but the whole row triggers it too now. 
                    We keep it as a visual indicator. 
                    Clicking specifically the chevron could just toggle without navigation?
                    Let's make the chevron distinct if needed, but row-click is usually better for touch/usability.
                */}
                {hasSubcategories && (
                  <div 
                    className="p-1 rounded-sm hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(category.slug); // Just toggle
                    }}
                  >
                    <ChevronDown 
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground/70 transition-transform duration-300",
                        isExpanded ? "transform rotate-0" : "transform -rotate-90"
                      )} 
                    />
                  </div>
                )}
              </div>

              {/* Subcategories List */}
              <AnimatePresence initial={false}>
                {isExpanded && hasSubcategories && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="pl-9 pr-2 space-y-0.5 pb-2 pt-0.5">
                      {/* Optional: Add a subtle line to guide the eye */}
                      <div className="relative border-l border-border/40 ml-[-13px] pl-[13px] space-y-0.5">
                        {subcategories.map(sub => {
                           const isSubActive = currentSubcategorySlug === sub.slug;
                           return (
                             <Link 
                               key={sub.id} 
                               href={`/project/${project?.id}/${category.slug}/${sub.slug}`}
                             >
                               <div className={cn(
                                 "block px-3 py-1.5 rounded-md text-sm transition-all duration-200 cursor-pointer truncate",
                                 isSubActive 
                                   ? "text-primary font-medium bg-primary/5" 
                                   : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                               )}>
                                 {sub.name}
                               </div>
                             </Link>
                           )
                        })}
                      </div>
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

export default function ProjectWorkspace() {
  const [match, params] = useRoute("/project/:id/:category?/:subcategory?");
  const { projects, getProjectCategories, getCategorySubcategories, setCurrentProject } = useStore();
  
  // Cast params
  const safeParams = params as { id: string; category?: string; subcategory?: string } | null;

  // Find current project
  const project = projects.find(p => p.id === safeParams?.id);
  const categories = project ? getProjectCategories(project.id) : [];

  // Sync current project id to store
  useEffect(() => {
    if (safeParams?.id) setCurrentProject(safeParams.id);
  }, [safeParams?.id, setCurrentProject]);

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

    // SPECIAL CASE: Documentation / Legal
    if (currentCategory?.slug === 'legal') {
      // If we are in a subcategory, use the Entity Page System
      if (currentSubcategory) {
        const docTypeKey = currentSubcategory.slug.replace(/-/g, '_');
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-end justify-between border-b border-border pb-6">
                <div>
                   <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">
                     {currentSubcategory.name}
                   </h2>
                   <p className="text-muted-foreground mt-1">
                     Manage {currentSubcategory.name.toLowerCase()} documentation and records.
                   </p>
                </div>
             </div>
             <DocumentationEntityPage project={project} docTypeKey={docTypeKey} />
          </div>
        );
      }

      // Otherwise, show the Legal Dashboard / Checklist
      return (
        <LegalView 
          project={project} 
        />
      );
    }

    // SPECIAL CASE: Schedules Dashboard
    if (currentCategory?.slug === 'schedules') {
      return (
        <SchedulesView 
          project={project} 
          currentSubcategory={currentSubcategory?.name}
          subcategoryId={currentSubcategory?.id}
        />
      );
    }

    // SPECIAL CASE: Script Dashboard (New Redesign)
    if (currentCategory?.slug === 'script') {
      return <ScriptView project={project} />;
    }

    // SPECIAL CASE: Producers (New Redesign)
    if (currentCategory?.slug === 'producers' || safeParams?.category === 'producers' || safeParams?.category === 'producing-partners') {
      return <ProducersView project={project} />;
    }

    // SPECIAL CASE: Creatives (New Redesign for Actors/Directors)
    if (currentCategory?.slug === 'creatives' || safeParams?.category === 'creatives' || safeParams?.category === 'talent') {
      return <CreativesView project={project} />;
    }

    // SPECIAL CASE: Project Notes (New Dedicated Page)
    if (currentCategory?.slug === 'project-notes' || safeParams?.category === 'project-notes') {
      return <ProjectNotesView project={project} />;
    }

    // SPECIAL CASE: Underlying Rights (stage-aware)
    if (currentCategory?.slug === 'underlying-rights' || safeParams?.category === 'underlying-rights') {
      const stage = project.stage === 'Development' ? 'Development' : project.stage === 'Production' ? 'Production' : 'Evaluation';
      return <UnderlyingRightsPage project={project} stage={stage} />;
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
    <Shell sidebar={
      <ProjectSidebar 
        project={project} 
        categories={categories}
        currentCategorySlug={safeParams?.category}
        currentSubcategorySlug={safeParams?.subcategory}
        getCategorySubcategories={getCategorySubcategories}
      />
    }>
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* Breadcrumb Navigation - Removed / Repurposed */}
        {/* We are replacing the standard Breadcrumb with a more robust Project Header Context */}
        
        {/* Context Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-6">
           <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <Link href={`/project/${project.id}`} className="flex items-center gap-2 group">
                 <div className="h-8 w-8 bg-primary/10 rounded-md flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Briefcase className="h-4 w-4 text-primary" />
                 </div>
                 <div>
                    <div className="flex items-center gap-2">
                       <h1 className="font-bold text-xl text-foreground tracking-tight">{project.title}</h1>
                       <Badge variant="outline" className="text-[10px] h-5 font-normal bg-secondary/50">{project.stage}</Badge>
                    </div>
                    {/* Optional: Show current path if deep linked */}
                    {(currentCategory || currentSubcategory) && (
                       <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80 mt-0.5">
                          <span className="hover:underline cursor-pointer">Dashboard</span>
                          {currentCategory && (
                             <>
                               <ChevronRight className="h-3 w-3" />
                               <span className={cn(!currentSubcategory && "text-foreground")}>{currentCategory.name}</span>
                             </>
                          )}
                          {currentSubcategory && (
                             <>
                               <ChevronRight className="h-3 w-3" />
                               <span className="text-foreground">{currentSubcategory.name}</span>
                             </>
                          )}
                       </div>
                    )}
                 </div>
              </Link>
           </div>
           
           {/* Global Project Actions (future proofing) */}
           <div className="flex items-center gap-2">
              {/* Add global actions here later */}
           </div>
        </div>

        {/* Content Area */}
        <div className="min-h-[500px]">
          {renderMainContent()}
        </div>
      </div>
    </Shell>
  );
}
