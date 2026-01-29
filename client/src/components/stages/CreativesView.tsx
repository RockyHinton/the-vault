import { useMemo, useState } from "react";
import { Project, useStore, CreativeRoleType } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, User, Clapperboard, Star, HardHat, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CreativeDialog } from "@/components/features/CreativeDialog";
import { CreativeDetailsDialog } from "@/components/features/CreativeDetailsDialog";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CreativesViewProps {
  project: Project;
}

const STATUS_OPTIONS = [
  "Not set",
  "Identified",
  "Contacted",
  "Interested",
  "Offered",
  "Confirmed",
  "Contracted",
  "Attached",
  "Unavailable / Passed",
] as const;

type StatusFilter = "All" | (typeof STATUS_OPTIONS)[number];

type AttentionReason = "Contract pending" | "Missing docs" | "Needs approval";

const getVisibleStatus = (profile: any) => {
  const s = profile?.engagement?.status;
  if (!s) return "Not set";
  return s as (typeof STATUS_OPTIONS)[number];
};

const getAttentionReasons = (profile: any): AttentionReason[] => {
  const reasons: AttentionReason[] = [];
  const status = profile?.engagement?.status || "";
  const contractStatus = profile?.engagement?.contractStatus || "";

  if ((status === "Offered" || status === "Confirmed" || status === "Contracted" || status === "Attached") && contractStatus && contractStatus !== "Signed") {
    reasons.push("Contract pending");
  }

  const docs = profile?.profileDocuments || [];
  const hasApprovedOrSigned = docs.some((d: any) => d.status === "Approved" || d.status === "Signed");
  if (!hasApprovedOrSigned) {
    reasons.push("Missing docs");
  }

  const needsApproval = status !== "Contracted" && status !== "Attached" && status !== "Unavailable / Passed";
  if (needsApproval) {
    reasons.push("Needs approval");
  }

  return reasons;
};

const getStatusBadgeVariant = (status: string) => {
  if (status === "Contracted" || status === "Attached") return "default" as const;
  if (status === "Unavailable / Passed") return "destructive" as const;
  if (status === "Offered" || status === "Confirmed" || status === "Interested") return "secondary" as const;
  return "outline" as const;
};

export default function CreativesView({ project }: CreativesViewProps) {
  const { getCreativeProfiles } = useStore();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<CreativeRoleType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  const profiles = getCreativeProfiles(project.id);
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  const filteredProfiles = profiles.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) || p.specificRole.toLowerCase().includes(q);
    const matchesRole = roleFilter === 'All' || p.roleType === roleFilter;

    const status = getVisibleStatus(p);
    const matchesStatus = statusFilter === "All" || status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const counts = useMemo(() => {
    const all = profiles.length;
    const byStatus: Record<string, number> = {};
    STATUS_OPTIONS.forEach((s) => (byStatus[s] = 0));
    let needsAttention = 0;

    profiles.forEach((p) => {
      const s = getVisibleStatus(p);
      byStatus[s] = (byStatus[s] || 0) + 1;
      if (getAttentionReasons(p).length) needsAttention += 1;
    });

    return { all, byStatus, needsAttention };
  }, [profiles]);

  const getRoleIcon = (roleType: string) => {
    switch(roleType) {
      case 'Director': return <Clapperboard className="h-3.5 w-3.5 mr-1.5" />;
      case 'Cast': return <Star className="h-3.5 w-3.5 mr-1.5" />;
      case 'Head of Department': return <HardHat className="h-3.5 w-3.5 mr-1.5" />;
      default: return <User className="h-3.5 w-3.5 mr-1.5" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
            <User className="h-8 w-8 text-primary" />
            Creatives
          </h2>
          <p className="text-muted-foreground mt-1 text-lg">
            Manage directors, cast, and heads of department.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsAddDialogOpen(true)} className="shadow-lg shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" />
            Add Creative
          </Button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex items-center gap-2 p-1 bg-secondary/10 rounded-lg border border-border/50">
            {(['All', 'Director', 'Cast', 'Head of Department'] as const).map((filter) => (
              <button
                data-testid={`button-role-filter-${filter}`}
                key={filter}
                onClick={() => setRoleFilter(filter)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  roleFilter === filter
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/20"
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div className="w-full sm:w-56">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger data-testid="select-status-filter" className="bg-background/50">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All ({counts.all})</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s} ({counts.byStatus[s] || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search-creatives"
                placeholder="Search creatives..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {counts.needsAttention > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-destructive/60" />
            <span data-testid="text-needs-attention-count">{counts.needsAttention} profile(s) need attention</span>
          </div>
        )}
      </div>

      {/* Grid */}
      {filteredProfiles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfiles.map((profile) => {
            const status = getVisibleStatus(profile);
            const attention = getAttentionReasons(profile);

            return (
              <Card
                data-testid={`card-creative-${profile.id}`}
                key={profile.id}
                className="group cursor-pointer hover:border-primary/50 transition-all duration-300 hover:shadow-md bg-secondary/5 border-secondary"
                onClick={() => setSelectedProfileId(profile.id)}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 text-xl font-bold">
                      {profile.name.charAt(0)}
                    </div>

                    <div className="flex items-center gap-2">
                      {attention.length > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                data-testid={`status-attention-creative-${profile.id}`}
                                className="h-8 w-8 rounded-md border border-destructive/30 bg-destructive/10 text-destructive flex items-center justify-center"
                              >
                                <AlertCircle className="h-4 w-4" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              Needs attention: {attention.join(" · ")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      <Badge
                        data-testid={`badge-status-creative-${profile.id}`}
                        variant={getStatusBadgeVariant(status)}
                        className="bg-background/50 backdrop-blur-sm"
                      >
                        {status}
                      </Badge>

                      <Badge
                        variant={
                          profile.roleType === 'Director' ? 'default' :
                          profile.roleType === 'Cast' ? 'secondary' : 'outline'
                        }
                        className="bg-opacity-90"
                      >
                        {profile.roleType}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{profile.name}</h3>
                    <div className="flex items-center text-muted-foreground text-sm mt-1">
                      {getRoleIcon(profile.roleType)}
                      {profile.specificRole}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    {profile.agent && (
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-2 bg-background/40 p-1.5 rounded-md">
                        <span className="opacity-70 font-semibold w-10">REP</span>
                        <span className="font-medium text-foreground">{profile.agent}</span>
                      </div>
                    )}
                    {profile.contactDetails.slice(0, 2).map((contact) => (
                      <div key={contact.id} className="text-sm text-muted-foreground truncate flex items-center gap-2 bg-background/40 p-1.5 rounded-md">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                        <span className="opacity-70 text-xs uppercase w-10 truncate">{contact.type}</span>
                        <span className="font-medium text-foreground truncate">{contact.value}</span>
                      </div>
                    ))}
                    {(profile.contactDetails.length > 2 || (profile.agent && profile.contactDetails.length > 1)) && (
                      <div className="text-xs text-muted-foreground pl-2">
                        + more details
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border/50 rounded-xl bg-secondary/5">
          <User className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold text-foreground">No creatives found</h3>
          <p className="text-muted-foreground mb-6 max-w-md text-center">
            {searchQuery || roleFilter !== 'All' ? "Try adjusting your filters or search." : "Start building your creative team by adding profiles."}
          </p>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add First Creative
          </Button>
        </div>
      )}

      {/* Add Dialog */}
      <CreativeDialog 
        projectId={project.id} 
        isOpen={isAddDialogOpen} 
        onClose={() => setIsAddDialogOpen(false)} 
      />

      {/* Details Dialog */}
      {selectedProfile && (
        <CreativeDetailsDialog
          profile={selectedProfile}
          isOpen={!!selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
        />
      )}
    </div>
  );
}
