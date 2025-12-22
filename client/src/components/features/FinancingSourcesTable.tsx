import { useState, useEffect } from "react";
import { Project, useStore } from "@/lib/store";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

interface FinancingSourcesTableProps {
  project: Project;
}

export function FinancingSourcesTable({ project }: FinancingSourcesTableProps) {
  const { updateFinancing } = useStore();
  
  // Initialize from project data or default
  // We are currently mapping 'breakdown' to sources for this request
  // Ideally, we'd add a 'financingSources' field to the Project/Financing type, 
  // but for now, let's reuse the existing breakdown structure or repurpose it.
  // The user wants: "The columns will be 'Financing' and 'Total', the financing being text cells that take the name or company"
  
  // Since we can't easily change the backend schema in mockup mode if it was real, 
  // but here we are in full control of the store.
  // Let's check store.ts: financing.breakdown is { category: string; amount: number; percentage: number }[]
  // This fits perfectly. category = Name, amount = Total.

  const [rows, setRows] = useState(
    project.financing?.breakdown || [
      { category: "Investor A", amount: 0, percentage: 0 },
      { category: "Grant B", amount: 0, percentage: 0 }
    ]
  );

  // Sync rows with store when project changes (if needed)
  useEffect(() => {
    if (project.financing?.breakdown) {
      setRows(project.financing.breakdown);
    }
  }, [project.financing?.breakdown]);

  const updateRow = (index: number, field: 'category' | 'amount', value: string | number) => {
    const newRows = [...rows];
    if (field === 'category') {
      newRows[index].category = value as string;
    } else {
      newRows[index].amount = Number(value) || 0;
    }
    
    // Recalculate percentages? 
    // The chart needs percentages, but typically they are derived from total.
    // Let's just update rows first.
    setRows(newRows);
    
    // Auto-save to store?
    // We need to calculate percentages for the store to be happy, or just let the view derive them.
    // The store interface has 'percentage'.
    const total = newRows.reduce((sum, r) => sum + r.amount, 0);
    const rowsWithPercentage = newRows.map(r => ({
      ...r,
      percentage: total > 0 ? Number(((r.amount / total) * 100).toFixed(1)) : 0
    }));

    // Update store with new breakdown AND calculated secured amount
    updateFinancing(project.id, {
      breakdown: rowsWithPercentage,
      secured: total
    });
  };

  const addRow = () => {
    const newRows = [...rows, { category: "New Source", amount: 0, percentage: 0 }];
    setRows(newRows);
    // Don't sync yet, wait for input? Or sync immediately. Sync immediately is safer for UI consistency.
    // Actually, let's just trigger the same update logic.
    // Re-using logic:
    const total = newRows.reduce((sum, r) => sum + r.amount, 0);
    const rowsWithPercentage = newRows.map(r => ({
      ...r,
      percentage: total > 0 ? Number(((r.amount / total) * 100).toFixed(1)) : 0
    }));
    updateFinancing(project.id, { breakdown: rowsWithPercentage, secured: total });
  };

  const removeRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    
    const total = newRows.reduce((sum, r) => sum + r.amount, 0);
    const rowsWithPercentage = newRows.map(r => ({
      ...r,
      percentage: total > 0 ? Number(((r.amount / total) * 100).toFixed(1)) : 0
    }));
    
    updateFinancing(project.id, { breakdown: rowsWithPercentage, secured: total });
  };

  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'GBP': '£',
    'EUR': '€'
  };
  
  const currentSymbol = project.financing?.currency ? currencySymbols[project.financing.currency] || '$' : '$';

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[60%]">Financing Source</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              <TableCell>
                <Input 
                  value={row.category} 
                  onChange={(e) => updateRow(index, 'category', e.target.value)}
                  className="border-transparent hover:border-input focus:border-ring h-8"
                  placeholder="Source Name"
                />
              </TableCell>
              <TableCell className="text-right">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{currentSymbol}</span>
                  <Input 
                    type="text"
                    value={row.amount ? row.amount.toLocaleString() : ''} 
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      updateRow(index, 'amount', value);
                    }}
                    className="border-transparent hover:border-input focus:border-ring h-8 text-right font-mono pl-7"
                    placeholder="0"
                  />
                </div>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeRow(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/20 font-medium">
            <TableCell>Total Secured Funding</TableCell>
            <TableCell className="text-right font-mono text-green-600">
              {currentSymbol}{total.toLocaleString()}
            </TableCell>
            <TableCell>
               <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={addRow}>
                  <Plus className="h-4 w-4" />
                </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
