import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useLogin, useLogout } from "@/features/auth/use-auth-session";
import { ApiClientError } from "@/lib/api-client";
import logoImage from "@/assets/3six9-logo.png";
import bgImage from "@/assets/cinematic-bg-new.png";

interface AuthPageProps {
  /** Rendered by a protected route when the session exists but access is refused. */
  accessError?: boolean;
}

function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      onSignedIn();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign in failed.");
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-black/40 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-md space-y-5">
      <p className="text-sm leading-6 text-white/70">Authorized studio personnel can sign in to access this private production workspace.</p>
      <div className="space-y-2">
        <Label htmlFor="login-email" className="text-white/80">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-white/5 border-white/15 text-white"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password" className="text-white/80">Password</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-white/5 border-white/15 text-white"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">{error}</p>
      )}
      <Button type="submit" className="w-full h-12" disabled={login.isPending || !email || !password}>
        Sign in
      </Button>
    </form>
  );
}

function AccessRefused({ code }: { code: string | undefined }) {
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const suspended = code === "ACCOUNT_SUSPENDED";
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-black/50 p-8 text-white shadow-2xl backdrop-blur-md">
      <h2 className="font-display text-2xl">{suspended ? "Account suspended" : "Access refused"}</h2>
      <p className="mt-3 text-sm leading-6 text-white/70">
        {suspended
          ? "This Vault account has been suspended. Contact a studio administrator."
          : "This session is no longer allowed to use the Vault. Sign in again or contact a studio administrator."}
      </p>
      <Button
        className="mt-6"
        variant="outline"
        onClick={() => logout.mutate(undefined, { onSettled: () => setLocation("/", { replace: true }) })}
      >
        Sign out
      </Button>
    </div>
  );
}

export default function AuthPage({ accessError = false }: AuthPageProps) {
  const currentUser = useCurrentUser();
  const [, setLocation] = useLocation();
  const refusal =
    currentUser.error instanceof ApiClientError && currentUser.error.status === 403
      ? currentUser.error
      : undefined;
  const signedIn = Boolean(currentUser.data);

  useEffect(() => {
    if (signedIn && !accessError) setLocation("/projects", { replace: true });
  }, [accessError, signedIn, setLocation]);

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
          {accessError || refusal ? (
            <AccessRefused code={refusal?.code} />
          ) : currentUser.isLoading ? null : (
            <LoginForm onSignedIn={() => setLocation("/projects", { replace: true })} />
          )}
        </div>
      </main>
    </div>
  );
}
