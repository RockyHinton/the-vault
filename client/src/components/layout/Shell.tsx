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
  Menu,
} from "lucide-react";
import { useClerk } from "@clerk/react";
import { useCurrentUser } from "@/features/auth/use-current-user";
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
import logoImg from "@/assets/3six9-logo-white.png";

interface ShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function Shell({ children, sidebar }: ShellProps) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { data } = useCurrentUser();
  const user = data?.data.user;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const legacyFixtureExport =
    typeof window !== "undefined"
      ? window.localStorage.getItem("vault-storage-v11")
      : null;

  const handleLogout = () => {
    signOut({ redirectUrl: "/" });
  };
  const downloadLegacyFixtureExport = () => {
    if (!legacyFixtureExport) return;
    const href = URL.createObjectURL(
      new Blob([legacyFixtureExport], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = "vault-storage-v11-legacy-export.json";
    link.click();
    URL.revokeObjectURL(href);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2.5 whitespace-nowrap">
          <img
            src={logoImg}
            alt="3six9 Logo"
            className="h-[64px] w-auto object-contain opacity-95 translate-y-[-1px] -ml-1"
            style={{
              filter:
                "brightness(1.08) contrast(1.08) drop-shadow(0 0 6px rgba(255,255,255,0.08))",
            }}
          />
          <span className="font-display font-semibold text-xl tracking-[0.02em] text-white/90 -translate-y-[4px]">
            {APP_CONFIG.clientName}
          </span>
        </div>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="p-0 w-72 bg-sidebar border-r border-sidebar-border"
          >
            <div className="h-full flex flex-col">
              <div className="p-6 border-b border-sidebar-border">
                <div className="flex items-center gap-2.5 whitespace-nowrap">
                  <img
                    src={logoImg}
                    alt="3six9 Logo"
                    className="h-[64px] w-auto object-contain opacity-95 translate-y-[-1px] -ml-1"
                    style={{
                      filter:
                        "brightness(1.08) contrast(1.08) drop-shadow(0 0 6px rgba(255,255,255,0.08))",
                    }}
                  />
                  <span className="font-display font-semibold text-xl tracking-[0.02em] text-white/90 -translate-y-[4px]">
                    {APP_CONFIG.clientName}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-auto py-4">{sidebar}</div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar (Main Navigation) */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0 shrink-0 z-30">
        <div className="p-6 border-b border-sidebar-border">
          <Link href="/projects">
            <div className="group flex items-center gap-2.5 whitespace-nowrap cursor-pointer -m-2 p-2 rounded-lg transition-all duration-300">
              <img
                src={logoImg}
                alt="3six9 Logo"
                className="h-[64px] w-auto object-contain opacity-95 group-hover:opacity-100 transition-opacity duration-300 translate-y-[-1px] -ml-1"
                style={{
                  filter:
                    "brightness(1.08) contrast(1.08) drop-shadow(0 0 6px rgba(255,255,255,0.08))",
                }}
              />
              <span className="font-display font-semibold text-xl tracking-[0.02em] text-white/90 group-hover:text-white transition-colors duration-300 -translate-y-[4px]">
                {APP_CONFIG.clientName}
              </span>
            </div>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 custom-scrollbar">
          {sidebar ? (
            sidebar
          ) : (
            <nav className="space-y-1">
              <Link href="/projects">
                <Button
                  variant={location === "/projects" ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Projects
                </Button>
              </Link>
              <Link href="/admin">
                <Button
                  variant={location === "/admin" ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3"
                >
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
                  <AvatarImage />
                  <AvatarFallback className="rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                    {(user.displayName ?? user.email ?? "?").charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">
                    {user.displayName ?? "Vault user"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 bg-sidebar border-sidebar-border text-sidebar-foreground"
            >
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <DropdownMenuItem className="focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
                Notifications
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p>
              Prototype workspace tools are session-only demos until their
              domains are migrated. Project title, genre, and logline are
              server-persisted.
            </p>
            {legacyFixtureExport && (
              <Button
                variant="link"
                className="h-auto p-0 text-amber-200"
                onClick={downloadLegacyFixtureExport}
              >
                Download legacy prototype data
              </Button>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
