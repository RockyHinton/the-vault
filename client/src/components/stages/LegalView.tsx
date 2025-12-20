import { Project } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DocumentLibrary from "@/pages/DocumentLibrary";
import { 
  Scale, 
  ShieldAlert, 
  FileSignature, 
  Gavel,
  AlertTriangle,
  CheckCircle2,
  Clock
} from "lucide-react";

interface LegalViewProps {
  project: Project;
  currentSubcategory?: string;
  subcategoryId?: string;
}

export default function LegalView({ project, currentSubcategory, subcategoryId }: LegalViewProps) {
  
  // Drill-down view
  if (subcategoryId) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
             <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">
               {currentSubcategory}
             </h2>
             <p className="text-muted-foreground mt-1">
               Legal documentation and executed agreements.
             </p>
          </div>
        </div>
        <DocumentLibrary 
           projectId={project.id} 
           categoryId="c9" // Hardcoded for Legal category
           subcategoryId={subcategoryId} 
         />
      </div>
    );
  }

  // Dashboard View
  const legal = project.legal;

  if (!legal) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-70">
        <Scale className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground">No Legal Data</h2>
        <p className="text-muted-foreground">Legal framework not yet initialized.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div>
        <h2 className="text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
          <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center p-0 border-blue-500/20 bg-blue-500/10 text-blue-500">
            <Scale className="h-4 w-4" />
          </Badge>
          Legal & Business Affairs
        </h2>
        <p className="text-muted-foreground mt-1 ml-11">
          Chain of title, rights management, and risk assessment.
        </p>
      </div>

      {/* Top Metrics - Chain of Title */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
           <CardHeader className="pb-3">
             <CardTitle className="text-lg flex items-center gap-2">
               <Gavel className="h-5 w-5 text-muted-foreground" />
               Chain of Title Status
             </CardTitle>
             <CardDescription>Ownership and underlying rights status.</CardDescription>
           </CardHeader>
           <CardContent>
             <div className="space-y-4">
               {legal.chainOfTitle.map((item, i) => (
                 <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                    <div className="flex items-center gap-3">
                      {item.status === 'Clean' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : item.status === 'Issues' ? (
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      ) : (
                        <Clock className="h-5 w-5 text-amber-500" />
                      )}
                      <div>
                        <div className="font-medium">{item.item}</div>
                        {item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}
                      </div>
                    </div>
                    <Badge variant={item.status === 'Clean' ? 'outline' : item.status === 'Issues' ? 'destructive' : 'secondary'}>
                      {item.status}
                    </Badge>
                 </div>
               ))}
             </div>
           </CardContent>
        </Card>

        {/* Risk Assessment */}
        <Card className="bg-destructive/5 border-destructive/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Risk Assessment
            </CardTitle>
            <CardDescription>Potential liabilities and clearance issues.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {legal.riskAssessment.map((risk, i) => (
                <div key={i} className="flex flex-col gap-1 pb-3 border-b border-destructive/10 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{risk.category}</span>
                    <Badge variant="outline" className={`
                      ${risk.riskLevel === 'High' ? 'bg-destructive text-destructive-foreground border-destructive' : 
                        risk.riskLevel === 'Medium' ? 'text-amber-600 border-amber-200 bg-amber-50' : 
                        'text-green-600 border-green-200 bg-green-50'}
                    `}>
                      {risk.riskLevel} Risk
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {risk.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key Agreements Tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-muted-foreground" />
            Key Agreements Tracker
          </CardTitle>
          <CardDescription>Status of primary production contracts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {legal.keyAgreements.map((agreement, i) => (
              <div key={i} className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={
                    agreement.status === 'Executed' ? 'default' : 
                    agreement.status === 'Negotiation' ? 'secondary' : 'outline'
                  } className="mb-2">
                    {agreement.status}
                  </Badge>
                  {agreement.dueDate && (
                    <span className="text-[10px] text-muted-foreground font-mono bg-secondary/50 px-1.5 py-0.5 rounded">
                      Due: {agreement.dueDate}
                    </span>
                  )}
                </div>
                <div className="font-semibold text-sm truncate" title={agreement.type}>{agreement.type}</div>
                <div className="text-sm text-muted-foreground truncate" title={agreement.party}>{agreement.party}</div>
                
                <div className="mt-4 pt-3 border-t flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                   <span className="text-xs text-primary font-medium cursor-pointer hover:underline">View Draft &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
