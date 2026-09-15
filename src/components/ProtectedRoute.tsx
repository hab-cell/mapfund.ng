import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

export function ProtectedRoute({ role }: { role?: "student" | "admin" }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function AdminProtectedRoute() {
  const { user, loading, logout } = useAuth();
  useEffect(() => {
    if (!loading && user && user.role !== "admin") void logout();
  }, [loading, user, logout]);
  if (loading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/login" replace />;
  return <Outlet />;
}
