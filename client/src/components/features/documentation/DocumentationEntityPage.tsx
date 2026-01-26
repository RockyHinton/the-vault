import { useState } from "react";
import { Project, useStore, DocEntity, DocFile, DocumentationState } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Upload
} from "lucide-react";
import { format } from "date-fns";
import { nanoid } from 'nanoid';
import { cn } from "@/lib/utils";

// --- CONFIGURATION ---

interface PageConfig {
  addButtonLabel: string;
  modalTitle: string;
  fields: {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select' | 'textarea';
    required?: boolean;
    options?: string[]; // for select
    placeholder?: string;
  }[];
  entityTitleTemplate: (meta: any) => string;
  secondaryLineTemplate: (meta: any) => string;
  docTypeOptions: string[];
}

const DOC_PAGE_CONFIG: Record<string, PageConfig> = {
  chain_of_title: {
    addButtonLabel: "Add Rights Item",
    modalTitle: "Add Rights Item",
    fields: [
      { key: 'title', label: 'Rights item title', type: 'text', required: true, placeholder: 'e.g. Original Screenplay' },
      { key: 'holder', label: 'Rights holder / Author', type: 'text', required: true },
      { key: 'type', label: 'Rights type', type: 'select', required: true, options: ['Original Screenplay', 'Underlying Work (Book/Article)', 'Rewrite', 'Assignment', 'Option', 'Other'] },
      { key: 'date', label: 'Option / Agreement date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => `${m.title} — ${m.holder}`,
    secondaryLineTemplate: (m) => m.type,
    docTypeOptions: ['Option Agreement', 'Assignment Agreement', 'Writer Agreement', 'Amendment', 'Release', 'Chain of Title Summary', 'Other']
  },
  writer_agreements: {
    addButtonLabel: "Add Writer",
    modalTitle: "Add Writer",
    fields: [
      { key: 'name', label: 'Writer name', type: 'text', required: true },
      { key: 'role', label: 'Role', type: 'select', required: true, options: ['Original Writer', 'Co-writer', 'Rewrite', 'Polish', 'Story By', 'Other'] },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => `${m.role}${m.company ? ` · ${m.company}` : ''}`,
    docTypeOptions: ['Writer Agreement', 'Deal Memo', 'Assignment', 'Amendment', 'NDA', 'Other']
  },
  investment_agreements: {
    addButtonLabel: "Add Investor",
    modalTitle: "Add Investor",
    fields: [
      { key: 'name', label: 'Investor name / entity', type: 'text', required: true },
      { key: 'type', label: 'Investor type', type: 'select', required: true, options: ['Individual', 'Company', 'Fund', 'Other'] },
      { key: 'amount', label: 'Amount committed', type: 'number', required: true },
      { key: 'status', label: 'Status', type: 'select', required: true, options: ['Targeted', 'Soft committed', 'Closed'] },
      { key: 'email', label: 'Contact email', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => `£${Number(m.amount).toLocaleString()} · ${m.status}`,
    docTypeOptions: ['Subscription Agreement', 'Term Sheet', 'Side Letter', 'Proof of Funds', 'KYC / ID', 'Amendment', 'Other']
  },
  co_production: {
    addButtonLabel: "Add Co-Producer",
    modalTitle: "Add Co-Producer",
    fields: [
      { key: 'name', label: 'Partner company name', type: 'text', required: true },
      { key: 'country', label: 'Country', type: 'text' },
      { key: 'contactName', label: 'Contact name', type: 'text' },
      { key: 'email', label: 'Contact email', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => m.country || '',
    docTypeOptions: ['Co-Production Agreement', 'Annex / Schedule', 'Amendment', 'Letter of Intent', 'Other']
  },
  producers_agreements: {
    addButtonLabel: "Add Producer",
    modalTitle: "Add Producer",
    fields: [
      { key: 'name', label: 'Producer name', type: 'text', required: true },
      { key: 'role', label: 'Producer role', type: 'select', required: true, options: ['Producer', 'Executive Producer', 'Line Producer', 'Co-Producer', 'Associate Producer', 'Other'] },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => `${m.role}${m.company ? ` · ${m.company}` : ''}`,
    docTypeOptions: ['Producer Agreement', 'Deal Memo', 'Amendment', 'NDA', 'Other']
  },
  director_agreements: {
    addButtonLabel: "Add Director",
    modalTitle: "Add Director",
    fields: [
      { key: 'name', label: 'Director name', type: 'text', required: true },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => "Director",
    docTypeOptions: ['Director Agreement', 'Deal Memo', 'Amendment', 'NDA', 'Other']
  },
  cast_agreements: {
    addButtonLabel: "Add Cast Member",
    modalTitle: "Add Cast Member",
    fields: [
      { key: 'name', label: 'Cast name', type: 'text', required: true },
      { key: 'role', label: 'Role / Character name', type: 'text', required: true },
      { key: 'type', label: 'Cast type', type: 'select', required: true, options: ['Lead', 'Supporting', 'Day Player', 'Extra', 'Other'] },
      { key: 'fee', label: 'Fee', type: 'number' },
      { key: 'agent', label: 'Agent / Representative', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => `${m.role} · ${m.type}`,
    docTypeOptions: ['Cast Agreement', 'Deal Memo', 'Amendment', 'Release', 'NDA', 'Other']
  },
  banking_docs: {
    addButtonLabel: "Add Bank",
    modalTitle: "Add Bank / Financial Entity",
    fields: [
      { key: 'name', label: 'Bank / entity name', type: 'text', required: true },
      { key: 'purpose', label: 'Purpose', type: 'select', required: true, options: ['Production Account', 'Escrow', 'Completion Bond', 'Loan Facility', 'Other'] },
      { key: 'contactName', label: 'Contact name', type: 'text' },
      { key: 'email', label: 'Contact email', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => m.purpose,
    docTypeOptions: ['Account Agreement', 'Escrow Agreement', 'Bond Documents', 'Loan Agreement', 'Bank Letter', 'Amendment', 'Other']
  },
  funding_tax_credit: {
    addButtonLabel: "Add Funding Body",
    modalTitle: "Add Funding Body / Authority",
    fields: [
      { key: 'name', label: 'Funding body / authority name', type: 'text', required: true },
      { key: 'type', label: 'Funding type', type: 'select', required: true, options: ['Tax Credit', 'Grant', 'Public Fund', 'Rebate / Incentive', 'Other'] },
      { key: 'amount', label: 'Expected amount', type: 'number' },
      { key: 'region', label: 'Country/Region', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => `${m.type}${m.region ? ` · ${m.region}` : ''}`,
    docTypeOptions: ['Application', 'Approval Letter', 'Opinion Letter', 'Interim Claim', 'Final Claim', 'Payment Confirmation', 'Other']
  },
  sales_agency: {
    addButtonLabel: "Add Sales Agent",
    modalTitle: "Add Sales Agent",
    fields: [
      { key: 'name', label: 'Sales agent name', type: 'text', required: true },
      { key: 'territory', label: 'Territory focus', type: 'text' },
      { key: 'contactName', label: 'Contact name', type: 'text' },
      { key: 'email', label: 'Contact email', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => m.territory || '',
    docTypeOptions: ['Sales Agency Agreement', 'Territory Schedule', 'Amendment', 'Letter of Intent', 'Other']
  },
  cama: {
    addButtonLabel: "Add Collection Account Manager",
    modalTitle: "Add Collection Account Manager",
    fields: [
      { key: 'name', label: 'CAMA provider name', type: 'text', required: true },
      { key: 'contactName', label: 'Contact name', type: 'text' },
      { key: 'email', label: 'Contact email', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    entityTitleTemplate: (m) => m.name,
    secondaryLineTemplate: (m) => "CAMA",
    docTypeOptions: ['CAMA Agreement', 'Account Details', 'Schedule / Annex', 'Amendment', 'Notices', 'Other']
  }
};


interface DocumentationEntityPageProps {
  project: Project;
  docTypeKey: string;
}

export default function DocumentationEntityPage({ project, docTypeKey }: DocumentationEntityPageProps) {
  const { updateProject } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEntityData, setNewEntityData] = useState<Record<string, any>>({});
  const [entityToDelete, setEntityToDelete] = useState<string | null>(null);
  
  // Get current page config
  const config = DOC_PAGE_CONFIG[docTypeKey];
  
  if (!config) {
    return <div className="p-8 text-center text-muted-foreground">Configuration not found for {docTypeKey}</div>;
  }

  // Get state
  const docState = project.documentationState || {};
  const pageState = docState[docTypeKey] || { entities: [], lastUpdatedAt: new Date().toISOString() };
  const entities = pageState.entities;

  // -- Helpers --

  const updateEntities = (newEntities: DocEntity[]) => {
    updateProject(project.id, {
      documentationState: {
        ...docState,
        [docTypeKey]: {
          entities: newEntities,
          lastUpdatedAt: new Date().toISOString()
        }
      }
    });
  };

  const handleCreateEntity = () => {
    // Basic validation
    const missing = config.fields.filter(f => f.required && !newEntityData[f.key]);
    if (missing.length > 0) return; // simple validation

    const newEntity: DocEntity = {
      id: nanoid(),
      title: config.entityTitleTemplate(newEntityData),
      meta: { ...newEntityData },
      isExpanded: false, // collapsed by default
      documents: []
    };

    updateEntities([...entities, newEntity]);
    setNewEntityData({});
    setIsModalOpen(false);
  };

  const toggleExpand = (id: string) => {
    updateEntities(entities.map(e => 
      e.id === id ? { ...e, isExpanded: !e.isExpanded } : e
    ));
  };

  const deleteEntity = (id: string) => {
    updateEntities(entities.filter(e => e.id !== id));
    setEntityToDelete(null);
  };

  // -- Document Helpers --

  const addDocument = (entityId: string, docData: Partial<DocFile>) => {
    const newDoc: DocFile = {
      id: nanoid(),
      fileName: docData.fileName || 'Untitled',
      docType: docData.docType || config.docTypeOptions[0],
      status: (docData.status as any) || 'Draft',
      uploadedAt: new Date().toISOString(),
      notes: docData.notes
    };

    updateEntities(entities.map(e => {
      if (e.id === entityId) {
        return { ...e, documents: [...e.documents, newDoc] };
      }
      return e;
    }));
  };

  const updateDocument = (entityId: string, docId: string, updates: Partial<DocFile>) => {
    updateEntities(entities.map(e => {
      if (e.id === entityId) {
        return { 
          ...e, 
          documents: e.documents.map(d => d.id === docId ? { ...d, ...updates } : d)
        };
      }
      return e;
    }));
  };
  
  const deleteDocument = (entityId: string, docId: string) => {
    updateEntities(entities.map(e => {
      if (e.id === entityId) {
        return { 
          ...e, 
          documents: e.documents.filter(d => d.id !== docId)
        };
      }
      return e;
    }));
  };

  // -- Metrics --
  
  const totalEntities = entities.length;
  // Confirmed: entity has at least ONE document with status "Approved" or "Signed"
  const confirmedCount = entities.filter(e => 
    e.documents.some(d => ['Approved', 'Signed'].includes(d.status))
  ).length;
  const pendingCount = totalEntities - confirmedCount;
  
  const isComplete = totalEntities > 0 && pendingCount === 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 1) HEADER & STAT BAR */}
      <div className="space-y-4">
        {/* Stat Bar */}
        <div className="flex items-center justify-between bg-card border rounded-lg p-3 shadow-sm">
          <div className="flex items-center gap-6">
             <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Status</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isComplete ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700 h-5 px-1.5 text-[10px]">Complete</Badge>
                  ) : (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">In Progress</Badge>
                  )}
                </div>
             </div>
             <div className="h-8 w-px bg-border" />
             <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Entities</span>
                <span className="text-sm font-mono font-bold">{totalEntities}</span>
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Confirmed</span>
                <span className="text-sm font-mono font-bold text-green-600">{confirmedCount}</span>
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pending</span>
                <span className="text-sm font-mono font-bold text-amber-500">{pendingCount}</span>
             </div>
          </div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Updated {format(new Date(pageState.lastUpdatedAt), 'MMM d, h:mm a')}
          </div>
        </div>
      </div>

      {/* 2) ADD BUTTON */}
      <div className="flex justify-end">
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {config.addButtonLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{config.modalTitle}</DialogTitle>
              <DialogDescription>
                Enter the details below. You can upload documents after creating the entity.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {config.fields.map(field => (
                <div key={field.key} className="grid gap-2">
                  <Label htmlFor={field.key} className="text-sm font-medium">
                    {field.label} {field.required && <span className="text-destructive">*</span>}
                  </Label>
                  {field.type === 'textarea' ? (
                    <Textarea 
                      id={field.key}
                      value={newEntityData[field.key] || ''}
                      onChange={e => setNewEntityData({...newEntityData, [field.key]: e.target.value})}
                      placeholder={field.placeholder}
                    />
                  ) : field.type === 'select' ? (
                    <Select 
                      onValueChange={val => setNewEntityData({...newEntityData, [field.key]: val})}
                      value={newEntityData[field.key]}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={field.key}
                      type={field.type}
                      value={newEntityData[field.key] || ''}
                      onChange={e => setNewEntityData({...newEntityData, [field.key]: e.target.value})}
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateEntity}>Create Entity</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 3) ENTITY LIST */}
      <div className="space-y-4">
        {entities.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No entities added yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
                Start by adding an entity, then upload relevant documents to track their status.
              </p>
              <Button variant="outline" onClick={() => setIsModalOpen(true)}>
                {config.addButtonLabel}
              </Button>
            </CardContent>
          </Card>
        ) : (
          entities.map(entity => {
            const confirmedDocs = entity.documents.filter(d => ['Approved', 'Signed'].includes(d.status)).length;
            const isEntityConfirmed = confirmedDocs > 0;

            return (
              <Card key={entity.id} className="overflow-hidden transition-all duration-200">
                {/* Collapsed Header */}
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(entity.id)}
                >
                   <div className="flex items-center gap-4 flex-1">
                      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0", isEntityConfirmed ? "bg-green-100 dark:bg-green-900/30 text-green-600" : "bg-muted text-muted-foreground")}>
                         {isEntityConfirmed ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="font-semibold text-base">{entity.title}</div>
                        <div className="text-sm text-muted-foreground">{config.secondaryLineTemplate(entity.meta)}</div>
                      </div>
                      {/* Badges */}
                      <div className="ml-auto flex items-center gap-3 mr-4">
                         <div className="flex flex-col items-end">
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Docs</span>
                            <span className="text-xs font-medium">{entity.documents.length}</span>
                         </div>
                         <Badge variant={isEntityConfirmed ? "outline" : "secondary"} className={cn("ml-2", isEntityConfirmed && "border-green-200 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800")}>
                           {isEntityConfirmed ? "Confirmed" : "Pending"}
                         </Badge>
                      </div>
                   </div>
                   <Button variant="ghost" size="icon" className="shrink-0">
                      {entity.isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                   </Button>
                </div>

                {/* Expanded Content */}
                {entity.isExpanded && (
                  <div className="border-t bg-muted/5 p-6 animate-in slide-in-from-top-2 duration-200">
                    
                    {/* A) Details Read-only Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
                      {config.fields.map(field => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{field.label}</label>
                          <div className="text-sm font-medium break-words">
                            {entity.meta[field.key] || <span className="text-muted-foreground italic">-</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* B) Documents Section */}
                    <div className="space-y-3">
                       <div className="flex items-center justify-between border-b pb-2">
                         <h4 className="text-sm font-semibold flex items-center gap-2">
                           <FileText className="h-4 w-4 text-muted-foreground" />
                           Documents
                         </h4>
                         {/* Mock Upload Button */}
                         <Button 
                           variant="secondary" 
                           size="sm" 
                           className="h-7 text-xs"
                           onClick={(e) => {
                             e.stopPropagation();
                             const fileName = prompt("Enter file name (Simulation):", "Agreement_v1.pdf");
                             if (fileName) addDocument(entity.id, { fileName });
                           }}
                         >
                           <Upload className="h-3 w-3 mr-1.5" />
                           Upload Document
                         </Button>
                       </div>

                       {entity.documents.length === 0 ? (
                         <div className="text-sm text-muted-foreground italic py-2">No documents uploaded.</div>
                       ) : (
                         <div className="space-y-2">
                           {entity.documents.map(doc => (
                             <div key={doc.id} className="flex items-center gap-3 p-3 bg-background border rounded-md shadow-sm">
                               <div className="h-8 w-8 bg-blue-50 dark:bg-blue-900/20 rounded flex items-center justify-center text-blue-600">
                                 <FileText className="h-4 w-4" />
                               </div>
                               <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                                  <div className="col-span-4 truncate font-medium text-sm" title={doc.fileName}>{doc.fileName}</div>
                                  
                                  {/* Doc Type Dropdown */}
                                  <div className="col-span-3">
                                    <Select 
                                      value={doc.docType} 
                                      onValueChange={(val) => updateDocument(entity.id, doc.id, { docType: val })}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {config.docTypeOptions.map(opt => (
                                          <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {/* Status Dropdown */}
                                  <div className="col-span-3">
                                     <Select 
                                      value={doc.status} 
                                      onValueChange={(val: any) => updateDocument(entity.id, doc.id, { status: val })}
                                    >
                                      <SelectTrigger className={cn("h-7 text-xs border-0", 
                                        doc.status === 'Approved' || doc.status === 'Signed' ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400" : 
                                        doc.status === 'Pending' ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400" :
                                        "bg-muted text-muted-foreground"
                                      )}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {['Draft', 'Pending', 'Signed', 'Approved'].map(opt => (
                                          <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="col-span-2 text-right text-[10px] text-muted-foreground">
                                    {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}
                                  </div>
                               </div>
                               <Button 
                                 variant="ghost" 
                                 size="icon" 
                                 className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                 onClick={() => deleteDocument(entity.id, doc.id)}
                               >
                                 <Trash2 className="h-3 w-3" />
                               </Button>
                             </div>
                           ))}
                         </div>
                       )}
                    </div>

                    {/* Delete Entity Option */}
                    <div className="mt-8 pt-4 border-t flex justify-end">
                       <Button 
                         variant="ghost" 
                         size="sm" 
                         className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                         onClick={() => setEntityToDelete(entity.id)}
                       >
                         <Trash2 className="h-3 w-3 mr-1.5" />
                         Remove Entity
                       </Button>
                    </div>

                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!entityToDelete} onOpenChange={(open) => !open && setEntityToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the entity and all {entities.find(e => e.id === entityToDelete)?.documents.length || 0} attached documents from the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => entityToDelete && deleteEntity(entityToDelete)}
            >
              Delete Entity
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}