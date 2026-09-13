import { QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { ApiClientError } from "./lib/api-client";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/Auth";
import ProjectsPage from "@/pages/Projects";
import ProjectWorkspace from "@/pages/ProjectWorkspace";
import ScriptReaderPage from "@/pages/ScriptReader";
import AdminSettings from "@/pages/AdminSettings";
import { useCurrentUser, useIsStudioAdmin } from "@/features/auth/use-current-user";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Session-gated route. The server answers /auth/me from the session cookie:
 * a user means signed in, 401 means sign in is required, 403 means the
 * account is refused (suspended) and is told so.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const currentUser = useCurrentUser();
  if (currentUser.isLoading) {
    return <div className="min-h-screen bg-background" aria-label="Loading authenticated Vault" />;
  }
  if (currentUser.data) return <>{children}</>;
  const status = currentUser.error instanceof ApiClientError ? currentUser.error.status : undefined;
  if (status === 403) return <AuthPage accessError />;
  return <Redirect to="/" />;
}

/** UX gating only: the server refuses admin APIs to ordinary users regardless. */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const isStudioAdmin = useIsStudioAdmin();
  return <ProtectedRoute>{isStudioAdmin ? children : <Redirect to="/projects" />}</ProtectedRoute>;
}

function Router() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Switch>
          <Route path="/">{() => <AuthPage />}</Route>
          <Route path="/sign-in">{() => <AuthPage />}</Route>
          <Route path="/projects">{() => <ProtectedRoute><ProjectsPage /></ProtectedRoute>}</Route>
          <Route path="/admin">{() => <AdminRoute><AdminSettings /></AdminRoute>}</Route>
          <Route path="/project/:id">{() => <ProtectedRoute><ProjectWorkspace /></ProtectedRoute>}</Route>
          <Route path="/project/:id/:category">{() => <ProtectedRoute><ProjectWorkspace /></ProtectedRoute>}</Route>
          <Route path="/project/:id/:category/:subcategory">{() => <ProtectedRoute><ProjectWorkspace /></ProtectedRoute>}</Route>
          <Route path="/script-reader/:projectId/:scriptId/:documentId">{() => <ProtectedRoute><ScriptReaderPage /></ProtectedRoute>}</Route>
          <Route component={NotFound} />
        </Switch>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  return <WouterRouter base={basePath}><Router /></WouterRouter>;
}
