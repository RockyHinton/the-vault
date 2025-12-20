import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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

  // Financing Data (New)
  financing?: {
    totalBudget: number;
    secured: number;
    currency: string;
    breakdown: { category: string; amount: number; percentage: number }[];
    cashflow: { month: string; in: number; out: number }[];
    approvals: { item: string; status: 'Approved' | 'Pending' | 'Rejected'; date?: string }[];
  };

  // Legal Data (New)
  legal?: {
    chainOfTitle: { item: string; status: 'Clean' | 'Issues' | 'Pending'; notes?: string }[];
    keyAgreements: { 
      type: string; 
      party: string; 
      status: 'Drafting' | 'Negotiation' | 'Executed'; 
      dueDate?: string;
    }[];
    riskAssessment: { category: string; riskLevel: 'Low' | 'Medium' | 'High'; description: string }[];
  };

  // Production Schedule Data (New)
  schedule?: {
    startDate: string;
    endDate: string;
    currentDay: number;
    totalDays: number;
    locations: { id: string; name: string; address: string; status: 'Secured' | 'Scouting' | 'Permit Pending' }[];
    shootDays: {
      dayNumber: number;
      date: string;
      locationId: string;
      scenes: string[]; // e.g., "1A", "4", "12"
      pages: number;
      status: 'Complete' | 'Scheduled' | 'Rescheduled';
      callSheetStatus: 'Published' | 'Draft' | 'Pending';
    }[];
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

// --- Script Analysis Types ---

export type NoteType = 'Creative' | 'Commercial' | 'Question' | 'Concern';
export type NoteTag = 'Dialogue' | 'Structure' | 'Character' | 'Pacing' | 'Budget Impact' | 'Other';

export interface ScriptAnnotation {
  id: string;
  scriptVersionId: string; // Links to a Document (PDF)
  pageNumber: number;
  x: number; // Percentage coordinate
  y: number; // Percentage coordinate
  authorId: string;
  authorName: string;
  text: string;
  type: NoteType;
  tag?: NoteTag;
  timestamp: string;
}

export interface ScriptReview {
  id: string;
  scriptVersionId: string;
  authorId: string;
  authorName: string;
  creativeScore: number; // 1-10
  commercialScore: number; // 1-10
  budgetScore: number; // 1-10
  recommendation: 'Pass' | 'Consider' | 'Develop';
  summaryNotes: string;
  timestamp: string;
}

// --- Admin / Security Types ---

export type AuditAction = 'LOGIN' | 'LOGOUT' | 'UPLOAD_DOC' | 'DELETE_DOC' | 'STAGE_CHANGE' | 'USER_CREATE' | 'USER_DELETE';

export interface AuditLog {
  id: string;
  action: AuditAction;
  userId: string;
  userName: string;
  details: string;
  ipAddress: string;
  timestamp: string;
}

// --- Mock Data ---

const MOCK_USER: User = {
  id: 'u1',
  name: 'Sarah Producer',
  email: 'sarah@prodco.com',
  role: 'Producer',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
};

const MOCK_USERS: User[] = [
  MOCK_USER,
  { id: 'u2', name: 'Mike Finance', email: 'mike@prodco.com', role: 'TeamMember', avatar: 'https://github.com/shadcn.png' },
  { id: 'u3', name: 'Tom Legal', email: 'tom@legal.com', role: 'External', avatar: undefined },
];

const MOCK_AUDIT_LOGS: AuditLog[] = [
  { id: 'l1', action: 'LOGIN', userId: 'u1', userName: 'Sarah Producer', details: 'Successful login', ipAddress: '192.168.1.5', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
  { id: 'l2', action: 'UPLOAD_DOC', userId: 'u1', userName: 'Sarah Producer', details: 'Uploaded Neon_Nights_Script_v4_Final.pdf', ipAddress: '192.168.1.5', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
  { id: 'l3', action: 'STAGE_CHANGE', userId: 'u1', userName: 'Sarah Producer', details: 'Moved Neon Nights to Production', ipAddress: '192.168.1.5', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
  { id: 'l4', action: 'LOGIN', userId: 'u2', userName: 'Mike Finance', details: 'Successful login', ipAddress: '10.0.0.42', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString() },
];

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
    },
    financing: {
      totalBudget: 45000000,
      secured: 38000000,
      currency: 'USD',
      breakdown: [
        { category: 'Above the Line', amount: 12000000, percentage: 26.6 },
        { category: 'Production', amount: 18000000, percentage: 40.0 },
        { category: 'Post-Production', amount: 8000000, percentage: 17.7 },
        { category: 'Other (Ins/Legal)', amount: 7000000, percentage: 15.5 },
      ],
      cashflow: [
        { month: 'Jan', in: 5000000, out: 2000000 },
        { month: 'Feb', in: 0, out: 4000000 },
        { month: 'Mar', in: 10000000, out: 8000000 },
        { month: 'Apr', in: 0, out: 6000000 },
      ],
      approvals: [
        { item: 'Top Sheet Budget v4', status: 'Approved', date: '2023-12-01' },
        { item: 'Bond Completion', status: 'Pending' },
        { item: 'Tax Credit Application', status: 'Approved', date: '2023-11-15' },
      ]
    },
    legal: {
      chainOfTitle: [
        { item: 'Option Agreement', status: 'Clean', notes: 'Executed 2022' },
        { item: 'Writer Agreement', status: 'Clean', notes: 'WGA standard' },
        { item: 'Life Rights', status: 'Pending', notes: 'Negotiating with family estate' },
      ],
      keyAgreements: [
        { type: 'Director Agreement', party: 'Ridley Scott Jr.', status: 'Executed', dueDate: '2023-10-01' },
        { type: 'Cast Agreement', party: 'Hiroyuki Sanada', status: 'Negotiation', dueDate: '2023-12-28' },
        { type: 'Location Agreement', party: 'City of Tokyo', status: 'Drafting', dueDate: '2024-01-15' },
      ],
      riskAssessment: [
        { category: 'Copyright', riskLevel: 'Low', description: 'Original screenplay, clean chain of title.' },
        { category: 'Defamation', riskLevel: 'Medium', description: 'Script references real political figures.' },
        { category: 'Safety', riskLevel: 'High', description: 'Stunt heavy production in urban environment.' },
      ]
    },
    schedule: {
      startDate: '2024-03-01',
      endDate: '2024-04-15',
      currentDay: 12,
      totalDays: 35,
      locations: [
        { id: 'loc1', name: 'Neon Plaza', address: 'Shibuya Crossing, Tokyo', status: 'Secured' },
        { id: 'loc2', name: 'Kaito Apt', address: 'Soundstage 4', status: 'Secured' },
        { id: 'loc3', name: 'Industrial Zone', address: 'Yokohama Port', status: 'Permit Pending' },
      ],
      shootDays: [
        { dayNumber: 10, date: '2024-03-14', locationId: 'loc1', scenes: ['22A', '24'], pages: 3.5, status: 'Complete', callSheetStatus: 'Published' },
        { dayNumber: 11, date: '2024-03-15', locationId: 'loc1', scenes: ['25', '26', '28'], pages: 4.2, status: 'Complete', callSheetStatus: 'Published' },
        { dayNumber: 12, date: '2024-03-16', locationId: 'loc2', scenes: ['4', '5', '8'], pages: 5.1, status: 'Scheduled', callSheetStatus: 'Published' }, // Today
        { dayNumber: 13, date: '2024-03-17', locationId: 'loc2', scenes: ['9', '11'], pages: 3.0, status: 'Scheduled', callSheetStatus: 'Draft' },
        { dayNumber: 14, date: '2024-03-18', locationId: 'loc3', scenes: ['45', '46A'], pages: 2.4, status: 'Rescheduled', callSheetStatus: 'Pending' },
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
  { id: 'c8', projectId: 'p1', name: 'Actors & Directors', slug: 'talent', icon: 'User' }, // New
  { id: 'c3', projectId: 'p1', name: 'Financing', slug: 'financing', icon: 'CircleDollarSign' },
  { id: 'c9', projectId: 'p1', name: 'Legal & Contracts', slug: 'legal', icon: 'Scale' }, // Renamed from Documentation
  { id: 'c6', projectId: 'p1', name: 'Distribution', slug: 'distribution', icon: 'Globe' },
  { id: 'c10', projectId: 'p1', name: 'Schedules', slug: 'schedules', icon: 'Calendar' }, // New (Prod+)
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
  // Talent
  { id: 'sc7', categoryId: 'c8', name: 'Cast Lists', slug: 'cast-lists' },
  { id: 'sc8', categoryId: 'c8', name: 'Director Options', slug: 'director-options' },
  // Documentation (Development)
  { id: 'sc9', categoryId: 'c9', name: 'Investment Agreements', slug: 'investment-agreements' },
  { id: 'sc10', categoryId: 'c9', name: 'Co-Production', slug: 'co-production' },
  { id: 'sc11', categoryId: 'c9', name: 'Producers Agreements', slug: 'producers-agreements' },
  { id: 'sc12', categoryId: 'c9', name: 'Director Agreements', slug: 'director-agreements' },
  { id: 'sc13', categoryId: 'c9', name: 'Cast Agreements', slug: 'cast-agreements' },
  { id: 'sc14', categoryId: 'c9', name: 'Banking Docs', slug: 'banking-docs' },
  { id: 'sc15', categoryId: 'c9', name: 'Funding / Tax Credit', slug: 'funding-tax-credit' },
  { id: 'sc16', categoryId: 'c9', name: 'Sales Agency', slug: 'sales-agency' },
  { id: 'sc17', categoryId: 'c9', name: 'CAMA', slug: 'cama' },
  // Schedules (Production)
  { id: 'sc18', categoryId: 'c10', name: 'Shooting Schedule', slug: 'shooting-schedule' },
  { id: 'sc19', categoryId: 'c10', name: 'Daily Call Sheets', slug: 'call-sheets' },
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

const MOCK_ANNOTATIONS: ScriptAnnotation[] = [
  {
    id: 'a1',
    scriptVersionId: 'd1',
    pageNumber: 1,
    x: 10,
    y: 15,
    authorId: 'u1',
    authorName: 'Sarah Producer',
    text: 'Great opening hook, really sets the tone immediately.',
    type: 'Creative',
    tag: 'Pacing',
    timestamp: '2023-12-11T10:00:00Z',
  },
  {
    id: 'a2',
    scriptVersionId: 'd1',
    pageNumber: 1,
    x: 50,
    y: 30,
    authorId: 'u2',
    authorName: 'Mike Finance',
    text: 'This location (New Tokyo aerial) will be expensive. Can we establish this differently?',
    type: 'Commercial',
    tag: 'Budget Impact',
    timestamp: '2023-12-11T11:30:00Z',
  }
];

const MOCK_REVIEWS: ScriptReview[] = [
  {
    id: 'r1',
    scriptVersionId: 'd1',
    authorId: 'u1',
    authorName: 'Sarah Producer',
    creativeScore: 9,
    commercialScore: 8,
    budgetScore: 7,
    recommendation: 'Develop',
    summaryNotes: 'Strongest draft yet. Kaito\'s arc is clear. Third act needs a bit of trimming but ready for packaging.',
    timestamp: '2023-12-12T09:00:00Z',
  }
];

// --- Store ---

interface AppState {
  user: User | null;
  projects: Project[];
  categories: Category[];
  subcategories: Subcategory[];
  documents: Document[];
  tasks: Task[];
  annotations: ScriptAnnotation[];
  reviews: ScriptReview[];
  currentProjectId: string | null;
  
  // Admin State
  users: User[];
  auditLogs: AuditLog[];
  
  login: (email: string) => void;
  logout: () => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'evaluation' | 'stage'>) => void;
  setCurrentProject: (id: string | null) => void;
  addDocument: (doc: Omit<Document, 'id' | 'uploadedBy' | 'uploadedAt'>) => void;
  getProjectDocuments: (projectId: string, categoryId?: string, subcategoryId?: string) => Document[];
  getProjectCategories: (projectId: string) => Category[];
  getCategorySubcategories: (categoryId: string) => Subcategory[];
  
  setProjectStage: (projectId: string, stage: ProjectStage) => void;
  updateClosingChecklist: (projectId: string, checklist: Partial<Project['closingChecklist']>) => void;
  addTask: (task: Omit<Task, 'id'>) => void;
  toggleTaskStatus: (taskId: string) => void;
  getProjectTasks: (projectId: string) => Task[];

  // Script Analysis Actions
  getScriptAnnotations: (scriptId: string) => ScriptAnnotation[];
  addAnnotation: (annotation: Omit<ScriptAnnotation, 'id' | 'timestamp' | 'authorId' | 'authorName'>) => void;
  deleteAnnotation: (annotationId: string) => void;
  getScriptReviews: (scriptId: string) => ScriptReview[];
  addReview: (review: Omit<ScriptReview, 'id' | 'timestamp' | 'authorId' | 'authorName'>) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
  user: null, 
  projects: MOCK_PROJECTS,
  categories: MOCK_CATEGORIES,
  subcategories: MOCK_SUBCATEGORIES,
  documents: MOCK_DOCUMENTS,
  tasks: MOCK_TASKS,
  annotations: MOCK_ANNOTATIONS,
  reviews: MOCK_REVIEWS,
  currentProjectId: null,
  users: MOCK_USERS,
  auditLogs: MOCK_AUDIT_LOGS,

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
    const { categories, projects } = get();
    const project = projects.find(p => p.id === projectId);
    
    if (!project) return categories.map(c => ({...c, projectId}));

    const stage = project.stage;
    
    const visibleSlugs = new Set<string>();
    visibleSlugs.add('script');
    visibleSlugs.add('financing');
    visibleSlugs.add('producing-partners');
    visibleSlugs.add('talent');

    // Make 'legal' visible for Evaluation too, just for demo purposes if needed, 
    // or strictly follow logic. 
    // Wait, user says "cannot see this in ANY stages".
    // Let's make sure it's added.
    if (stage === 'Development' || stage === 'Production' || stage === 'Archived') {
      visibleSlugs.add('legal'); 
    }

    if (stage === 'Production' || stage === 'Archived') {
      visibleSlugs.add('distribution');
      visibleSlugs.add('schedules');
    }

    return categories
      .filter(c => visibleSlugs.has(c.slug))
      .map(c => ({...c, projectId})); 
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
  },

  getScriptAnnotations: (scriptId) => {
    const { annotations } = get();
    return annotations.filter(a => a.scriptVersionId === scriptId);
  },

  addAnnotation: (annotation) => set((state) => ({
    annotations: [...state.annotations, {
      ...annotation,
      id: `a${Date.now()}`,
      authorId: state.user?.id || 'unknown',
      authorName: state.user?.name || 'Unknown User',
      timestamp: new Date().toISOString(),
    }]
  })),

  deleteAnnotation: (annotationId) => set((state) => ({
    annotations: state.annotations.filter(a => a.id !== annotationId)
  })),

  getScriptReviews: (scriptId) => {
    const { reviews } = get();
    return reviews.filter(r => r.scriptVersionId === scriptId);
  },

  addReview: (review) => set((state) => ({
    reviews: [...state.reviews, {
      ...review,
      id: `r${Date.now()}`,
      authorId: state.user?.id || 'unknown',
      authorName: state.user?.name || 'Unknown User',
      timestamp: new Date().toISOString(),
    }]
  }))

}),
{
  name: 'vault-storage',
  storage: createJSONStorage(() => localStorage),
}
)
);
