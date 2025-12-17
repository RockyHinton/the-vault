import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/Auth";
import ProjectsPage from "@/pages/Projects";
import ProjectWorkspace from "@/pages/ProjectWorkspace";
import { useStore } from "@/lib/store";
import { useEffect } from "react";

function Router() {
  const { user } = useStore();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!user && location !== "/") {
      setLocation("/");
    }
  }, [user, location, setLocation]);

  return (
    <Switch>
      <Route path="/" component={AuthPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/project/:id" component={ProjectWorkspace} />
      <Route path="/project/:id/:category" component={ProjectWorkspace} />
      <Route path="/project/:id/:category/:subcategory" component={ProjectWorkspace} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
