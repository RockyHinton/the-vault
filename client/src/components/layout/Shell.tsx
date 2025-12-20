import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { APP_CONFIG } from "@/config/app-config";
import { 
  Film, 
  LayoutGrid, 
  Settings, 
  LogOut, 
  Search, 
  Bell, 
  ChevronRight,
  Menu
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

interface ShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function Shell({ children, sidebar }: ShellProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  if (!user) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2 font-display font-bold text-xl tracking-tight text-primary">
          <Film className="h-6 w-6" />
          <span>{APP_CONFIG.clientName}</span>
        </div>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 bg-sidebar border-r border-sidebar-border">
             <div className="h-full flex flex-col">
              <div className="p-6 border-b border-sidebar-border">
                <div className="flex items-center gap-2 font-display font-bold text-xl tracking-tight text-sidebar-primary">
                  <Film className="h-6 w-6" />
                  <span>{APP_CONFIG.clientName}</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto py-4">
                 {sidebar}
              </div>
             </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar (Main Navigation) */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0 shrink-0 z-30">
        <div className="p-6 border-b border-sidebar-border">
          <Link href="/projects">
            <div className="flex items-center gap-2 font-display font-bold text-xl tracking-tight text-sidebar-primary cursor-pointer hover:opacity-80 transition-opacity">
              <Film className="h-6 w-6" />
              <span>{APP_CONFIG.clientName}</span>
            </div>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 custom-scrollbar">
          {sidebar ? (
            sidebar
          ) : (
            <nav className="space-y-1">
              <Link href="/projects">
                <Button variant={location === "/projects" ? "secondary" : "ghost"} className="w-full justify-start gap-3">
                  <LayoutGrid className="h-4 w-4" />
                  Projects
                </Button>
              </Link>
              <Link href="/admin">
                <Button variant={location === "/admin" ? "secondary" : "ghost"} className="w-full justify-start gap-3">
                  <Settings className="h-4 w-4" />
                  Settings & Admin
                </Button>
              </Link>
            </nav>
          )}
        </div>

        <div className="p-4 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-sidebar-accent cursor-pointer transition-colors">
                <Avatar className="h-8 w-8 rounded-md border border-sidebar-border">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                    {user.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-sidebar border-sidebar-border text-sidebar-foreground">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <DropdownMenuItem className="focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
                Notifications
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-background/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex-1 flex items-center">
             {/* Breadcrumbs Placeholder - passed via children usually or handled in page */}
             <div className="max-w-md w-full relative hidden md:block">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
               <input 
                 type="text" 
                 placeholder="Search projects, documents..." 
                 className="w-full bg-secondary/50 border-none rounded-md py-2 pl-9 pr-4 text-sm focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground"
               />
             </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute top-2 right-2 h-2 w-2 bg-primary rounded-full ring-2 ring-background"></span>
            </Button>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {children}
        </div>
      </main>
    </div>
  );
}
