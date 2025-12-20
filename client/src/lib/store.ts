import { create } from 'zustand';
import { format } from 'date-fns';

// --- Types ---

export type UserRole = 'Admin' | 'Producer' | 'TeamMember' | 'External';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export type ProjectStage = 'Evaluation' | 'Development' | 'Production' | 'Archived';
export type ProjectStatus = 'Active' | 'On Hold' | 'Completed'; // Kept for backward compatibility, but Stage is primary now

export interface EvaluationData {
  writer?: string;
  writerNotes?: string;
  director?: string;
  directorImdb?: string;
  castAttached?: { name: string; role: string; imdb?: string }[];
  producers?: { name: string; notes?: string }[];
  financeType?: 'Grant' | 'Subsidy' | 'Tax Credit' | 'Private';
  financeStatus?: 'Committed' | 'Speculative';
  plannedBudget?: string; // e.g. "$5M"
  scores?: { creative: number; financial: number }; // 1-10
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  assignedTo?: string; // User ID or Name
  status: 'Open' | 'In Progress' | 'Done';
  dueDate?: string;
  priority: 'Low' | 'Medium' | 'High';
}

export interface Project {
  id: string;
  title: string;
  stage: ProjectStage;
  status: ProjectStatus; // Legacy status field, mapped or kept for nuances
  logline: string;
  synopsis: string;
  genre: string;
  createdAt: string;
  updatedAt: string;
  
  // Evaluation Data
  evaluation: EvaluationData;

  // Development Data
  closingChecklist?: {
    keyAgreementsSigned: boolean;
    financeClosed: boolean;
    talentConfirmed: boolean;
    bankingReady: boolean;
    legalDocsInPlace: boolean;
  };
}

export interface Category {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  icon?: string;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
}

export type DocumentType = 'PDF' | 'DOCX' | 'XLSX' | 'IMG' | 'OTHER';
export type DocumentStatus = 'Draft' | 'Final' | 'Signed' | 'Under Review';

export interface Document {
  id: string;
  projectId: string;
  categoryId?: string; // Optional now as some docs might be top-level in a stage view
  subcategoryId?: string;
  title: string;
  type: DocumentType;
  filePath: string; 
  fileSize: string;
  uploadedBy: string;
  uploadedAt: string;
  version: number;
  status: DocumentStatus;
  tags: string[];
  stageContext?: ProjectStage; // Which stage does this document belong to?
}

// --- Mock Data ---

const MOCK_USER: User = {
  id: 'u1',
  name: 'Sarah Producer',
  email: 'sarah@prodco.com',
  role: 'Producer',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
};

const MOCK_TASKS: Task[] = [
  { id: 't1', projectId: 'p1', title: 'Finalize Cast Contracts', status: 'In Progress', priority: 'High', assignedTo: 'Sarah Producer', dueDate: '2023-12-25' },
  { id: 't2', projectId: 'p1', title: 'Location Scout - Tokyo', status: 'Open', priority: 'Medium', assignedTo: 'Mike Finance' },
  { id: 't3', projectId: 'p2', title: 'Script Polish', status: 'Open', priority: 'High', assignedTo: 'Sarah Producer' },
];

const MOCK_PROJECTS: Project[] = [
  {
    id: 'p1',
    title: 'Neon Nights',
    stage: 'Production',
    status: 'Active',
    logline: 'A detective uncovers a conspiracy in a city that never sleeps.',
    synopsis: 'In 2084, New Tokyo is a neon-drenched metropolis controlled by three mega-corporations. When Detective Kaito discovers a synthetic drug that grants telepathic abilities, he becomes the target of the most powerful man in the city.',
    genre: 'Sci-Fi / Thriller',
    createdAt: '2023-10-15T10:00:00Z',
    updatedAt: '2023-12-10T14:30:00Z',
    evaluation: {
      writer: 'Kenji Sato',
      director: 'Ridley Scott Jr.',
      plannedBudget: '$45M',
      financeType: 'Private',
      financeStatus: 'Committed',
      castAttached: [
        { name: 'Hiroyuki Sanada', role: 'Detective Kaito' },
        { name: 'Ana de Armas', role: 'Elena' }
      ]
    }
  },
  {
    id: 'p2',
    title: 'The Last Harvest',
    stage: 'Evaluation',
    status: 'Active',
    logline: 'A farming family fights to keep their land during the Great Dust Bowl.',
    synopsis: 'Set in 1930s Oklahoma, this historical drama follows the Joad family as they struggle against drought, debt, and the encroaching banks.',
    genre: 'Drama / Historical',
    createdAt: '2023-11-01T09:00:00Z',
    updatedAt: '2023-11-20T11:15:00Z',
    evaluation: {
      writer: 'Steinbeck AI',
      financeType: 'Grant',
      financeStatus: 'Speculative',
      plannedBudget: '$12M',
      scores: { creative: 8.5, financial: 6.0 }
    }
  },
  {
    id: 'p3',
    title: 'Velocity',
    stage: 'Development',
    status: 'Active',
    logline: 'A retired getaway driver is pulled back in for one last job.',
    synopsis: 'Action-packed heist movie set in the streets of Paris.',
    genre: 'Action',
    createdAt: '2023-09-01T08:00:00Z',
    updatedAt: '2023-12-05T16:45:00Z',
    evaluation: {
      writer: 'Luc Besson',
      director: 'Unknown',
      plannedBudget: '$25M',
      financeType: 'Tax Credit',
      financeStatus: 'Committed'
    },
    closingChecklist: {
      keyAgreementsSigned: true,
      financeClosed: true,
      talentConfirmed: false,
      bankingReady: true,
      legalDocsInPlace: false
    }
  },
  {
    id: 'p4',
    title: 'Failed Mars Project',
    stage: 'Archived',
    status: 'Completed',
    logline: 'Mars colony fails.',
    synopsis: 'It was too expensive.',
    genre: 'Sci-Fi',
    createdAt: '2022-01-01T00:00:00Z',
    updatedAt: '2022-06-01T00:00:00Z',
    evaluation: {
      writer: 'Alan Smithee',
      plannedBudget: '$100M',
      scores: { creative: 4.0, financial: 2.0 }
    }
  }
];

// Reusing existing categories structure but will filter/apply based on stage in UI
const MOCK_CATEGORIES: Category[] = [
  { id: 'c1', projectId: 'p1', name: 'Script', slug: 'script', icon: 'FileText' },
  { id: 'c2', projectId: 'p1', name: 'Producing Partners', slug: 'producing-partners', icon: 'Users' },
  { id: 'c3', projectId: 'p1', name: 'Financing', slug: 'financing', icon: 'CircleDollarSign' },
  { id: 'c4', projectId: 'p1', name: 'Action Points', slug: 'action-points', icon: 'CheckSquare' },
  { id: 'c5', projectId: 'p1', name: 'Final Documentation', slug: 'final-docs', icon: 'FolderCheck' },
  { id: 'c6', projectId: 'p1', name: 'Distribution', slug: 'distribution', icon: 'Globe' },
  { id: 'c7', projectId: 'p1', name: 'Company Entities', slug: 'entities', icon: 'Building2' },
];

const MOCK_SUBCATEGORIES: Subcategory[] = [
  // Script
  { id: 'sc1', categoryId: 'c1', name: 'Reader Analysis', slug: 'reader-analysis' },
  { id: 'sc2', categoryId: 'c1', name: 'Cast Wishlist', slug: 'cast-wishlist' },
  { id: 'sc3', categoryId: 'c1', name: 'Script Versions', slug: 'script-versions' },
  // Financing
  { id: 'sc4', categoryId: 'c3', name: 'Budget', slug: 'budget' },
  { id: 'sc5', categoryId: 'c3', name: 'Cashflow', slug: 'cashflow' },
  { id: 'sc6', categoryId: 'c3', name: 'Finance Plan', slug: 'finance-plan' },
];

const MOCK_DOCUMENTS: Document[] = [
  {
    id: 'd1',
    projectId: 'p1',
    categoryId: 'c1',
    subcategoryId: 'sc3',
    title: 'Neon_Nights_Script_v4_Final.pdf',
    type: 'PDF',
    filePath: '#',
    fileSize: '2.4 MB',
    uploadedBy: 'Sarah Producer',
    uploadedAt: '2023-12-10T14:00:00Z',
    version: 4,
    status: 'Final',
    tags: ['script', 'locked'],
    stageContext: 'Development'
  },
  {
    id: 'd2',
    projectId: 'p1',
    categoryId: 'c3',
    subcategoryId: 'sc4',
    title: 'Neon_Nights_Budget_TopSheet.xlsx',
    type: 'XLSX',
    filePath: '#',
    fileSize: '450 KB',
    uploadedBy: 'Mike Finance',
    uploadedAt: '2023-12-08T09:30:00Z',
    version: 2,
    status: 'Draft',
    tags: ['budget', 'internal'],
    stageContext: 'Development'
  },
  {
    id: 'd3',
    projectId: 'p1',
    categoryId: 'c1',
    subcategoryId: 'sc1',
    title: 'Coverage_Report_Agency_A.pdf',
    type: 'PDF',
    filePath: '#',
    fileSize: '1.1 MB',
    uploadedBy: 'Sarah Producer',
    uploadedAt: '2023-11-20T10:15:00Z',
    version: 1,
    status: 'Final',
    tags: ['coverage'],
    stageContext: 'Evaluation'
  },
];

// --- Store ---

interface AppState {
  user: User | null;
  projects: Project[];
  categories: Category[];
  subcategories: Subcategory[];
  documents: Document[];
  tasks: Task[];
  currentProjectId: string | null;
  
  login: (email: string) => void;
  logout: () => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'evaluation' | 'stage'>) => void;
  setCurrentProject: (id: string | null) => void;
  addDocument: (doc: Omit<Document, 'id' | 'uploadedBy' | 'uploadedAt'>) => void;
  getProjectDocuments: (projectId: string, categoryId?: string, subcategoryId?: string) => Document[];
  getProjectCategories: (projectId: string) => Category[];
  getCategorySubcategories: (categoryId: string) => Subcategory[];
  
  // New Actions
  setProjectStage: (projectId: string, stage: ProjectStage) => void;
  updateClosingChecklist: (projectId: string, checklist: Partial<Project['closingChecklist']>) => void;
  addTask: (task: Omit<Task, 'id'>) => void;
  toggleTaskStatus: (taskId: string) => void;
  getProjectTasks: (projectId: string) => Task[];
}

export const useStore = create<AppState>((set, get) => ({
  user: null, 
  projects: MOCK_PROJECTS,
  categories: MOCK_CATEGORIES,
  subcategories: MOCK_SUBCATEGORIES,
  documents: MOCK_DOCUMENTS,
  tasks: MOCK_TASKS,
  currentProjectId: null,

  login: (email) => set({ 
    user: { ...MOCK_USER, email } 
  }),
  
  logout: () => set({ user: null }),

  addProject: (data) => set((state) => ({
    projects: [
      {
        ...data,
        id: `p${Date.now()}`,
        stage: 'Evaluation', // Default new projects to Evaluation
        evaluation: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...state.projects,
    ]
  })),

  setCurrentProject: (id) => set({ currentProjectId: id }),

  addDocument: (data) => set((state) => ({
    documents: [
      {
        ...data,
        id: `d${Date.now()}`,
        uploadedBy: state.user?.name || 'Unknown',
        uploadedAt: new Date().toISOString(),
      },
      ...state.documents,
    ]
  })),

  getProjectDocuments: (projectId, categoryId, subcategoryId) => {
    const { documents } = get();
    return documents.filter(d => 
      d.projectId === projectId && 
      (!categoryId || d.categoryId === categoryId) &&
      (!subcategoryId || d.subcategoryId === subcategoryId)
    );
  },

  getProjectCategories: (projectId) => {
    const { categories } = get();
    return categories.map(c => ({...c, projectId})); 
  },

  getCategorySubcategories: (categoryId) => {
    const { subcategories } = get();
    return subcategories.filter(sc => sc.categoryId === categoryId);
  },

  setProjectStage: (projectId, stage) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { ...p, stage, updatedAt: new Date().toISOString() } : p
    )
  })),

  updateClosingChecklist: (projectId, checklist) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { 
        ...p, 
        closingChecklist: { ...p.closingChecklist, ...checklist } as any 
      } : p
    )
  })),

  addTask: (task) => set((state) => ({
    tasks: [...state.tasks, { ...task, id: `t${Date.now()}` }]
  })),

  toggleTaskStatus: (taskId) => set((state) => ({
    tasks: state.tasks.map(t => 
      t.id === taskId ? { ...t, status: t.status === 'Done' ? 'Open' : 'Done' } : t
    )
  })),

  getProjectTasks: (projectId) => {
    const { tasks } = get();
    return tasks.filter(t => t.projectId === projectId);
  }
}));
