import { useState } from "react";
import { useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import logoImage from "@/assets/3six9-logo.png";
import bgImage from "@/assets/cinematic-bg-new.png";

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
    <div className="min-h-screen flex bg-background relative overflow-hidden font-sans">
      {/* Cinematic Background - Full screen, no heavy dark overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-no-repeat"
        style={{ 
          backgroundImage: `url(${bgImage})`,
          backgroundPosition: 'center right'
        }}
      >
        {/* Very subtle left-side gradient to ensure logo and title readability without killing the image */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent w-full md:w-[60%]" />
      </div>

      {/* Top Left Logo (Fixed position relative to viewport) */}
      <div className="absolute top-10 left-10 md:top-14 md:left-14 z-20">
        <img src={logoImage} alt="3six9 Studios" className="h-24 md:h-32 lg:h-40 w-auto object-contain drop-shadow-lg" />
      </div>

      {/* Main Content Layout */}
      <div className="w-full flex justify-start items-center relative z-10 pl-6 md:pl-12 lg:pl-[12%]">
        
        {/* Left Side: Login Zone */}
        <div className="w-full max-w-[440px] flex flex-col animate-in fade-in slide-in-from-left-8 duration-1000 ease-out mt-32 md:mt-16">
          
          {/* Title Section (Above form) */}
          <div className="mb-8 pl-2">
            <h1 className="text-4xl md:text-5xl font-display tracking-[0.05em] font-light text-white drop-shadow-xl">
              The Vault
            </h1>
            <p className="text-sm md:text-base text-white/70 font-light tracking-wide mt-2">
              Production management system
            </p>
          </div>

          {/* Login Form Card */}
          <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden">
            {/* Subtle top edge highlight */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            <div className="p-8 sm:p-10">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-xs font-medium text-white/60 uppercase tracking-wider">
                    Studio Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="producer@3six9studios.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50 focus:ring-primary/20 transition-all rounded-lg backdrop-blur-sm"
                  />
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium text-white/60 uppercase tracking-wider">
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
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50 focus:ring-primary/20 transition-all rounded-lg backdrop-blur-sm"
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
            <div className="px-8 py-5 bg-black/30 border-t border-white/5 flex justify-center">
              <p className="text-xs text-white/50">
                Authorized personnel only. <span className="text-white/80 hover:text-white transition-colors cursor-pointer">Support</span>
              </p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
