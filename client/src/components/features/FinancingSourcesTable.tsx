import { useState, useEffect } from "react";
import { Project, useStore } from "@/lib/store";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface FinancingSourcesTableProps {
  project: Project;
}

export function FinancingSourcesTable({ project }: FinancingSourcesTableProps) {
  // Read-only table for Financing Overview
  // Displays data from project.financing.breakdown which is now managed by Finance Plan
  
  const rows = project.financing?.breakdown || [];
  
  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'GBP': '£',
    'EUR': '€'
  };
  
  const currentSymbol = project.financing?.currency ? currencySymbols[project.financing.currency] || '$' : '$';

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="border rounded-lg overflow-hidden bg-card flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[60%]">Financing Source</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
               <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                  No approved financing sources yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <span className="font-medium">{row.category}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                     {currentSymbol}{row.amount.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
            <TableRow className="bg-muted/20 font-medium border-t-2 border-border">
              <TableCell>Total Secured Funding</TableCell>
              <TableCell className="text-right font-mono text-green-600">
                {currentSymbol}{total.toLocaleString()}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      
      <div className="mt-4 flex justify-end">
        <Link href={`/project/${project.id}/financing/finance-plan`}>
          <Button variant="outline" size="sm" className="gap-2">
            Manage Finance Plan <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
