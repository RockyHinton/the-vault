import { useState, useEffect } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { toWorkspaceProject } from "@/features/projects/project-fixture-adapter";
import {
  ProjectWorkspaceProvider,
  useProjectWorkspace,
} from "@/features/projects/workspace-context";
import {
  findWorkspaceCategory,
  workspaceCategoriesFor,
  type WorkspaceCategory,
} from "@/features/projects/workspace-navigation";
import { Shell } from "@/components/layout/Shell";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { folderForWorkspacePath } from "@/features/documents/folders";
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
import { legalCategoryForRoute } from "@/features/legal/categories";
import UnderlyingRightsPage from "@/components/features/UnderlyingRightsPage";
import DistributionView from "@/components/stages/DistributionView";
import { Button } from "@/components/ui/button";
import {
  Folder,
  ChevronDown,
  FileText,
  Users,
  CircleDollarSign,
  Globe,
  Eye,
  Briefcase,
  Clapperboard,
  Archive,
  Scale,
  Calendar,
  User,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { EditProjectMetadataDialog } from "@/components/features/EditProjectMetadataDialog";

const iconMap: Record<WorkspaceCategory["icon"], typeof FileText> = {
  FileText,
  Users,
  CircleDollarSign,
  Globe,
  User,
  Calendar,
  Scale,
};

const stageLabel = { evaluation: "Evaluation", development: "Development", production: "Production" } as const;

function ProjectSidebar({
  categories,
  currentCategorySlug,
  currentSubcategorySlug,
}: {
  categories: WorkspaceCategory[];
  currentCategorySlug?: string;
  currentSubcategorySlug?: string;
}) {
  const { project } = useProjectWorkspace();
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const displayStage = project.archivedAt ? "Archived" : stageLabel[project.stage];

  useEffect(() => {
    if (currentCategorySlug && expanded[currentCategorySlug] === undefined) {
      setExpanded((prev) => ({ ...prev, [currentCategorySlug]: true }));
    }
  }, [currentCategorySlug]);

  const toggleExpand = (slug: string, force?: boolean) => {
    setExpanded((prev) => ({ ...prev, [slug]: force !== undefined ? force : !prev[slug] }));
  };

  return (
    <div className="space-y-4 min-h-full cursor-default select-none">
      <div className="px-2 pt-2">
        <Link href={`/project/${project.id}`}>
          <div className="group px-3 py-3 rounded-xl bg-secondary/5 border border-border/40 hover:bg-secondary/10 hover:border-border cursor-pointer transition-all duration-200">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1.5">
              {displayStage === "Evaluation" && <Eye className="h-3 w-3 text-orange-500" />}
              {displayStage === "Development" && <Briefcase className="h-3 w-3 text-blue-500" />}
              {displayStage === "Production" && <Clapperboard className="h-3 w-3 text-green-500" />}
              {displayStage === "Archived" && <Archive className="h-3 w-3 text-gray-500" />}
              <span>{displayStage}</span>
            </div>
            <div className="font-bold text-base truncate text-foreground group-hover:text-primary transition-colors">
              {project.title}
            </div>
          </div>
        </Link>
      </div>

      <div className="space-y-1 px-2">
        {categories.map((category) => {
          const Icon = iconMap[category.icon] ?? Folder;
          const isSelected = currentCategorySlug === category.slug;
          const isExpanded = expanded[category.slug];
          const hasSubcategories = category.subcategories.length > 0;
          const isMainActive = isSelected && !currentSubcategorySlug;

          return (
            <div key={category.slug} className="space-y-0.5">
              <div
                className={cn(
                  "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 text-sm font-medium",
                  isMainActive
                    ? "bg-primary/10 text-primary hover:bg-primary/15 shadow-sm"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasSubcategories) {
                    setLocation(`/project/${project.id}/${category.slug}`);
                    return;
                  }
                  if (!isExpanded) {
                    toggleExpand(category.slug, true);
                    setLocation(`/project/${project.id}/${category.slug}`);
                  } else if (currentCategorySlug !== category.slug) {
                    setLocation(`/project/${project.id}/${category.slug}`);
                  } else {
                    toggleExpand(category.slug, false);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isMainActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span>{category.name}</span>
                </div>
                {hasSubcategories && (
                  <div
                    className="p-1 rounded-sm hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(category.slug);
                    }}
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground/70 transition-transform duration-300",
                        isExpanded ? "rotate-0" : "-rotate-90",
                      )}
                    />
                  </div>
                )}
              </div>

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
                      <div className="relative border-l border-border/40 ml-[-13px] pl-[13px] space-y-0.5">
                        {category.subcategories.map((sub) => {
                          const isSubActive = currentSubcategorySlug === sub.slug;
                          return (
                            <Link key={sub.slug} href={`/project/${project.id}/${category.slug}/${sub.slug}`}>
                              <div
                                className={cn(
                                  "block px-3 py-1.5 rounded-md text-sm transition-all duration-200 cursor-pointer truncate",
                                  isSubActive
                                    ? "text-primary font-medium bg-primary/5"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30",
                                )}
                              >
                                {sub.name}
                              </div>
                            </Link>
                          );
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
}

/**
 * Bridge for screens that have not been migrated yet: they still read the
 * prototype workspace shape and their fixture state from the store. Each
 * domain migration removes its screen from here. Documents, Evaluation,
 * Project Notes, Producers, Creatives, Underlying Rights and Documentation
 * are served from server state in WorkspaceShell.
 */
function PrototypeContent({
  categorySlug,
  subcategorySlug,
}: {
  categorySlug?: string;
  subcategorySlug?: string;
}) {
  const { project: apiProject } = useProjectWorkspace();
  const { registerTransientProject, projects, setCurrentProject } = useStore();
  const transientFeatureState = projects.find((candidate) => candidate.id === apiProject.id);

  useEffect(() => {
    setCurrentProject(apiProject.id);
    registerTransientProject(toWorkspaceProject(apiProject));
  }, [apiProject, registerTransientProject, setCurrentProject]);

  if (!transientFeatureState) return <div>Preparing workspace…</div>;
  const project = toWorkspaceProject(apiProject, transientFeatureState);
  const currentCategory = findWorkspaceCategory(categorySlug);
  const currentSubcategory = currentCategory?.subcategories.find((s) => s.slug === subcategorySlug);
  const folder = folderForWorkspacePath(categorySlug, subcategorySlug);

  if (currentCategory?.slug === "financing") {
    return <FinancingView project={project} currentSubcategory={currentSubcategory?.name} subcategoryId={currentSubcategory?.slug} folder={folder} />;
  }
  if (currentCategory?.slug === "schedules") {
    return <SchedulesView project={project} currentSubcategory={currentSubcategory?.name} subcategoryId={currentSubcategory?.slug} folder={folder} />;
  }
  if (currentCategory?.slug === "script") return <ScriptView project={project} />;
  if (currentCategory?.slug === "distribution") return <DistributionView project={project} />;
  if (currentCategory) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
            <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">
              {currentSubcategory?.name || currentCategory.name}
            </h2>
            <p className="text-muted-foreground mt-1">Documents and records for {currentSubcategory?.name || currentCategory.name}.</p>
          </div>
        </div>
        <DocumentLibrary projectId={project.id} folder={folder} />
      </div>
    );
  }

  switch (project.stage) {
    case "Development":
      return <DevelopmentView project={project} />;
    case "Production":
      return <ProductionView project={project} />;
    case "Archived":
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
}

function WorkspaceShell({ categorySlug, subcategorySlug }: { categorySlug?: string; subcategorySlug?: string }) {
  const { project, isStudioAdmin } = useProjectWorkspace();
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const categories = workspaceCategoriesFor(project);
  const currentCategory = findWorkspaceCategory(categorySlug);
  const currentSubcategory = currentCategory?.subcategories.find((s) => s.slug === subcategorySlug);
  const displayStage = project.archivedAt ? "Archived" : stageLabel[project.stage];

  return (
    <Shell
      sidebar={
        <ProjectSidebar categories={categories} currentCategorySlug={categorySlug} currentSubcategorySlug={subcategorySlug} />
      }
    >
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-6">
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <Link href={`/project/${project.id}`} className="flex items-center gap-2 group">
              <div className="h-8 w-8 bg-primary/10 rounded-md flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-xl text-foreground tracking-tight">{project.title}</h1>
                  <Badge variant="outline" className="text-[10px] h-5 font-normal bg-secondary/50">
                    {displayStage}
                  </Badge>
                </div>
                {(currentCategory || currentSubcategory) && (
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80 mt-0.5">
                    <span>Dashboard</span>
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
          {isStudioAdmin && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setMetadataDialogOpen(true)}>
                Edit metadata
              </Button>
            </div>
          )}
        </div>
        {isStudioAdmin && (
          <EditProjectMetadataDialog
            project={toWorkspaceProject(project)}
            open={metadataDialogOpen}
            onOpenChange={setMetadataDialogOpen}
          />
        )}

        <div className="min-h-[500px]">
          {categorySlug === "project-notes" ? (
            <ProjectNotesView />
          ) : categorySlug === "producers" ? (
            <ProducersView />
          ) : categorySlug === "creatives" ? (
            <CreativesView />
          ) : categorySlug === "underlying-rights" ? (
            <UnderlyingRightsPage />
          ) : categorySlug === "legal" && !subcategorySlug ? (
            <LegalView />
          ) : categorySlug === "legal" && currentSubcategory && legalCategoryForRoute(currentSubcategory.slug) ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-end justify-between border-b border-border pb-6">
                <div>
                  <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">{currentSubcategory.name}</h2>
                  <p className="text-muted-foreground mt-1">Manage {currentSubcategory.name.toLowerCase()} documentation and records.</p>
                </div>
              </div>
              <DocumentationEntityPage category={legalCategoryForRoute(currentSubcategory.slug)!} />
            </div>
          ) : !categorySlug && project.stage === "evaluation" && !project.archivedAt ? (
            <EvaluationView />
          ) : categorySlug === "documents" ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="border-b border-border pb-6">
                <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">Documents</h2>
                <p className="text-muted-foreground mt-1">Every file stored for this project, across all folders.</p>
              </div>
              <DocumentLibrary projectId={project.id} />
            </div>
          ) : (
            <PrototypeContent categorySlug={categorySlug} subcategorySlug={subcategorySlug} />
          )}
        </div>
      </div>
    </Shell>
  );
}

export default function ProjectWorkspace() {
  const [, params] = useRoute("/project/:id/:category?/:subcategory?");
  const safeParams = params as { id: string; category?: string; subcategory?: string } | null;

  return (
    <ProjectWorkspaceProvider
      projectId={safeParams?.id}
      loading={<div>Loading project…</div>}
      notFound={<div>Project not found</div>}
    >
      <WorkspaceShell categorySlug={safeParams?.category} subcategorySlug={safeParams?.subcategory} />
    </ProjectWorkspaceProvider>
  );
}
