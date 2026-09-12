import { useAuth, useClerk } from "@clerk/react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/use-current-user";
import logoImage from "@/assets/3six9-logo.png";
import bgImage from "@/assets/cinematic-bg-new.png";

interface AuthPageProps {
  clerkForm?: React.ReactNode;
  accessError?: boolean;
}

export default function AuthPage({ clerkForm, accessError = false }: AuthPageProps) {
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const currentUser = useCurrentUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isSignedIn && currentUser.data && !accessError) setLocation("/projects", { replace: true });
  }, [accessError, currentUser.data, isSignedIn, setLocation]);

  const form = accessError ? (
    <div className="rounded-2xl border border-amber-300/20 bg-black/50 p-8 text-white shadow-2xl backdrop-blur-md">
      <h2 className="font-display text-2xl">Access not yet granted</h2>
      <p className="mt-3 text-sm leading-6 text-white/70">
        Your identity was verified, but this account is not authorized for this private Vault instance.
        Contact a studio administrator to be granted local access.
      </p>
      <Button className="mt-6" variant="outline" onClick={() => signOut({ redirectUrl: "/" })}>Sign out</Button>
    </div>
  ) : clerkForm ?? (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-md">
      <p className="text-sm leading-6 text-white/70">Authorized studio personnel can sign in to access this private production workspace.</p>
      <Button asChild className="mt-6 w-full h-12"><Link href="/sign-in">Enter The Vault</Link></Button>
    </div>
  );

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background font-sans">
      <div className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url(${bgImage})` }}>
        <div className="absolute inset-0 w-full bg-gradient-to-r from-black/80 via-black/30 to-transparent md:w-[60%]" />
      </div>
      <div className="absolute left-8 top-7 z-20"><img src={logoImage} alt="3six9 Studios" className="h-auto w-[100px] object-contain opacity-90 md:w-[140px]" /></div>
      <main className="relative z-10 flex w-full items-center justify-start pl-6 md:pl-12 lg:pl-[12%]">
        <div className="mt-32 flex w-full max-w-[440px] flex-col animate-in fade-in slide-in-from-left-8 duration-1000 md:mt-16">
          <div className="mb-8 pl-2">
            <h1 className="font-display text-4xl font-light tracking-[0.05em] text-white drop-shadow-xl md:text-5xl">The Vault</h1>
            <p className="mt-2 text-sm font-light tracking-wide text-white/70 md:text-base">Production management system</p>
          </div>
          {form}
        </div>
      </main>
    </div>
  );
}