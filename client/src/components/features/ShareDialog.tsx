import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Link as LinkIcon, Lock, Calendar } from "lucide-react";

interface ShareDialogProps {
  documentTitle: string;
  children?: React.ReactNode;
}

export function ShareDialog({ documentTitle, children }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  
  const mockLink = `https://thevault.app/share/${Math.random().toString(36).substring(7)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(mockLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <LinkIcon className="mr-2 h-4 w-4" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Share Document</DialogTitle>
          <DialogDescription>
            Create a secure link for <strong>{documentTitle}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-4">
             <div className="flex items-center justify-between space-x-2">
               <Label htmlFor="password-protect" className="flex flex-col space-y-1">
                 <span>Password Protection</span>
                 <span className="font-normal text-xs text-muted-foreground">Require a password to view this link</span>
               </Label>
               <Switch 
                 id="password-protect" 
                 checked={isPasswordProtected}
                 onCheckedChange={setIsPasswordProtected}
               />
             </div>
             {isPasswordProtected && (
               <div className="relative">
                 <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                 <Input className="pl-9" type="password" placeholder="Enter password" />
               </div>
             )}
             
             <div className="flex items-center justify-between space-x-2">
               <Label htmlFor="expiry" className="flex flex-col space-y-1">
                 <span>Link Expiry</span>
                 <span className="font-normal text-xs text-muted-foreground">Link expires in 7 days</span>
               </Label>
               <Switch id="expiry" defaultChecked />
             </div>
          </div>

          <div className="space-y-2">
            <Label>Share Link</Label>
            <div className="flex items-center space-x-2">
              <div className="grid flex-1 gap-2">
                <Input 
                  defaultValue={mockLink}
                  readOnly
                  className="bg-secondary/50 font-mono text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="px-3" onClick={handleCopy}>
                <span className="sr-only">Copy</span>
                {copied ? <span className="text-green-500 font-bold">Copied!</span> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
