import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/shared";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success("Welcome!");
      if (u?.role === "admin") nav("/admin/dashboard", { replace: true });
      else nav("/student/dashboard", { replace: true });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/10 p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="font-heading text-2xl font-bold">MapFund</div>
        </Link>
        <Card className="p-6">
          <h1 className="font-heading text-2xl font-bold text-center">Welcome</h1>
          <p className="text-sm text-muted-foreground text-center mt-1">Sign in to MapFund</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" className="w-full" disabled={loading}>
              <LogIn className="h-4 w-4" /> {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Need funding?{" "}
            <Link to="/register" className="text-primary font-medium hover:underline">
              Apply for funding
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
