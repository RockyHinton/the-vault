import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/Auth";
import ProjectsPage from "@/pages/Projects";
import ProjectWorkspace from "@/pages/ProjectWorkspace";
import ScriptAnalysisPage from "@/pages/ScriptAnalysis";
import AdminSettings from "@/pages/AdminSettings";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useStore } from "@/lib/store";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const testIdentityEnabled =
  import.meta.env.MODE === "test" && Boolean((window as Window & { __VAULT_TEST_IDENTITY__?: unknown }).__VAULT_TEST_IDENTITY__);

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(190 90% 45%)",
    colorForeground: "hsl(220 10% 95%)",
    colorMutedForeground: "hsl(220 10% 65%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(220 15% 13%)",
    colorInput: "hsl(220 15% 18%)",
    colorInputForeground: "hsl(220 10% 95%)",
    colorNeutral: "hsl(220 15% 25%)",
    fontFamily: "var(--font-sans)",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#171b26]/95 rounded-2xl w-[440px] max-w-full overflow-hidden border border-white/10 shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white",
    headerSubtitle: "text-white/70",
    socialButtonsBlockButtonText: "text-white",
    formFieldLabel: "text-white/70",
    footerActionLink: "text-cyan-300",
    footerActionText: "text-white/60",
    dividerText: "text-white/50",
    identityPreviewEditButton: "text-cyan-300",
    formFieldSuccessText: "text-emerald-300",
    alertText: "text-white",
    logoBox: "mb-4",
    logoImage: "h-9 w-auto",
    socialButtonsBlockButton: "bg-white/5 border-white/15 hover:bg-white/10",
    formButtonPrimary: "bg-cyan-500 hover:bg-cyan-400 text-white",
    formFieldInput: "bg-white/5 border-white/15 text-white",
    footerAction: "border-white/10",
    dividerLine: "bg-white/10",
    alert: "bg-red-500/15 border-red-400/25",
    otpCodeFieldInput: "bg-white/5 border-white/15 text-white",
    formFieldRow: "gap-2",
    main: "gap-4",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    return addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        client.clear();
        useStore.getState().resetPrototypeFixtures();
      }
      previousUserId.current = userId;
    });
  }, [addListener, client]);
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const currentUser = useCurrentUser();
  if ((!isLoaded && !testIdentityEnabled) || ((isSignedIn || testIdentityEnabled) && currentUser.isLoading)) {
    return <div className="min-h-screen bg-background" aria-label="Loading authenticated Vault" />;
  }
  if (!isSignedIn && !testIdentityEnabled) return <Redirect to="/" />;
  if (currentUser.isError || !currentUser.data) return <AuthPage accessError />;
  return <>{children}</>;
}

function SignInPage() {
  return <AuthPage clerkForm={<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />} />;
}

function SignUpPage() {
  return <AuthPage clerkForm={<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />} />;
}

function Router() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/">{() => <AuthPage />}</Route>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/projects">{() => <ProtectedRoute><ProjectsPage /></ProtectedRoute>}</Route>
            <Route path="/admin">{() => <ProtectedRoute><AdminSettings /></ProtectedRoute>}</Route>
            <Route path="/project/:id">{() => <ProtectedRoute><ProjectWorkspace /></ProtectedRoute>}</Route>
            <Route path="/project/:id/:category">{() => <ProtectedRoute><ProjectWorkspace /></ProtectedRoute>}</Route>
            <Route path="/project/:id/:category/:subcategory">{() => <ProtectedRoute><ProjectWorkspace /></ProtectedRoute>}</Route>
            <Route path="/script/:id">{() => <ProtectedRoute><ScriptAnalysisPage /></ProtectedRoute>}</Route>
            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return <WouterRouter base={basePath}><Router /></WouterRouter>;
}