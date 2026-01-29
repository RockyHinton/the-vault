import { useMemo, useState } from "react";
import { Project, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Search, Building2, User, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ProducerDialog } from "@/components/features/ProducerDialog";
import { ProducerDetailsDialog } from "@/components/features/ProducerDetailsDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ProducersViewProps {
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

  const needsApproval = !!status && status !== "Contracted" && status !== "Attached" && status !== "Unavailable / Passed";
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

export default function ProducersView({ project }: ProducersViewProps) {
  const { getProducerProfiles } = useStore();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  const profiles = getProducerProfiles(project.id);
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  const filteredProfiles = profiles.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.company.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q);

    const status = getVisibleStatus(p);
    const matchesStatus = statusFilter === "All" || status === statusFilter;

    return matchesSearch && matchesStatus;
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            Producers
          </h2>
          <p className="text-muted-foreground mt-1 text-lg">
            Manage your producing partners and key team members.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                data-testid="label-status-filter"
                className="text-xs font-medium text-muted-foreground"
              >
                Profile status
              </span>
              <div className="h-7 w-px bg-border/70" />
            </div>

            <div className="w-48">
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

            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search-producers"
                placeholder="Search producers..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <Button data-testid="button-add-producer" onClick={() => setIsAddDialogOpen(true)} className="shadow-lg shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" />
            Add Profile
          </Button>
        </div>
      </div>

      {/* Grid */}
      {filteredProfiles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfiles.map((profile) => {
            const status = getVisibleStatus(profile);
            const attention = getAttentionReasons(profile);

            return (
              <Card
                data-testid={`card-producer-${profile.id}`}
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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              data-testid={`status-approval-producer-${profile.id}`}
                              className={
                                "h-8 w-8 rounded-md border flex items-center justify-center " +
                                (status === "Contracted" || status === "Attached"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                                  : status === "Offered" || status === "Confirmed"
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                                    : "border-rose-500/30 bg-rose-500/10 text-rose-700")
                              }
                            >
                              <AlertCircle className="h-4 w-4" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {status}
                            {attention.length ? ` · ${attention.join(" · ")}` : ""}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <Badge
                        data-testid={`badge-status-producer-${profile.id}`}
                        variant={getStatusBadgeVariant(status)}
                        className="bg-background/50 backdrop-blur-sm"
                      >
                        {status}
                      </Badge>

                      <Badge variant="outline" className="bg-background/50 backdrop-blur-sm">
                        {profile.role}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{profile.name}</h3>
                    <div className="flex items-center text-muted-foreground text-sm mt-1">
                      <Building2 className="h-3.5 w-3.5 mr-1.5" />
                      {profile.company}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    {profile.contactDetails.slice(0, 2).map((contact) => (
                      <div key={contact.id} className="text-sm text-muted-foreground truncate flex items-center gap-2 bg-background/40 p-1.5 rounded-md">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                        <span className="opacity-70 text-xs uppercase w-10">{contact.type}</span>
                        <span className="font-medium text-foreground">{contact.value}</span>
                      </div>
                    ))}
                    {profile.contactDetails.length > 2 && (
                      <div className="text-xs text-muted-foreground pl-2">
                        +{profile.contactDetails.length - 2} more details
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
          <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold text-foreground">No producers added</h3>
          <p className="text-muted-foreground mb-6 max-w-md text-center">
            Start building your team by adding producer profiles. You can track contact details, roles, and more.
          </p>
          <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-producer">
            <Plus className="mr-2 h-4 w-4" />
            Add First Producer
          </Button>
        </div>
      )}

      {/* Add Dialog */}
      <ProducerDialog 
        projectId={project.id} 
        isOpen={isAddDialogOpen} 
        onClose={() => setIsAddDialogOpen(false)} 
      />

      {/* Details Dialog */}
      {selectedProfile && (
        <ProducerDetailsDialog
          profile={selectedProfile}
          isOpen={!!selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
        />
      )}
    </div>
  );
}
