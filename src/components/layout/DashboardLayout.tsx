import { useState, useEffect, ReactNode } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import {
  LayoutDashboard, FileText, Heart, Flag, Banknote, ArrowUpRight, ScrollText,
  Bell, LogOut, ChevronLeft, Menu, GraduationCap, Shield, Globe, Database, Mail, ShieldCheck, Landmark
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { timeAgo } from "@/lib/formatters";

type Role = "student" | "admin";

const NAV: Record<Role, { to: string; label: string; icon: any }[]> = {
  student: [
    { to: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ],
  admin: [
    { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/applications", label: "Applications", icon: FileText },
    { to: "/admin/campaigns", label: "Campaigns", icon: Heart },
    { to: "/admin/fraud-flags", label: "Fraud Flags", icon: Flag },
    { to: "/admin/bank-accounts", label: "Bank Accounts", icon: Banknote },
    { to: "/admin/disbursements", label: "Disbursements", icon: ArrowUpRight },
    { to: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
    { to: "/admin/supabase-check", label: "Supabase Check", icon: Database },
    { to: "/admin/email-logs", label: "Email Logs", icon: Mail },
    { to: "/admin/payments", label: "Payments", icon: ShieldCheck },
    { to: "/admin/payment-settings", label: "Payment Settings", icon: Landmark },
  ],
};

function useNotifications(userId?: string) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    if (!userId) return;
    const load = () => base44.entities.AppNotification.filter({ user_id: userId }, "-created_date", 20).then(setItems);
    load();
    const unsub = base44.entities.AppNotification.subscribe(load);
    return () => { unsub(); };
  }, [userId]);
  const unread = items.filter(i => !i.is_read).length;
  const markAllRead = async () => {
    await Promise.all(items.filter(i => !i.is_read).map(i => base44.entities.AppNotification.update(i.id, { is_read: true })));
  };
  return { items, unread, markAllRead };
}

function Sidebar({ role, collapsed, setCollapsed, onNavigate }: {
  role: Role; collapsed: boolean; setCollapsed: (b: boolean) => void; onNavigate?: () => void;
}) {
  const nav = NAV[role];
  return (
    <aside className={cn(
      "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-200",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10">
        <div className="rounded-lg bg-secondary p-1.5 text-primary-dark shrink-0">
          {role === "admin" ? <Shield className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
        </div>
        {!collapsed && (
          <div>
            <div className="font-heading text-base font-bold">MapFund</div>
            <div className="text-[10px] uppercase tracking-widest text-secondary">{role} portal</div>
          </div>
        )}
      </div>
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {nav.map(item => (
          <NavLink
            key={item.to} to={item.to} onClick={onNavigate}
            className={({ isActive }) => cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-primary-dark"
                : "text-white/80 hover:bg-white/10 hover:text-white",
              collapsed && "justify-center"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
        <div className="pt-2 mt-2 border-t border-white/10">
          <Link
            to="/"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-white/60 hover:text-white hover:bg-white/10",
              collapsed && "justify-center"
            )}
          >
            <Globe className="h-4 w-4 shrink-0" />
            {!collapsed && "Public Site"}
          </Link>
        </div>
      </nav>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center gap-2 border-t border-white/10 py-3 text-xs text-white/60 hover:text-white"
      >
        <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}

function Topbar({ role, onMenuClick }: { role: Role; onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { items, unread, markAllRead } = useNotifications(user?.id);
  const [bellOpen, setBellOpen] = useState(false);

  const roleColors: Record<Role, string> = {
    admin: "bg-primary-dark text-white",
    student: "bg-primary/10 text-primary",
  };

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <button onClick={onMenuClick} className="lg:hidden rounded-lg p-1.5 hover:bg-muted">
          <Menu className="h-5 w-5" />
        </button>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold uppercase", roleColors[role])}>
          {role}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => { setBellOpen(!bellOpen); if (!bellOpen) markAllRead(); }}
            className="relative rounded-lg p-2 hover:bg-muted"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-border font-semibold text-sm">Notifications</div>
              <div className="max-h-96 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
                ) : items.map(n => (
                  <div key={n.id} className="px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/50">
                    <div className="text-sm font-medium">{n.title || n.type.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_date)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="hidden sm:block text-right">
          <div className="text-sm font-medium">{user?.full_name}</div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
        </div>
        <button
          onClick={async () => { await logout(); nav("/"); }}
          className="rounded-lg border border-border p-2 hover:bg-muted"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

export default function DashboardLayout({ role, children }: { role: Role; children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block h-full">
        <Sidebar role={role} collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="bg-black/50 flex-1" onClick={() => setMobileOpen(false)} />
          <div className="h-full">
            <Sidebar role={role} collapsed={false} setCollapsed={() => {}} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar role={role} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
