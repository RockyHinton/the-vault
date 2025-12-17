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

export type ProjectStatus = 'Development' | 'Packaging' | 'Financing' | 'Production' | 'Post' | 'Distribution';

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  logline: string;
  synopsis: string;
  genre: string;
  createdAt: string;
  updatedAt: string;
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
export type DocumentStatus = 'Draft' | 'Final' | 'Signed';

export interface Document {
  id: string;
  projectId: string;
  categoryId: string;
  subcategoryId: string;
  title: string;
  type: DocumentType;
  filePath: string; // Mock path
  fileSize: string;
  uploadedBy: string;
  uploadedAt: string;
  version: number;
  status: DocumentStatus;
  tags: string[];
}

// --- Mock Data ---

const MOCK_USER: User = {
  id: 'u1',
  name: 'Sarah Producer',
  email: 'sarah@prodco.com',
  role: 'Producer',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
};

const MOCK_PROJECTS: Project[] = [
  {
    id: 'p1',
    title: 'Neon Nights',
    status: 'Production',
    logline: 'A detective uncovers a conspiracy in a city that never sleeps.',
    synopsis: 'In 2084, New Tokyo is a neon-drenched metropolis controlled by three mega-corporations. When Detective Kaito discovers a synthetic drug that grants telepathic abilities, he becomes the target of the most powerful man in the city.',
    genre: 'Sci-Fi / Thriller',
    createdAt: '2023-10-15T10:00:00Z',
    updatedAt: '2023-12-10T14:30:00Z',
  },
  {
    id: 'p2',
    title: 'The Last Harvest',
    status: 'Development',
    logline: 'A farming family fights to keep their land during the Great Dust Bowl.',
    synopsis: 'Set in 1930s Oklahoma, this historical drama follows the Joad family as they struggle against drought, debt, and the encroaching banks.',
    genre: 'Drama / Historical',
    createdAt: '2023-11-01T09:00:00Z',
    updatedAt: '2023-11-20T11:15:00Z',
  },
  {
    id: 'p3',
    title: 'Velocity',
    status: 'Financing',
    logline: 'A retired getaway driver is pulled back in for one last job.',
    synopsis: 'Action-packed heist movie set in the streets of Paris.',
    genre: 'Action',
    createdAt: '2023-09-01T08:00:00Z',
    updatedAt: '2023-12-05T16:45:00Z',
  }
];

// Categories for Project 1 (Neon Nights)
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
  },
];

// --- Store ---

interface AppState {
  user: User | null;
  projects: Project[];
  categories: Category[];
  subcategories: Subcategory[];
  documents: Document[];
  currentProjectId: string | null;
  
  login: (email: string) => void;
  logout: () => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  setCurrentProject: (id: string | null) => void;
  addDocument: (doc: Omit<Document, 'id' | 'uploadedBy' | 'uploadedAt'>) => void;
  getProjectDocuments: (projectId: string, categoryId?: string, subcategoryId?: string) => Document[];
  getProjectCategories: (projectId: string) => Category[];
  getCategorySubcategories: (categoryId: string) => Subcategory[];
}

export const useStore = create<AppState>((set, get) => ({
  user: null, // Start logged out
  projects: MOCK_PROJECTS,
  categories: MOCK_CATEGORIES,
  subcategories: MOCK_SUBCATEGORIES,
  documents: MOCK_DOCUMENTS,
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
    // For MVP, if categories are empty for a project, we might want to seed default ones.
    // But for now, we just return what matches.
    // In a real app, we'd seed these on project creation.
    // Let's just return the Mock categories for ALL projects for the MVP demo if none exist, 
    // or better, duplicate them dynamically.
    // For simplicity, we'll just map p1 categories to any project if they don't have unique ones, 
    // BUT strictly filtering is better.
    // Let's assume all projects share the same structure for this MVP to avoid empty states everywhere.
    return categories.map(c => ({...c, projectId})); 
  },

  getCategorySubcategories: (categoryId) => {
    const { subcategories } = get();
    // Similar hack for MVP: allow subcategories to map loosely if needed, but strict is safer.
    // Let's rely on strict filtering for the demo project (p1) and maybe show empty for others to encourage "Creation".
    // Actually, for the demo to be impressive, let's reuse the subcats structure for all categories with matching IDs.
    return subcategories.filter(sc => sc.categoryId === categoryId);
  }
}));
