import { ReactNode, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { GraduationCap, Menu, X, Heart, Users, BarChart3, MessageSquare, Home as HomeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

function PublicNav() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  const links = [
    { to: "/", label: "Home", icon: HomeIcon },
    { to: "/campaigns", label: "Campaigns", icon: Heart },
    { to: "/community", label: "Community", icon: MessageSquare },
    { to: "/transparency", label: "Transparency", icon: BarChart3 },
    { to: "/donor", label: "Donor Portal", icon: Users },
  ];

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="font-heading text-lg font-bold leading-none">MapFund</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">MAPOLY</div>
          </div>
        </Link>

        <div className="hidden lg:flex items-center gap-1">
          {links.map(l => (
            <NavLink
              key={l.to} to={l.to} end={l.to === "/"}
              className={({ isActive }) => cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-2">
          {user ? (
            <>
              <Link
                to={user.role === "admin" ? "/admin/dashboard" : "/student/dashboard"}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                {user.full_name}
              </Link>
              <button onClick={logout} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">Sign in</Link>
              <Link to="/register" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Apply for Funding
              </Link>
            </>
          )}
        </div>

        <button onClick={() => setOpen(!open)} className="lg:hidden rounded-lg p-2 hover:bg-muted">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border bg-card px-4 py-3 space-y-1">
          {links.map(l => (
            <NavLink
              key={l.to} to={l.to} end={l.to === "/"} onClick={() => setOpen(false)}
              className={({ isActive }) => cn(
                "block rounded-lg px-3 py-2 text-sm font-medium",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {l.label}
            </NavLink>
          ))}
          <div className="pt-2 border-t border-border flex gap-2">
            {user ? (
              <button onClick={logout} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm">Sign out</button>
            ) : (
              <>
                <Link to="/login" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-center">Sign in</Link>
                <Link to="/register" onClick={() => setOpen(false)} className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm text-center text-primary-foreground">Apply</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-primary-dark text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
              <div className="rounded-lg bg-secondary p-2 text-primary-dark"><GraduationCap className="h-5 w-5" /></div>
              <div className="font-heading text-lg font-bold">MapFund</div>
            </div>
            <p className="text-sm text-white/70">Secure, transparent campus funding for MAPOLY students.</p>
        </div>
        <div>
          <div className="font-semibold mb-2 text-secondary">Platform</div>
          <ul className="space-y-1.5 text-sm text-white/80">
            <li><Link to="/campaigns" className="hover:text-secondary">Browse Campaigns</Link></li>
            <li><Link to="/register" className="hover:text-secondary">Apply for Funding</Link></li>
            <li><Link to="/donor" className="hover:text-secondary">Donor Dashboard</Link></li>
            <li><Link to="/community" className="hover:text-secondary">Community</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-2 text-secondary">Trust</div>
          <ul className="space-y-1.5 text-sm text-white/80">
            <li><Link to="/transparency" className="hover:text-secondary">Transparency Report</Link></li>
            <li>Verified against institutional records</li>
            <li>Multi-stage review</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-2 text-secondary">Contact</div>
          <p className="text-sm text-white/80">hello@mapfund.ng<br/>+234 800 MAPFUND</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">
        © {new Date().getFullYear()} MapFund — Moshood Abiola Polytechnic. Every naira, transparently accounted for.
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav />
      <main className="flex-1">{children || <Outlet />}</main>
      <PublicFooter />
    </div>
  );
}
