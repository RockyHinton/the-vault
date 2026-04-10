import { useState } from "react";
import { useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import logoImage from "@/assets/3six9-logo.png";
import bgImage from "@/assets/cinematic-bg.jpg";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const login = useStore((state) => state.login);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      login(email);
      setIsLoading(false);
      setLocation("/projects");
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden font-sans">
      {/* Cinematic Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        {/* Dark overlays for readability and mood */}
        <div className="absolute inset-0 bg-background/80 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
        
        {/* Subtle Film Grain (using CSS radial gradients for noise-like texture) */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" 
             style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
      </div>

      <div className="w-full max-w-6xl mx-auto px-6 lg:px-12 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-24 relative z-10">
        
        {/* Zone 1: Brand / Identity */}
        <div className="flex-1 flex flex-col items-start text-left max-w-xl">
          <div className="mb-8 opacity-80">
            <img src={logoImage} alt="3six9 Studios" className="h-10 w-auto object-contain drop-shadow-lg" />
          </div>
          <h1 className="text-5xl lg:text-7xl font-display font-bold tracking-tight text-white mb-6 drop-shadow-xl">
            The Vault
          </h1>
          <p className="text-xl lg:text-2xl text-muted-foreground/90 font-light tracking-wide max-w-md leading-relaxed">
            Production management for modern film studios.
          </p>
        </div>

        {/* Zone 2: Login Form */}
        <div className="w-full max-w-[440px] animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
          <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden">
            {/* Subtle top edge highlight */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            <div className="p-8 sm:p-10">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-white tracking-tight">Access Portal</h2>
                <p className="text-sm text-muted-foreground mt-2">Sign in to your production workspace.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Studio Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="producer@3six9studios.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50 focus:ring-primary/20 transition-all rounded-lg"
                  />
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Password
                    </Label>
                    <a href="#" className="text-xs text-primary/80 hover:text-primary transition-colors font-medium">
                      Forgot?
                    </a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50 focus:ring-primary/20 transition-all rounded-lg"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-medium mt-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all rounded-lg" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    "Enter The Vault"
                  )}
                </Button>
              </form>
            </div>
            
            {/* Footer */}
            <div className="px-8 py-5 bg-black/20 border-t border-white/5 flex justify-center">
              <p className="text-xs text-muted-foreground">
                Authorized personnel only. <span className="text-white/60 hover:text-white transition-colors cursor-pointer">Support</span>
              </p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
