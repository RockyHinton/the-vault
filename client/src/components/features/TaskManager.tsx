import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { Task, TaskCategory, TaskPriority } from "@shared/contracts";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  CheckCircle2,
  Trash2,
  User,
  UserCheck,
  Clock,
  FileText,
  Filter,
  Gavel,
  Video,
  DollarSign,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser, useIsStudioAdmin } from "@/features/auth/use-current-user";
import { useUserDirectory } from "@/features/users/use-users";
import {
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useReopenTask,
  useTasks,
} from "@/features/tasks/use-tasks";
import {
  taskCategories,
  taskCategoryLabels,
  taskPriorities,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/features/tasks/labels";

interface TaskManagerProps {
  projectId: string;
}

const categoryStyle: Record<TaskCategory, { badge: string; stripe: string; icon: typeof User }> = {
  finance: {
    badge: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    stripe: "bg-emerald-500",
    icon: DollarSign,
  },
  talent: {
    badge: "text-purple-500 bg-purple-500/10 border-purple-500/20",
    stripe: "bg-purple-500",
    icon: User,
  },
  legal: {
    badge: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    stripe: "bg-blue-500",
    icon: Gavel,
  },
  production: {
    badge: "text-orange-500 bg-orange-500/10 border-orange-500/20",
    stripe: "bg-orange-500",
    icon: Video,
  },
  general: {
    badge: "text-gray-500 bg-gray-500/10 border-gray-500/20",
    stripe: "bg-gray-500",
    icon: Layers,
  },
};

const UNASSIGNED = "unassigned";

/**
 * The project task board. Anyone on the team creates, assigns, completes and
 * reopens; the creator or a studio_admin deletes. All state is server state.
 */
export function TaskManager({ projectId }: TaskManagerProps) {
  const currentUserId = useCurrentUser().data?.data.user.id;
  const isStudioAdmin = useIsStudioAdmin();
  const tasksQuery = useTasks(projectId);
  const directoryQuery = useUserDirectory();
  const create = useCreateTask();
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  const remove = useDeleteTask();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("general");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeUserId, setAssigneeUserId] = useState<string>(UNASSIGNED);
  const [filter, setFilter] = useState<TaskCategory | "all">("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tasks = tasksQuery.data?.data.items ?? [];
  const people = directoryQuery.data?.data.items ?? [];
  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.category === filter);
  const openTasks = filtered.filter((t) => t.status === "open");
  const doneTasks = filtered.filter((t) => t.status === "done");
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

  const canDelete = (task: Task) =>
    task.createdBy.id === currentUserId || isStudioAdmin;

  const resetDraft = () => {
    setTitle("");
    setDescription("");
    setCategory("general");
    setPriority("medium");
    setAssigneeUserId(UNASSIGNED);
  };

  const submitTask = async () => {
    try {
      await create.mutateAsync({
        projectId,
        input: {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          priority,
          assigneeUserId: assigneeUserId === UNASSIGNED ? null : assigneeUserId,
        },
      });
      resetDraft();
      setIsAddOpen(false);
    } catch {
      // Reported by the mutation hook; keep the dialog open.
    }
  };

  const toggleStatus = (task: Task) => {
    const variables = { projectId, taskId: task.id, version: task.version };
    if (task.status === "open") complete.mutate(variables);
    else reopen.mutate(variables);
  };

  const deleteTask = (task: Task) => {
    remove.mutate({ projectId, taskId: task.id, version: task.version });
    if (selectedId === task.id) setSelectedId(null);
  };

  const meta = (task: Task) => (
    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <User className="h-3 w-3" /> {task.createdBy.displayName}
      </span>
      <span className="flex items-center gap-1">
        <UserCheck className="h-3 w-3" />
        {task.assignee ? task.assignee.displayName : "Unassigned"}
      </span>
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
      </span>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden h-full flex flex-col shadow-sm">
      <div className="p-4 border-b border-border bg-secondary/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            Team Tasks{" "}
            <Badge variant="secondary" className="text-xs">
              {openTasks.length}
            </Badge>
          </h3>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Task</DialogTitle>
                <DialogDescription>Create an item for the team board.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="task-title">Title</Label>
                  <Input
                    id="task-title"
                    placeholder="What needs to be done?"
                    value={title}
                    maxLength={200}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="task-category">Category</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                      <SelectTrigger id="task-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {taskCategories.map((option) => (
                          <SelectItem key={option} value={option}>
                            {taskCategoryLabels[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-priority">Priority</Label>
                    <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                      <SelectTrigger id="task-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {taskPriorities.map((option) => (
                          <SelectItem key={option} value={option}>
                            {taskPriorityLabels[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-assignee">Assignee</Label>
                  <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                    <SelectTrigger id="task-assignee">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {people.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-description">Details (optional)</Label>
                  <Textarea
                    id="task-description"
                    placeholder="Add more context…"
                    value={description}
                    maxLength={4000}
                    onChange={(event) => setDescription(event.target.value)}
                    className="resize-none h-24"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submitTask} disabled={!title.trim() || create.isPending}>
                  {create.isPending ? "Creating…" : "Create Task"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Button
            variant={filter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter("all")}
            className="h-7 text-xs"
          >
            All
          </Button>
          {taskCategories.map((option) => {
            const style = categoryStyle[option];
            const Icon = style.icon;
            return (
              <Button
                key={option}
                variant="ghost"
                size="sm"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className={cn(
                  "h-7 text-xs border transition-all",
                  filter === option
                    ? style.badge + " font-medium shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                )}
              >
                <Icon className="h-3 w-3 mr-1.5" />
                {taskCategoryLabels[option]}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-secondary/5">
        <div className="grid grid-cols-1 gap-3">
          {tasksQuery.isLoading && (
            <div className="text-muted-foreground text-sm">Loading tasks…</div>
          )}
          {tasksQuery.isError && (
            <div className="text-destructive text-sm" role="alert">Tasks could not be loaded.</div>
          )}
          {tasksQuery.isSuccess && openTasks.length === 0 && doneTasks.length === 0 && (
            <div className="text-center text-muted-foreground py-12 text-sm border-2 border-dashed border-border rounded-lg bg-card/50">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
              No tasks yet. Add one to get started.
            </div>
          )}

          {openTasks.map((task) => {
            const style = categoryStyle[task.category];
            return (
              <div
                key={task.id}
                data-testid="task-card"
                className="group relative bg-card hover:bg-card/80 p-4 rounded-lg border border-border transition-all hover:shadow-md cursor-pointer"
                onClick={() => setSelectedId(task.id)}
              >
                <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-lg", style.stripe)} />
                <div className="flex items-start gap-3 pl-2">
                  <div onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={`Complete ${task.title}`}
                      checked={false}
                      disabled={complete.isPending}
                      onCheckedChange={() => toggleStatus(task)}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-medium text-foreground line-clamp-1">{task.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] px-1.5 h-5 border-0 font-normal", style.badge)}
                        >
                          {taskCategoryLabels[task.category]}
                        </Badge>
                        {task.priority === "high" && (
                          <Badge variant="destructive" className="text-[10px] px-1 h-5">
                            High
                          </Badge>
                        )}
                      </div>
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                    )}
                    {meta(task)}
                  </div>
                  {canDelete(task) && (
                    <div
                      className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity absolute top-2 right-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${task.title}`}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteTask(task)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {doneTasks.length > 0 && (
          <div className="pt-6 border-t border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Completed Items
            </h4>
            <div className="space-y-2 opacity-60">
              {doneTasks.map((task) => {
                const style = categoryStyle[task.category];
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-card/30 border border-transparent hover:border-border transition-colors"
                  >
                    <button
                      type="button"
                      aria-label={`Reopen ${task.title}`}
                      className="mt-0.5"
                      onClick={() => toggleStatus(task)}
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] px-1 h-4 border-0 font-normal opacity-70", style.badge)}
                        >
                          {taskCategoryLabels[task.category]}
                        </Badge>
                        <p className="text-sm text-muted-foreground line-through decoration-muted-foreground/50 truncate">
                          {task.title}
                        </p>
                      </div>
                    </div>
                    {canDelete(task) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${task.title}`}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteTask(task)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={selectedTask !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="sm:max-w-[600px]">
          {selectedTask && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between pr-8">
                  <div className="space-y-1">
                    <DialogTitle className="text-xl flex items-center gap-2">
                      {selectedTask.title}
                    </DialogTitle>
                    <DialogDescription asChild>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-2">
                        <Badge
                          variant={selectedTask.status === "done" ? "secondary" : "default"}
                          className={
                            selectedTask.status === "done"
                              ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                              : ""
                          }
                        >
                          {taskStatusLabels[selectedTask.status]}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn("text-xs font-normal", categoryStyle[selectedTask.category].badge)}
                        >
                          {taskCategoryLabels[selectedTask.category]}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-normal">
                          {taskPriorityLabels[selectedTask.priority]} priority
                        </Badge>
                        <span>•</span>
                        <span>Posted by {selectedTask.createdBy.displayName}</span>
                        <span>•</span>
                        <span>
                          Assigned to{" "}
                          {selectedTask.assignee ? selectedTask.assignee.displayName : "nobody"}
                        </span>
                      </div>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="py-4 space-y-4">
                <div className="bg-secondary/20 p-4 rounded-lg border border-secondary">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedTask.description ?? "No additional details provided."}
                  </p>
                </div>
              </div>

              <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
                <div className="flex gap-2">
                  {canDelete(selectedTask) && (
                    <Button variant="destructive" size="sm" onClick={() => deleteTask(selectedTask)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelectedId(null)}>
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      toggleStatus(selectedTask);
                      setSelectedId(null);
                    }}
                  >
                    {selectedTask.status === "done" ? "Mark as Open" : "Mark as Done"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
