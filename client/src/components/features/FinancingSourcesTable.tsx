import type { FinancingOverview, FinancingSummary } from "@shared/contracts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { financeSourceStatusClass, financeSourceStatusLabels, financeSourceTypeLabels } from "@/features/finance-plan/labels";

type OverviewSource = NonNullable<FinancingOverview["financePlan"]>["sources"][number];

interface FinancingSourcesTableProps {
  projectId: string;
  sources: OverviewSource[];
  summary: FinancingSummary | null;
  money: (value: string) => string;
}

/** Read-only table of the finance plan's sources for the overview; edits happen in the Finance Plan. */
export function FinancingSourcesTable({ projectId, sources, summary, money }: FinancingSourcesTableProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="border rounded-lg overflow-hidden bg-card flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[50%]">Financing Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  No financing sources yet.
                </TableCell>
              </TableRow>
            ) : (
              sources.map((source) => (
                <TableRow key={source.id} data-testid="overview-source">
                  <TableCell>
                    <span className="font-medium">{source.name}</span>
                    <span className="block text-xs text-muted-foreground">{financeSourceTypeLabels[source.type]}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", financeSourceStatusClass[source.status])}>
                      {financeSourceStatusLabels[source.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{money(source.amount)}</TableCell>
                </TableRow>
              ))
            )}
            <TableRow className="bg-muted/20 font-medium border-t-2 border-border">
              <TableCell colSpan={2}>Total Secured Funding</TableCell>
              <TableCell className="text-right font-mono text-green-600" data-testid="overview-secured-total">
                {summary ? money(summary.approvedTotal) : "—"}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex justify-end">
        <Link href={`/project/${projectId}/financing/finance-plan`}>
          <Button variant="outline" size="sm" className="gap-2">
            Manage Finance Plan <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
