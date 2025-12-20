import { useState } from "react";
import { useStore, Task } from "@/lib/store";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface TaskManagerProps {
  projectId: string;
}

export function TaskManager({ projectId }: TaskManagerProps) {
  const { getProjectTasks, addTask, toggleTaskStatus } = useStore();
  const tasks = getProjectTasks(projectId);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    addTask({
      projectId,
      title: newTaskTitle,
      status: 'Open',
      priority: 'Medium',
      assignedTo: 'Me'
    });
    setNewTaskTitle("");
  };

  const openTasks = tasks.filter(t => t.status !== 'Done');
  const completedTasks = tasks.filter(t => t.status === 'Done');

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-border bg-secondary/10 flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          Task Board <Badge variant="secondary" className="text-xs">{openTasks.length}</Badge>
        </h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="space-y-2">
          <form onSubmit={handleAddTask} className="flex gap-2">
            <Input 
              placeholder="Add a new task..." 
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="bg-background border-border"
            />
            <Button type="submit" size="icon" disabled={!newTaskTitle.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        </div>

        <div className="space-y-1">
          {openTasks.length === 0 && completedTasks.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-sm">
              No tasks yet. Add one to get started.
            </div>
          )}
          
          {openTasks.map(task => (
            <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/20 transition-colors group">
               <Checkbox 
                 checked={false} 
                 onCheckedChange={() => toggleTaskStatus(task.id)}
                 className="mt-1"
               />
               <div className="flex-1 min-w-0">
                 <p className="text-sm font-medium leading-none text-foreground">{task.title}</p>
                 <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                   {task.assignedTo && <span className="bg-secondary px-1.5 py-0.5 rounded text-foreground/80">{task.assignedTo}</span>}
                   {task.priority === 'High' && <span className="text-destructive font-medium">High Priority</span>}
                 </div>
               </div>
            </div>
          ))}
        </div>

        {completedTasks.length > 0 && (
          <div className="pt-4 border-t border-border/50">
             <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Completed</h4>
             <div className="space-y-1">
               {completedTasks.map(task => (
                 <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg opacity-60 hover:opacity-100 transition-opacity">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground line-through decoration-muted-foreground/50">{task.title}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toggleTaskStatus(task.id)} className="h-6 text-xs">
                      Undo
                    </Button>
                 </div>
               ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
