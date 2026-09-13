import { useMemo, useState } from "react";
import type { CreativeRoleType, EngagementStatus, Person } from "@shared/contracts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertCircle, Plus, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { usePeople } from "@/features/people/use-people";
import {
  attentionReasons,
  creativeRoleTypeLabels,
  creativeRoleTypes,
  engagementStatusLabel,
  engagementStatusLabels,
  engagementStatuses,
  statusBadgeVariant,
  statusTone,
} from "@/features/people/labels";
import { PersonFormDialog } from "@/components/people/PersonFormDialog";
import { PersonDetailsDialog, creativeRoleIcon } from "@/components/people/PersonDetailsDialog";

const NOT_SET = "not_set";
type StatusFilter = "all" | typeof NOT_SET | EngagementStatus;
type RoleFilter = "all" | CreativeRoleType;

const toneClass = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  attention: "border-rose-500/30 bg-rose-500/10 text-rose-700",
} as const;

const firstButtonLabel: Record<RoleFilter, string> = {
  all: "Add First Creative",
  director: "Add First Director",
  cast: "Add First Cast Member",
  head_of_department: "Add First Head of Department",
};

/** Directors, cast and heads of department engaged with the project, from server state. */
export default function CreativesView() {
  const { project } = useProjectWorkspace();
  const peopleQuery = usePeople(project.id, "creative");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const people = useMemo(() => peopleQuery.data?.data.items ?? [], [peopleQuery.data]);
  const selected = people.find((person) => person.id === selectedId) ?? null;

  const filtered = people.filter((person: Person) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || person.name.toLowerCase().includes(q) || person.roleTitle.toLowerCase().includes(q);
    const matchesRole = roleFilter === "all" || person.creativeRoleType === roleFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === NOT_SET
        ? person.engagement.status === null
        : person.engagement.status === statusFilter);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const counts = useMemo(() => {
    const byStatus = new Map<StatusFilter, number>();
    let needsAttention = 0;
    for (const person of people) {
      const key: StatusFilter = person.engagement.status ?? NOT_SET;
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
      if (attentionReasons(person).length) needsAttention += 1;
    }
    return { byStatus, needsAttention };
  }, [people]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
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
          <Button onClick={() => setIsAddOpen(true)} className="shadow-lg shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" />
            Add Creative
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex items-center gap-2 p-1 bg-secondary/10 rounded-lg border border-border/50" role="group" aria-label="Role type">
            {(["all", ...creativeRoleTypes] as RoleFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={roleFilter === filter}
                onClick={() => setRoleFilter(filter)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  roleFilter === filter
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/20",
                )}
              >
                {filter === "all" ? "All" : creativeRoleTypeLabels[filter]}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Profile status</span>
              <div className="h-7 w-px bg-border/70" />
            </div>
            <div className="w-full sm:w-56">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="bg-background/50" aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({people.length})</SelectItem>
                  <SelectItem value={NOT_SET}>Not set ({counts.byStatus.get(NOT_SET) ?? 0})</SelectItem>
                  {engagementStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {engagementStatusLabels[status]} ({counts.byStatus.get(status) ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search creatives"
                placeholder="Search creatives..."
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        </div>

        {counts.needsAttention > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-destructive/60" />
            <span>{counts.needsAttention} profile(s) need attention</span>
          </div>
        )}
      </div>

      {peopleQuery.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading creatives…</p>
      ) : peopleQuery.isError ? (
        <p className="text-sm text-destructive py-8 text-center">Creatives could not be loaded.</p>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((person) => {
            const status = person.engagement.status;
            const reasons = attentionReasons(person);
            const roleType = person.creativeRoleType;
            return (
              <Card
                key={person.id}
                data-testid="person-card"
                role="button"
                tabIndex={0}
                className="group cursor-pointer hover:border-primary/50 transition-all duration-300 hover:shadow-md bg-secondary/5 border-secondary"
                onClick={() => setSelectedId(person.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(person.id);
                  }
                }}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 text-xl font-bold">
                      {person.name.charAt(0)}
                    </div>
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "h-8 w-8 rounded-md border flex items-center justify-center",
                                toneClass[statusTone(status)],
                              )}
                            >
                              <AlertCircle className="h-4 w-4" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {engagementStatusLabel(status)}
                            {reasons.length ? ` · ${reasons.join(" · ")}` : ""}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Badge variant={statusBadgeVariant(status)} className="bg-background/50 backdrop-blur-sm">
                        {engagementStatusLabel(status)}
                      </Badge>
                      <Badge
                        variant={roleType === "director" ? "default" : roleType === "cast" ? "secondary" : "outline"}
                        className="bg-opacity-90"
                      >
                        {roleType ? creativeRoleTypeLabels[roleType] : "Creative"}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                      {person.name}
                    </h3>
                    <div className="flex items-center text-muted-foreground text-sm mt-1">
                      {creativeRoleIcon(roleType, "h-3.5 w-3.5 mr-1.5")}
                      {person.roleTitle}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    {person.agent && (
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-2 bg-background/40 p-1.5 rounded-md">
                        <span className="opacity-70 font-semibold w-10">REP</span>
                        <span className="font-medium text-foreground">{person.agent}</span>
                      </div>
                    )}
                    {person.contacts.slice(0, 2).map((contact, index) => (
                      <div
                        key={`${contact.type}-${index}`}
                        className="text-sm text-muted-foreground truncate flex items-center gap-2 bg-background/40 p-1.5 rounded-md"
                      >
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                        <span className="opacity-70 text-xs uppercase w-10 truncate">{contact.type}</span>
                        <span className="font-medium text-foreground truncate">{contact.value}</span>
                      </div>
                    ))}
                    {person.contacts.length > 2 && (
                      <div className="text-xs text-muted-foreground pl-2">+ more details</div>
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
            {search || roleFilter !== "all" || statusFilter !== "all"
              ? "Try adjusting your filters or search."
              : "Start building your creative team by adding profiles."}
          </p>
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {firstButtonLabel[roleFilter]}
          </Button>
        </div>
      )}

      <PersonFormDialog projectId={project.id} kind="creative" open={isAddOpen} onOpenChange={setIsAddOpen} />
      {selected && (
        <PersonDetailsDialog
          person={selected}
          open={selectedId !== null}
          onOpenChange={(open) => !open && setSelectedId(null)}
        />
      )}
    </div>
  );
}
