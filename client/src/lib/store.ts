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
  financeType?: 'Grant' | 'Subsidy' | 'Tax Credit' | 'Private' | string; // Kept string for flexibility or multi-select rendering
  financeTypes?: string[]; // Added for multiple selection support
  financeStatus?: 'Committed' | 'Speculative';
  plannedBudget?: string; // e.g. "$5M"
  scores?: { creative: number; financial: number }; // 1-10
}

export type TaskCategory = 'Finance' | 'Talent' | 'Legal' | 'Production' | 'General';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string; // Added for detailed notes
  category: TaskCategory; // Added for filtering
  assignedTo?: string; // User ID or Name
  authorId: string; // Added for ownership
  authorName: string; // Added for display
  status: 'Open' | 'In Progress' | 'Done';
  dueDate?: string;
  priority: 'Low' | 'Medium' | 'High';
  createdAt: string; // Added for timestamp
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

  rightsItems?: Array<{
    id: string;
    rightsType: string;
    status: string;
    rightsHolder: string;
    expiryDate: string | null;
    notes: string;
    documents: Array<{ id: string; name: string; url?: string; createdAt: string }>;
  }>;

  rights?: {
    type: 'Original' | 'Book' | 'Article' | 'Life Rights' | 'Remake' | 'Other';
    holder: string;
    statusByStage: {
      Evaluation?: 'Identified' | 'Contacted' | 'Under Review' | 'Option Pending' | 'Optioned' | 'Not Available';
      Development?: 'Optioned' | 'Extended' | 'Purchase Pending' | 'Purchased' | 'Rights Issue';
      Production?: 'Cleared' | 'Chain Complete' | 'Missing Doc' | 'Expired' | 'Legal Hold';
    };
    expiryDate: string;
    notes: string;
  };

  // Evaluation Data
  evaluation: EvaluationData;

  // Development Data
  closingChecklist?: {
    financeClosed: boolean;
    talentConfirmed: boolean;
    legalDocsClosed: boolean;
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

  // Documentation Checklist (New)
  documentationChecklist?: Record<string, boolean>;

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

  // Archive Details (New)
  archiveDetails?: {
    reason: 'Creative pass' | 'Commercial viability' | 'Financing not secured' | 'Rights / legal issues' | 'Packaging fell through' | 'Paused (strategic / timing)' | 'Produced / completed' | 'Withdrawn';
    revisit: 'Yes' | 'Maybe' | 'No';
    starred: boolean;
    notes?: string;
    archivedAt?: string;
    archivedFromStage?: ProjectStage;
    archivedBy?: string;
  };

  // Budget Tool Data (New)
  budgetState?: ProjectFinanceState;

  // Finance Plan Data (New)
  financePlan?: {
    sources: FinanceSource[];
  };

  // Cash Flow Data (New)
  cashFlow?: CashFlowState;

  // Documentation Entity State (New)
  documentationState?: DocumentationState;
}

// --- Documentation Entity Types ---

export interface DocFile {
  id: string;
  fileName: string;
  docType: string;
  status: 'Draft' | 'Pending' | 'Signed' | 'Approved';
  uploadedAt: string;
  notes?: string;
}

export interface DocEntity {
  id: string;
  title: string;
  meta: Record<string, any>;
  isExpanded?: boolean;
  documents: DocFile[];
}

export interface DocumentationState {
  // Keyed by docTypeKey (e.g., "chain_of_title", "writer_agreements")
  [docTypeKey: string]: {
    entities: DocEntity[];
    lastUpdatedAt: string;
  };
}

// --- Finance Plan Types ---

export type FinanceSourceType = 'Equity' | 'Pre-sale' | 'Distributor MG' | 'Grant' | 'Tax Credit' | 'Loan / Lender' | 'Gap Finance' | 'Other';
export type FinanceSourceStatus = 'Targeted' | 'Soft committed' | 'Approved';

export interface FinanceDocument {
  id: string;
  fileName: string;
  docType: 'Term sheet' | 'Contract / Agreement' | 'LOI' | 'Grant letter' | 'Tax credit opinion' | 'Bank / lender letter' | 'Other';
  status: 'Reference' | 'Pending approval' | 'Approved';
  uploadedAt: string;
  fileSize?: string;
}

export interface FinanceSource {
  id: string;
  name: string;
  amount: number;
  type: FinanceSourceType;
  status: FinanceSourceStatus;
  isApproved: boolean; // Derived from status === 'Approved', but helpful to have explicit
  expectedDate?: string;
  notes?: string;
  documents: FinanceDocument[];
  isExpanded?: boolean; // UI state
}

// --- Cash Flow Types ---

export interface SpendWindow {
  startDate: string; // ISO or YYYY-MM
  endDate: string; // ISO or YYYY-MM
}

export interface OneOffPayment {
  id: string;
  name: string;
  departmentId: string; // Link to department
  departmentName: string; // Fallback
  amount: number;
  date: string;
  direction: 'outflow' | 'inflow';
  note?: string;
}

export interface CashFlowState {
  timeframe: 'monthly' | 'weekly';
  openingBalance: number;
  departmentTimings: Record<string, SpendWindow>; // Keyed by department ID
  oneOffPayments: OneOffPayment[];
  sourceAdjustments: Record<string, {
    expectedDate?: string;
  }>;
}

// --- Budget Tool Types ---

export interface LineItem {
  id: string;
  name: string;
  amount: number;
  note?: string;
}

export interface BudgetDocument {
  id: string;
  fileName: string;
  docType: 'Quote' | 'Estimate' | 'Bid' | 'Top Sheet' | 'Schedule' | 'Other';
  status: 'Reference' | 'Pending approval' | 'Approved';
  uploadedAt: string;
}

export interface Department {
  id: string;
  name: string;
  lineItems: LineItem[];
  documents: BudgetDocument[];
  isExpanded?: boolean; // UI state
}

export interface BudgetVersion {
  id: string;
  status: 'draft' | 'awaiting_approval' | 'locked';
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  currency: string;
  departments: Department[];
}

export interface ProjectFinanceState {
  // project.totalBudget is the source of truth for the Overview, but we track state here too
  budgetDraft: BudgetVersion | null;
  budgetPending: BudgetVersion | null;
  budgetLockedHistory: BudgetVersion[];
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
  projectId: string; // Changed from scriptVersionId to generic project association
  authorId: string;
  authorName: string;
  scriptScore: number;   // 1-10
  directorScore: number; // 1-10
  castScore: number;     // 1-10
  financingScore: number; // 1-10
  recommendation: 'Pass' | 'Consider' | 'Develop';
  summaryNotes: string;
  timestamp: string;
}

export type ProjectNoteCategory = 'Script' | 'Financing' | 'Cast' | 'Other';

export interface ProjectNote {
  id: string;
  projectId: string;
  authorId: string;
  authorName: string;
  text: string;
  category: ProjectNoteCategory;
  timestamp: string;
}

// --- Producer Profile Types ---

export interface ContactDetail {
  id: string;
  type: string;
  value: string;
}

export interface LinkDetail {
  id: string;
  label: string;
  url: string;
}

export type ProfileDocumentStatus = 'Draft' | 'Pending' | 'Signed' | 'Approved';
export type ProfileDocumentType = 'Agreement' | 'Deal Memo' | 'ID / KYC' | 'NDA' | 'Release' | 'Contract Amendment' | 'Other';

export interface ProfileDocument {
  id: string;
  fileName: string;
  docType: ProfileDocumentType;
  status: ProfileDocumentStatus;
  uploadedAt: string;
  fileUrl?: string;
}

export interface ProjectEngagement {
  status: 'Identified' | 'Contacted' | 'Interested' | 'Offered' | 'Confirmed' | 'Contracted' | 'Attached' | 'Unavailable / Passed' | '';
  roleOnProject?: string;
  startDate?: string;
  contractStatus: 'Not sent' | 'Sent' | 'Signed' | 'Pending amendments' | '';
  notes?: string;
}

export interface ProducerProfile {
  id: string;
  projectId: string;
  name: string;
  company: string;
  role: string;
  contactDetails: ContactDetail[];
  links: LinkDetail[];
  notes: string;
  engagement?: ProjectEngagement;
  profileDocuments?: ProfileDocument[];
}

export type CreativeRoleType = 'Director' | 'Cast' | 'Head of Department';

export interface CreativeProfile {
  id: string;
  projectId: string;
  name: string;
  roleType: CreativeRoleType;
  specificRole: string; // e.g. "Director of Photography", "Lead Actor", etc.
  agent?: string;
  contactDetails: ContactDetail[];
  links: LinkDetail[];
  notes: string;
  engagement?: ProjectEngagement;
  profileDocuments?: ProfileDocument[];
}

// --- Distribution / Territory Types ---

export type TerritoryStatus = 'Available' | 'In Discussion' | 'Licensed' | 'Delivered' | 'Closed';

export interface TerritoryNote {
  id: string;
  territoryId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  editedAt?: string;
}

export interface TerritoryDocument {
  id: string;
  territoryId: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  description?: string;
}

export interface TerritoryDealInfo {
  distributor?: string;
  contact?: string;
  signaturePayment?: string;
  deliveryPayment?: string;
  generalNotes?: string;
}

export interface Territory {
  id: string;
  projectId: string;
  name: string;
  status: TerritoryStatus;
  notes: TerritoryNote[];
  documents: TerritoryDocument[];
  dealInfo: TerritoryDealInfo;
  updatedAt: string;
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
  { id: 't1', projectId: 'p1', title: 'Finalize Cast Contracts', category: 'Legal', description: 'Need to get signatures from lead actors agents.', status: 'In Progress', priority: 'High', assignedTo: 'Sarah Producer', dueDate: '2023-12-25', authorId: 'u1', authorName: 'Sarah Producer', createdAt: '2023-12-01T10:00:00Z' },
  { id: 't2', projectId: 'p1', title: 'Location Scout - Tokyo', category: 'Production', description: 'Coordinate with local fixers for Shibuya crossing permits.', status: 'Open', priority: 'Medium', assignedTo: 'Mike Finance', authorId: 'u2', authorName: 'Mike Finance', createdAt: '2023-12-05T14:30:00Z' },
  { id: 't3', projectId: 'p2', title: 'Script Polish', category: 'General', description: 'Implement notes from the studio coverage.', status: 'Open', priority: 'High', assignedTo: 'Sarah Producer', authorId: 'u1', authorName: 'Sarah Producer', createdAt: '2023-11-25T09:15:00Z' },
];

const MOCK_PROJECTS: Project[] = [
  {
    id: 'p1',
    title: 'The Falling House',
    stage: 'Evaluation',
    status: 'Active',
    logline: 'A family discovers their ancestral home is slowly sinking into an unseen abyss.',
    synopsis: 'When inherited property begins to exhibit strange gravitational anomalies, a family must unravel the dark history of their ancestors before the house consumes them completely.',
    genre: 'Thriller / Drama',
    createdAt: '2023-10-15T10:00:00Z',
    updatedAt: '2023-12-10T14:30:00Z',
    evaluation: {
      writer: 'Kenji Sato',
      director: 'Ridley Scott Jr.',
      plannedBudget: '$45M',
      financeType: 'Private',
      financeStatus: 'Committed',
      castAttached: [
        { name: 'Hiroyuki Sanada', role: 'Lead' }
      ]
    },
    financing: {
      totalBudget: 45000000,
      secured: 38000000,
      currency: 'USD',
      breakdown: [
        { category: 'Equity - Investor A', amount: 12000000, percentage: 26.6 },
        { category: 'Pre-sale - Territory B', amount: 18000000, percentage: 40.0 },
        { category: 'Tax Credit - UK', amount: 8000000, percentage: 17.7 },
      ],
      cashflow: [
        { month: 'Jan', in: 5000000, out: 2000000 },
        { month: 'Feb', in: 0, out: 4000000 },
      ],
      approvals: [
        { item: 'Top Sheet Budget v4', status: 'Approved', date: '2023-12-01' },
      ]
    },
    legal: {
      chainOfTitle: [
        { item: 'Option Agreement', status: 'Clean', notes: 'Executed 2022' },
      ],
      keyAgreements: [
        { type: 'Director Agreement', party: 'Ridley Scott Jr.', status: 'Executed', dueDate: '2023-10-01' },
      ],
      riskAssessment: [
        { category: 'Copyright', riskLevel: 'Low', description: 'Original screenplay, clean chain of title.' },
      ]
    }
  },
  {
    id: 'p2',
    title: 'The Thing That Hurts',
    stage: 'Development',
    status: 'Active',
    logline: 'An experimental therapy forces patients to physically confront their emotional pain.',
    synopsis: 'In a near-future clinic, trauma is extracted as physical entities. A rogue therapist must stop a malicious entity born from collective societal grief before it escapes the facility.',
    genre: 'Sci-Fi / Horror',
    createdAt: '2023-11-01T09:00:00Z',
    updatedAt: '2023-11-20T11:15:00Z',
    evaluation: {
      writer: 'Sarah Jenkins',
      financeType: 'Grant',
      financeStatus: 'Speculative',
      plannedBudget: '$12M',
      scores: { creative: 8.5, financial: 6.0 }
    },
    financing: {
      totalBudget: 12000000,
      secured: 0,
      currency: 'USD',
      breakdown: [],
      cashflow: [],
      approvals: []
    }
  },
  {
    id: 'p3',
    title: 'Linda Lisboa',
    stage: 'Production',
    status: 'Active',
    logline: 'A fading fado singer discovers a new rhythm in the underground clubs of Lisbon.',
    synopsis: 'Against the backdrop of a changing city, a traditional musician finds her voice again when she mentors a young, electronic music producer.',
    genre: 'Drama / Music',
    createdAt: '2023-09-01T08:00:00Z',
    updatedAt: '2023-12-05T16:45:00Z',
    evaluation: {
      writer: 'Maria Santos',
      director: 'Carlos Gomez',
      plannedBudget: '$8M',
      financeType: 'Tax Credit',
      financeStatus: 'Committed'
    },
    financing: {
      totalBudget: 8000000,
      secured: 8000000,
      currency: 'EUR',
      breakdown: [
        { category: 'Tax Credit', amount: 8000000, percentage: 100 }
      ],
      cashflow: [],
      approvals: []
    },
    closingChecklist: {
      financeClosed: true,
      talentConfirmed: true,
      legalDocsClosed: true
    }
  },
  {
    id: 'p4',
    title: 'WASP 2026',
    stage: 'Evaluation',
    status: 'Active',
    logline: 'A deep-cover agent infiltrates an elite, futuristic security firm.',
    synopsis: 'In a world where corporate espionage is fought with high-tech exosuits, an agent must decide between her mission and the team she has grown to trust.',
    genre: 'Action / Sci-Fi',
    createdAt: '2022-01-01T00:00:00Z',
    updatedAt: '2022-06-01T00:00:00Z',
    evaluation: {
      writer: 'Alan Smithee',
      plannedBudget: '$100M',
      scores: { creative: 4.0, financial: 2.0 }
    },
    archiveDetails: {
      reason: 'Financing not secured',
      revisit: 'Maybe',
      starred: false
    }
  }
];

// Reusing existing categories structure but will filter/apply based on stage in UI
const MOCK_CATEGORIES: Category[] = [
  { id: 'c1', projectId: 'p1', name: 'Script', slug: 'script', icon: 'FileText' },
  { id: 'c2', projectId: 'p1', name: 'Producers', slug: 'producers', icon: 'Users' },
  { id: 'c8', projectId: 'p1', name: 'Creatives', slug: 'creatives', icon: 'User' }, // Renamed from Actors & Directors
  { id: 'c11', projectId: 'p1', name: 'Underlying Rights', slug: 'underlying-rights', icon: 'FileText' },
  { id: 'c3', projectId: 'p1', name: 'Financing', slug: 'financing', icon: 'CircleDollarSign' },
  { id: 'c9', projectId: 'p1', name: 'Documentation', slug: 'legal', icon: 'Scale' }, // Renamed from Legal & Contracts
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
  { id: 'sc6', categoryId: 'c3', name: 'Finance Plan', slug: 'finance-plan' },
  { id: 'sc5', categoryId: 'c3', name: 'Cashflow', slug: 'cashflow' },
  // Documentation (Development)
  { id: 'sc20', categoryId: 'c9', name: 'Chain of Title', slug: 'chain-of-title' },
  { id: 'sc21', categoryId: 'c9', name: 'Writer Agreements', slug: 'writer-agreements' },
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

const MOCK_REVIEWS: ScriptReview[] = [];

const MOCK_PROJECT_NOTES: ProjectNote[] = [
  {
    id: 'pn1',
    projectId: 'p1',
    authorId: 'u1',
    authorName: 'Sarah Producer',
    text: 'We need to make sure the third act twist lands harder. Currently feels a bit rushed.',
    category: 'Script',
    timestamp: '2023-12-12T09:00:00Z',
  },
  {
    id: 'pn2',
    projectId: 'p1',
    authorId: 'u2',
    authorName: 'Mike Finance',
    text: 'Budget concerns around the Tokyo location shoot. Can we look at alternatives?',
    category: 'Financing',
    timestamp: '2023-12-12T10:30:00Z',
  }
];

const MOCK_PRODUCER_PROFILES: ProducerProfile[] = [
  {
    id: 'pp1',
    projectId: 'p1',
    name: 'Sarah Producer',
    company: 'Rocket Productions',
    role: 'Lead Producer',
    contactDetails: [
      { id: 'cd1', type: 'Email', value: 'sarah@rocket.com' },
      { id: 'cd2', type: 'Phone', value: '+1 (555) 123-4567' }
    ],
    links: [
      { id: 'l1', label: 'IMDb', url: 'https://imdb.com' },
      { id: 'l2', label: 'LinkedIn', url: 'https://linkedin.com' }
    ],
    notes: 'Primary point of contact for all creative decisions.',
    engagement: {
      status: 'Interested',
      roleOnProject: 'Lead Producer',
      contractStatus: 'Not sent',
      notes: ''
    }
  }
];

const MOCK_CREATIVE_PROFILES: CreativeProfile[] = [
  {
    id: 'cp1',
    projectId: 'p1',
    name: 'Ridley Scott Jr.',
    roleType: 'Director',
    specificRole: 'Director',
    agent: 'CAA',
    contactDetails: [
      { id: 'cd3', type: 'Agent Email', value: 'agent@caa.com' }
    ],
    links: [
      { id: 'l3', label: 'IMDb', url: 'https://imdb.com' }
    ],
    notes: 'Visionary director with a strong visual style.',
    engagement: {
      status: 'Contacted',
      roleOnProject: 'Director',
      contractStatus: 'Not sent',
      notes: ''
    }
  },
  {
    id: 'cp2',
    projectId: 'p1',
    name: 'Hiroyuki Sanada',
    roleType: 'Cast',
    specificRole: 'Detective Kaito',
    contactDetails: [],
    links: [],
    notes: 'Attached for lead role.',
    engagement: {
      status: 'Attached',
      roleOnProject: 'Detective Kaito',
      contractStatus: 'Signed',
      notes: ''
    }
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
  projectNotes: ProjectNote[];
  producerProfiles: ProducerProfile[];
  creativeProfiles: CreativeProfile[];
  currentProjectId: string | null;
  territories: Territory[];
  
  // Admin State
  users: User[];
  auditLogs: AuditLog[];
  
  login: (email: string) => void;
  logout: () => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'stage'>) => void;
  setCurrentProject: (id: string | null) => void;
  addDocument: (doc: Omit<Document, 'id' | 'uploadedBy' | 'uploadedAt'>) => void;
  deleteDocument: (documentId: string) => void;
  getProjectDocuments: (projectId: string, categoryId?: string, subcategoryId?: string) => Document[];
  getProjectCategories: (projectId: string) => Category[];
  getCategorySubcategories: (categoryId: string) => Subcategory[];
  
  setProjectStage: (projectId: string, stage: ProjectStage) => void;
  archiveProject: (projectId: string, details: { 
    reason: 'Creative pass' | 'Commercial viability' | 'Financing not secured' | 'Rights / legal issues' | 'Packaging fell through' | 'Paused (strategic / timing)' | 'Produced / completed' | 'Withdrawn'; 
    revisit: 'Yes' | 'Maybe' | 'No'; 
    starred: boolean; 
    notes?: string 
  }) => void;
  unarchiveProject: (projectId: string) => void;
  updateClosingChecklist: (projectId: string, checklist: Partial<Project['closingChecklist']>) => void;
  
  // Budget Actions
  updateBudgetState: (projectId: string, updates: Partial<ProjectFinanceState>) => void;
  updateBudgetDraft: (projectId: string, updates: Partial<BudgetVersion>) => void;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'authorId' | 'authorName'>) => void;
  deleteTask: (taskId: string) => void;
  toggleTaskStatus: (taskId: string) => void;
  getProjectTasks: (projectId: string) => Task[];

  // Evaluation Actions
  updateDocumentationChecklist: (projectId: string, checklist: Record<string, boolean>) => void;
  updateEvaluation: (projectId: string, data: Partial<EvaluationData>) => void;
  updateFinancing: (projectId: string, data: Partial<Project['financing']>) => void;
  getScriptAnnotations: (scriptId: string) => ScriptAnnotation[];
  addAnnotation: (annotation: Omit<ScriptAnnotation, 'id' | 'timestamp' | 'authorId' | 'authorName'>) => void;
  deleteAnnotation: (annotationId: string) => void;
  getProjectReviews: (projectId: string) => ScriptReview[];
  getScriptReviews: (scriptId: string) => ScriptReview[];
  addReview: (review: Omit<ScriptReview, 'id' | 'timestamp' | 'authorId' | 'authorName'>) => void;
  deleteReview: (reviewId: string) => void;
  deleteProject: (projectId: string) => void;

  // Project Notes Actions
  getProjectNotes: (projectId: string) => ProjectNote[];
  addProjectNote: (note: Omit<ProjectNote, 'id' | 'timestamp' | 'authorId' | 'authorName'>) => void;
  deleteProjectNote: (noteId: string) => void;

  // Producer Profile Actions
  getProducerProfiles: (projectId: string) => ProducerProfile[];
  addProducerProfile: (profile: Omit<ProducerProfile, 'id'>) => void;
  updateProducerProfile: (id: string, updates: Partial<ProducerProfile>) => void;
  deleteProducerProfile: (id: string) => void;

  // Creative Profile Actions
  getCreativeProfiles: (projectId: string) => CreativeProfile[];
  addCreativeProfile: (profile: Omit<CreativeProfile, 'id'>) => void;
  updateCreativeProfile: (id: string, updates: Partial<CreativeProfile>) => void;
  deleteCreativeProfile: (id: string) => void;

  // Generic Project Update
  updateProject: (projectId: string, updates: Partial<Project>) => void;

  // Territory / Distribution Actions
  getProjectTerritories: (projectId: string) => Territory[];
  addTerritory: (projectId: string, name: string) => void;
  updateTerritoryStatus: (territoryId: string, status: TerritoryStatus) => void;
  renameTerritory: (territoryId: string, name: string) => void;
  deleteTerritory: (territoryId: string) => void;
  addTerritoryNote: (territoryId: string, text: string) => void;
  editTerritoryNote: (noteId: string, text: string) => void;
  deleteTerritoryNote: (noteId: string) => void;
  addTerritoryDocument: (territoryId: string, doc: Omit<TerritoryDocument, 'id' | 'territoryId' | 'uploadedBy' | 'uploadedAt'>) => void;
  deleteTerritoryDocument: (documentId: string) => void;
  updateTerritoryDealInfo: (territoryId: string, dealInfo: Partial<TerritoryDealInfo>) => void;
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
  projectNotes: MOCK_PROJECT_NOTES,
  producerProfiles: MOCK_PRODUCER_PROFILES,
  creativeProfiles: MOCK_CREATIVE_PROFILES,
  currentProjectId: null,
  territories: [],
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
        evaluation: data.evaluation || {}, // Use provided evaluation data or default to empty
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...state.projects,
    ]
  })),

  deleteProject: (projectId) => set((state) => ({
    projects: state.projects.filter(p => p.id !== projectId),
    // Cleanup related data
    tasks: state.tasks.filter(t => t.projectId !== projectId),
    documents: state.documents.filter(d => d.projectId !== projectId),
    // We could clean up categories/reviews too if they were fully dynamic per project
    reviews: state.reviews.filter(r => r.projectId !== projectId),
    projectNotes: state.projectNotes.filter(n => n.projectId !== projectId),
  })),

  // Project Notes Actions
  getProjectNotes: (projectId) => {
    const { projectNotes } = get();
    return projectNotes.filter(n => n.projectId === projectId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  addProjectNote: (note) => set((state) => ({
    projectNotes: [
      {
        ...note,
        id: `pn${Date.now()}`,
        authorId: state.user?.id || 'unknown',
        authorName: state.user?.name || 'Unknown User',
        timestamp: new Date().toISOString(),
      },
      ...state.projectNotes
    ]
  })),

  deleteProjectNote: (noteId) => set((state) => ({
    projectNotes: state.projectNotes.filter(n => n.id !== noteId)
  })),

  // Producer Profile Actions
  getProducerProfiles: (projectId) => {
    const { producerProfiles } = get();
    return producerProfiles.filter(p => p.projectId === projectId);
  },

  addProducerProfile: (profile) => set((state) => ({
    producerProfiles: [
      { ...profile, id: `pp${Date.now()}` },
      ...state.producerProfiles
    ]
  })),

  updateProducerProfile: (id, updates) => set((state) => ({
    producerProfiles: state.producerProfiles.map(p => 
      p.id === id ? { ...p, ...updates } : p
    )
  })),

  deleteProducerProfile: (id) => set((state) => ({
    producerProfiles: state.producerProfiles.filter(p => p.id !== id)
  })),

  // Creative Profile Actions
  getCreativeProfiles: (projectId) => {
    const { creativeProfiles } = get();
    return creativeProfiles.filter(p => p.projectId === projectId);
  },

  addCreativeProfile: (profile) => set((state) => ({
    creativeProfiles: [
      { ...profile, id: `cp${Date.now()}` },
      ...state.creativeProfiles
    ]
  })),

  updateCreativeProfile: (id, updates) => set((state) => ({
    creativeProfiles: state.creativeProfiles.map(p => 
      p.id === id ? { ...p, ...updates } : p
    )
  })),

  deleteCreativeProfile: (id) => set((state) => ({
    creativeProfiles: state.creativeProfiles.filter(p => p.id !== id)
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
  
  deleteDocument: (documentId) => set((state) => ({
    documents: state.documents.filter(d => d.id !== documentId)
  })),

  updateProject: (projectId, updates) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
    )
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
    visibleSlugs.add('producers');
    visibleSlugs.add('creatives');

    // Underlying Rights is relevant across stages
    if (stage === 'Evaluation' || stage === 'Development' || stage === 'Production') {
      visibleSlugs.add('underlying-rights');
    }

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
    const { subcategories, categories } = get();
    // Special handling for Script category - hide subcategories to treat as single page
    const category = categories.find(c => c.id === categoryId);
    if (category?.slug === 'script') {
      return [];
    }
    // Special handling for Underlying Rights category - hide subcategories to treat as single page
    if (category?.slug === 'underlying-rights') {
      return [];
    }
    
    // Sort subcategories for Financing manually to ensure correct order
    // Order: Budget, Finance Plan, Cashflow
    if (category?.slug === 'financing') {
      const financeOrder = ['budget', 'finance-plan', 'cashflow'];
      return subcategories
        .filter(sc => sc.categoryId === categoryId)
        .sort((a, b) => {
          const indexA = financeOrder.indexOf(a.slug);
          const indexB = financeOrder.indexOf(b.slug);
          // If not in our custom order list, push to end
          const safeIndexA = indexA === -1 ? 999 : indexA;
          const safeIndexB = indexB === -1 ? 999 : indexB;
          return safeIndexA - safeIndexB;
        });
    }

    return subcategories.filter(sc => sc.categoryId === categoryId);
  },

  setProjectStage: (projectId, stage) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { ...p, stage, updatedAt: new Date().toISOString() } : p
    )
  })),

  archiveProject: (projectId, details) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { 
        ...p, 
        stage: 'Archived', 
        updatedAt: new Date().toISOString(),
        archiveDetails: {
          ...details,
          archivedAt: new Date().toISOString(),
          archivedFromStage: p.stage,
          archivedBy: state.user?.name || 'Unknown'
        }
      } : p
    )
  })),

  unarchiveProject: (projectId) => set((state) => ({
    projects: state.projects.map(p => {
      if (p.id !== projectId) return p;
      
      // Restore to original stage or default to Evaluation if not found
      const targetStage = p.archiveDetails?.archivedFromStage || 'Evaluation';
      
      // Create a copy without archiveDetails
      const { archiveDetails, ...rest } = p;
      
      return {
        ...rest,
        stage: targetStage,
        updatedAt: new Date().toISOString()
      };
    })
  })),

  updateClosingChecklist: (projectId, checklist) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { 
        ...p, 
        closingChecklist: { ...p.closingChecklist, ...checklist } as any 
      } : p
    )
  })),

  updateBudgetState: (projectId, updates) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? {
        ...p,
        budgetState: {
          ...(p.budgetState || { budgetDraft: null, budgetPending: null, budgetLockedHistory: [] }),
          ...updates
        }
      } : p
    )
  })),

  updateBudgetDraft: (projectId, updates) => set((state) => ({
    projects: state.projects.map(p => {
      if (p.id !== projectId || !p.budgetState?.budgetDraft) return p;
      return {
        ...p,
        budgetState: {
          ...p.budgetState,
          budgetDraft: { ...p.budgetState.budgetDraft, ...updates }
        }
      };
    })
  })),

  addTask: (task) => set((state) => ({
    tasks: [...state.tasks, { 
      ...task, 
      id: `t${Date.now()}`,
      createdAt: new Date().toISOString(),
      authorId: state.user?.id || 'unknown',
      authorName: state.user?.name || 'Unknown User'
    }]
  })),

  deleteTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter(t => t.id !== taskId)
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

  updateDocumentationChecklist: (projectId, checklist) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { 
        ...p, 
        documentationChecklist: { ...p.documentationChecklist, ...checklist } 
      } : p
    )
  })),

  // Evaluation Actions
  updateEvaluation: (projectId, data) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { ...p, evaluation: { ...p.evaluation, ...data } } : p
    )
  })),

  updateFinancing: (projectId, data) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { 
        ...p, 
        financing: p.financing ? { ...p.financing, ...data } : {
          totalBudget: 0,
          secured: 0,
          currency: 'USD',
          breakdown: [],
          cashflow: [],
          approvals: [],
          ...data
        }
      } : p
    )
  })),

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

  getProjectReviews: (projectId) => {
    const { reviews } = get();
    return reviews.filter(r => r.projectId === projectId);
  },

  getScriptReviews: (scriptId) => {
    const { documents, reviews } = get();
    const doc = documents.find(d => d.id === scriptId);
    if (!doc) return [];
    return reviews.filter(r => r.projectId === doc.projectId);
  },

  addReview: (review) => set((state) => {
    // Check if user already submitted a review for this project
    const currentUserId = state.user?.id;
    const existingReviewIndex = state.reviews.findIndex(
      r => r.projectId === review.projectId && r.authorId === currentUserId
    );

    if (existingReviewIndex >= 0) {
      // Replace existing review
      const updatedReviews = [...state.reviews];
      updatedReviews[existingReviewIndex] = {
        ...review,
        id: updatedReviews[existingReviewIndex].id, // Keep same ID
        timestamp: new Date().toISOString(),
        authorId: state.user?.id || 'unknown',
        authorName: state.user?.name || 'Unknown User'
      };
      return { reviews: updatedReviews };
    } else {
      // Add new review
      return {
        reviews: [
          { 
            ...review, 
            id: `r${Date.now()}`,
            timestamp: new Date().toISOString(),
            authorId: state.user?.id || 'unknown',
            authorName: state.user?.name || 'Unknown User'
          },
          ...state.reviews
        ]
      };
    }
  }),

  deleteReview: (reviewId) => set((state) => ({
    reviews: state.reviews.filter(r => r.id !== reviewId)
  })),

  // Territory / Distribution Actions
  getProjectTerritories: (projectId) => {
    return get().territories.filter(t => t.projectId === projectId);
  },

  addTerritory: (projectId, name) => set((state) => ({
    territories: [
      ...state.territories,
      {
        id: `ter${Date.now()}`,
        projectId,
        name,
        status: 'Available' as TerritoryStatus,
        notes: [],
        documents: [],
        dealInfo: {},
        updatedAt: new Date().toISOString(),
      }
    ]
  })),

  updateTerritoryStatus: (territoryId, status) => set((state) => ({
    territories: state.territories.map(t =>
      t.id === territoryId ? { ...t, status, updatedAt: new Date().toISOString() } : t
    )
  })),

  renameTerritory: (territoryId, name) => set((state) => ({
    territories: state.territories.map(t =>
      t.id === territoryId ? { ...t, name, updatedAt: new Date().toISOString() } : t
    )
  })),

  deleteTerritory: (territoryId) => set((state) => ({
    territories: state.territories.filter(t => t.id !== territoryId)
  })),

  addTerritoryNote: (territoryId, text) => set((state) => {
    const user = state.user;
    return {
      territories: state.territories.map(t => {
        if (t.id !== territoryId) return t;
        return {
          ...t,
          updatedAt: new Date().toISOString(),
          notes: [
            {
              id: `tn${Date.now()}`,
              territoryId,
              authorId: user?.id || 'unknown',
              authorName: user?.name || 'Unknown User',
              text,
              createdAt: new Date().toISOString(),
            },
            ...t.notes,
          ]
        };
      })
    };
  }),

  editTerritoryNote: (noteId, text) => set((state) => ({
    territories: state.territories.map(t => ({
      ...t,
      notes: t.notes.map(n =>
        n.id === noteId ? { ...n, text, editedAt: new Date().toISOString() } : n
      ),
      updatedAt: t.notes.some(n => n.id === noteId) ? new Date().toISOString() : t.updatedAt,
    }))
  })),

  deleteTerritoryNote: (noteId) => set((state) => ({
    territories: state.territories.map(t => ({
      ...t,
      notes: t.notes.filter(n => n.id !== noteId),
      updatedAt: t.notes.some(n => n.id === noteId) ? new Date().toISOString() : t.updatedAt,
    }))
  })),

  addTerritoryDocument: (territoryId, doc) => set((state) => {
    const user = state.user;
    return {
      territories: state.territories.map(t => {
        if (t.id !== territoryId) return t;
        return {
          ...t,
          updatedAt: new Date().toISOString(),
          documents: [
            ...t.documents,
            {
              ...doc,
              id: `td${Date.now()}`,
              territoryId,
              uploadedBy: user?.name || 'Unknown User',
              uploadedAt: new Date().toISOString(),
            }
          ]
        };
      })
    };
  }),

  deleteTerritoryDocument: (documentId) => set((state) => ({
    territories: state.territories.map(t => ({
      ...t,
      documents: t.documents.filter(d => d.id !== documentId),
      updatedAt: t.documents.some(d => d.id === documentId) ? new Date().toISOString() : t.updatedAt,
    }))
  })),

  updateTerritoryDealInfo: (territoryId, dealInfo) => set((state) => ({
    territories: state.territories.map(t =>
      t.id === territoryId
        ? { ...t, dealInfo: { ...t.dealInfo, ...dealInfo }, updatedAt: new Date().toISOString() }
        : t
    )
  })),

}),
{
  name: 'vault-storage-v11',
  storage: createJSONStorage(() => localStorage),
}
)
);
