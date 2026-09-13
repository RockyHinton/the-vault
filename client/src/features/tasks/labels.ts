import {
  taskCategorySchema,
  taskPrioritySchema,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
} from "@shared/contracts";

export const taskCategories = taskCategorySchema.options;
export const taskPriorities = taskPrioritySchema.options;

export const taskCategoryLabels: Record<TaskCategory, string> = {
  finance: "Finance",
  talent: "Talent",
  legal: "Legal",
  production: "Production",
  general: "General",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  open: "Open",
  done: "Done",
};
