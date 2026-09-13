import { useMemo, useState } from "react";
import type { EngagementStatus, Person } from "@shared/contracts";
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
import { AlertCircle, Building2, Plus, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectWorkspace } from "@/features/projects/workspace-context";
import { usePeople } from "@/features/people/use-people";
import {
  attentionReasons,
  engagementStatusLabel,
  engagementStatusLabels,
  engagementStatuses,
  statusBadgeVariant,
  statusTone,
} from "@/features/people/labels";
import { PersonFormDialog } from "@/components/people/PersonFormDialog";
import { PersonDetailsDialog } from "@/components/people/PersonDetailsDialog";

const NOT_SET = "not_set";
type StatusFilter = "all" | typeof NOT_SET | EngagementStatus;

const toneClass = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  attention: "border-rose-500/30 bg-rose-500/10 text-rose-700",
} as const;

/** Producers and partners engaged with the project, from server state. */
export default function ProducersView() {
  const { project } = useProjectWorkspace();
  const peopleQuery = usePeople(project.id, "producer");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const people = useMemo(() => peopleQuery.data?.data.items ?? [], [peopleQuery.data]);
  const selected = people.find((person) => person.id === selectedId) ?? null;

  const matchesStatus = (person: Person) =>
    statusFilter === "all" ||
    (statusFilter === NOT_SET
      ? person.engagement.status === null
      : person.engagement.status === statusFilter);
  const filtered = people.filter((person) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      person.name.toLowerCase().includes(q) ||
      (person.company ?? "").toLowerCase().includes(q) ||
      person.roleTitle.toLowerCase().includes(q);
    return matchesSearch && matchesStatus(person);
  });

  const counts = useMemo(() => {
    const byStatus = new Map<StatusFilter, number>();
    for (const person of people) {
      const key: StatusFilter = person.engagement.status ?? NOT_SET;
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
    }
    return byStatus;
  }, [people]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
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
              <span className="text-xs font-medium text-muted-foreground">Profile status</span>
              <div className="h-7 w-px bg-border/70" />
            </div>
            <div className="w-48">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="bg-background/50" aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({people.length})</SelectItem>
                  <SelectItem value={NOT_SET}>Not set ({counts.get(NOT_SET) ?? 0})</SelectItem>
                  {engagementStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {engagementStatusLabels[status]} ({counts.get(status) ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search producers"
                placeholder="Search producers..."
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="shadow-lg shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" />
            Add Profile
          </Button>
        </div>
      </div>

      {peopleQuery.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading producers…</p>
      ) : peopleQuery.isError ? (
        <p className="text-sm text-destructive py-8 text-center">Producers could not be loaded.</p>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((person) => {
            const status = person.engagement.status;
            const reasons = attentionReasons(person);
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
                      <Badge variant="outline" className="bg-background/50 backdrop-blur-sm">
                        {person.roleTitle}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                      {person.name}
                    </h3>
                    <div className="flex items-center text-muted-foreground text-sm mt-1">
                      <Building2 className="h-3.5 w-3.5 mr-1.5" />
                      {person.company}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
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
                      <div className="text-xs text-muted-foreground pl-2">
                        +{person.contacts.length - 2} more details
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
          <h3 className="text-xl font-semibold text-foreground">
            {people.length === 0 ? "No producers added" : "No producers match"}
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md text-center">
            {people.length === 0
              ? "Start building your team by adding producer profiles. You can track contact details, roles, and more."
              : "Try adjusting your filters or search."}
          </p>
          {people.length === 0 && (
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Producer
            </Button>
          )}
        </div>
      )}

      <PersonFormDialog projectId={project.id} kind="producer" open={isAddOpen} onOpenChange={setIsAddOpen} />
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
