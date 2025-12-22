import { useState } from "react";
import { useStore, Task } from "@/lib/store";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Plus, 
  CheckCircle2, 
  Circle, 
  Trash2, 
  User, 
  Clock, 
  FileText,
  MoreVertical
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TaskManagerProps {
  projectId: string;
}

export function TaskManager({ projectId }: TaskManagerProps) {
  const { getProjectTasks, addTask, toggleTaskStatus, deleteTask, user } = useStore();
  const tasks = getProjectTasks(projectId);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    
    addTask({
      projectId,
      title: newTaskTitle,
      description: newTaskDescription,
      status: 'Open',
      priority: 'Medium',
      assignedTo: user?.name || 'Me'
    });
    
    setNewTaskTitle("");
    setNewTaskDescription("");
    setIsAddOpen(false);
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTask(taskId);
    if (selectedTask?.id === taskId) {
      setSelectedTask(null);
    }
  };

  const openTasks = tasks.filter(t => t.status !== 'Done');
  const completedTasks = tasks.filter(t => t.status === 'Done');

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden h-full flex flex-col shadow-sm">
      <div className="p-4 border-b border-border bg-secondary/10 flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          Team Tasks & Notes <Badge variant="secondary" className="text-xs">{openTasks.length}</Badge>
        </h3>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Note
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Task / Note</DialogTitle>
              <DialogDescription>
                Create a new item for the team board.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input 
                  placeholder="What needs to be done?" 
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Details (Optional)</label>
                <Textarea 
                  placeholder="Add more context..." 
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  className="resize-none h-24"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddTask} disabled={!newTaskTitle.trim()}>Post Item</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-secondary/5">
        <div className="grid grid-cols-1 gap-3">
          {openTasks.length === 0 && completedTasks.length === 0 && (
            <div className="text-center text-muted-foreground py-12 text-sm border-2 border-dashed border-border rounded-lg bg-card/50">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
              No tasks or notes yet. Add one to get started.
            </div>
          )}
          
          {openTasks.map(task => (
            <div 
              key={task.id} 
              className="group relative bg-card hover:bg-card/80 p-4 rounded-lg border border-border transition-all hover:shadow-md cursor-pointer"
              onClick={() => setSelectedTask(task)}
            >
               <div className="flex items-start gap-3">
                 <div onClick={(e) => e.stopPropagation()}>
                   <Checkbox 
                     checked={false} 
                     onCheckedChange={() => toggleTaskStatus(task.id)}
                     className="mt-1"
                   />
                 </div>
                 <div className="flex-1 min-w-0 space-y-1">
                   <div className="flex justify-between items-start gap-2">
                     <p className="font-medium text-foreground line-clamp-1">{task.title}</p>
                     {task.priority === 'High' && <Badge variant="destructive" className="text-[10px] px-1 h-5">High</Badge>}
                   </div>
                   
                   {task.description && (
                     <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                   )}
                   
                   <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                     <span className="flex items-center gap-1">
                       <User className="h-3 w-3" /> {task.authorName}
                     </span>
                     <span className="flex items-center gap-1">
                       <Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                     </span>
                   </div>
                 </div>
                 
                 {/* Quick Actions (visible on hover) */}
                 {user?.id === task.authorId && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTask(task.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                 )}
               </div>
            </div>
          ))}
        </div>

        {completedTasks.length > 0 && (
          <div className="pt-6 border-t border-border/50">
             <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
               <CheckCircle2 className="h-4 w-4" />
               Completed Items
             </h4>
             <div className="space-y-2 opacity-60">
               {completedTasks.map(task => (
                 <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg bg-card/30 border border-transparent hover:border-border transition-colors">
                    <div className="mt-0.5" onClick={() => toggleTaskStatus(task.id)}>
                      <CheckCircle2 className="h-4 w-4 text-green-500 cursor-pointer" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground line-through decoration-muted-foreground/50">{task.title}</p>
                    </div>
                    {user?.id === task.authorId && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTask(task.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                 </div>
               ))}
             </div>
          </div>
        )}
      </div>

      {/* Detail View Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="sm:max-w-[600px]">
           {selectedTask && (
             <>
               <DialogHeader>
                 <div className="flex items-start justify-between pr-8">
                   <div className="space-y-1">
                     <DialogTitle className="text-xl">{selectedTask.title}</DialogTitle>
                     <div className="flex items-center gap-2 text-sm text-muted-foreground">
                       <Badge variant={selectedTask.status === 'Done' ? 'secondary' : 'default'} className={selectedTask.status === 'Done' ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' : ''}>
                         {selectedTask.status}
                       </Badge>
                       <span>•</span>
                       <span>Posted by {selectedTask.authorName}</span>
                       <span>•</span>
                       <span>{formatDistanceToNow(new Date(selectedTask.createdAt), { addSuffix: true })}</span>
                     </div>
                   </div>
                 </div>
               </DialogHeader>
               
               <div className="py-4 space-y-4">
                 <div className="bg-secondary/20 p-4 rounded-lg border border-secondary">
                   <p className="text-sm leading-relaxed whitespace-pre-wrap">
                     {selectedTask.description || "No additional details provided."}
                   </p>
                 </div>
               </div>

               <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
                 <div className="flex gap-2">
                    {user?.id === selectedTask.authorId && (
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteTask(selectedTask.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </Button>
                    )}
                 </div>
                 <div className="flex gap-2">
                   <Button variant="outline" onClick={() => setSelectedTask(null)}>Close</Button>
                   <Button 
                     onClick={() => {
                       toggleTaskStatus(selectedTask.id);
                       setSelectedTask(null);
                     }}
                   >
                     {selectedTask.status === 'Done' ? 'Mark as Open' : 'Mark as Done'}
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
