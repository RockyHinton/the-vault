import { useState } from "react";
import { useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Film, Loader2 } from "lucide-react";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [location, setLocation] = useLocation();
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <Card className="w-full max-w-md border-border bg-card/50 backdrop-blur-xl shadow-2xl relative z-10">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="flex justify-center mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary ring-1 ring-primary/20">
              <Film className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-3xl font-display font-bold tracking-tight">The Vault</CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Production management for modern film studios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="producer@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-secondary/50 border-transparent focus:border-primary/50 transition-colors"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="#" className="text-sm text-primary hover:underline font-medium">Forgot password?</a>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-secondary/50 border-transparent focus:border-primary/50 transition-colors"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base font-medium mt-4" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 text-center text-sm text-muted-foreground bg-secondary/30 py-6 border-t border-border">
          <p>Don't have an account? <span className="text-foreground font-medium cursor-pointer hover:underline">Contact Admin</span></p>
        </CardFooter>
      </Card>
    </div>
  );
}
