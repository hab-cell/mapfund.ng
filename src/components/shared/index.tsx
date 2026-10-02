import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatNaira } from "@/lib/formatters";

// ─── StatCard ────────────────────────────────────────────
export function StatCard({
  label, value, icon, hint, accent = "primary",
}: {
  label: string; value: string | number; icon?: ReactNode; hint?: string;
  accent?: "primary" | "secondary" | "success" | "danger";
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/20 text-secondary-foreground",
    success: "bg-success/10 text-success",
    danger: "bg-destructive/10 text-destructive",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
          <div className="mt-2 text-2xl font-heading font-bold text-foreground truncate">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && (
          <div className={cn("shrink-0 rounded-lg p-2.5", accentClasses[accent])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-success/15 text-success border-success/30",
  APPROVED: "bg-success/15 text-success border-success/30",
  ACTIVE: "bg-success/15 text-success border-success/30",
  COMPLETED: "bg-primary/15 text-primary border-primary/30",
  PROCESSED: "bg-success/15 text-success border-success/30",
  PENDING: "bg-warning/15 text-warning border-warning/30",
  UNDER_REVIEW: "bg-warning/15 text-warning border-warning/30",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200",
  STAGE_1: "bg-blue-100 text-blue-700 border-blue-200",
  STAGE_2: "bg-blue-100 text-blue-700 border-blue-200",
  STAGE_3: "bg-blue-100 text-blue-700 border-blue-200",
  STAGE_4: "bg-blue-100 text-blue-700 border-blue-200",
  EMERGENCY: "bg-destructive/15 text-destructive border-destructive/30",
  FAILED: "bg-destructive/15 text-destructive border-destructive/30",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
  SUSPENDED: "bg-warning/15 text-warning border-warning/30",
  CANCELLED: "bg-destructive/15 text-destructive border-destructive/30",
  GRADUATED: "bg-success/15 text-success border-success/30",
  ACTIVE_STUDENT: "bg-success/15 text-success border-success/30",
};
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] || "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
      style, className
    )}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── ProgressBar ─────────────────────────────────────────
export function ProgressBar({ value, goal, showLabel = true }: { value: number; goal: number; showLabel?: boolean }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="progress-fill h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{formatNaira(value)}</span>
          <span>of {formatNaira(goal)} • {pct.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}

// ─── EmptyState ──────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
      {icon && <div className="mb-3 text-muted-foreground opacity-60">{icon}</div>}
      <h3 className="font-heading text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── LoadingSkeleton ─────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-40 w-full mb-4" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────
export function Button({
  children, variant = "primary", size = "md", className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-sm",
    outline: "border border-border bg-card hover:bg-muted",
    ghost: "hover:bg-muted",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40",
        variants[variant], sizes[size], className
      )}
    >
      {children}
    </button>
  );
}

// ─── Input / Select / Textarea ───────────────────────────
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
        props.className
      )}
    />
  );
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary min-h-[100px]",
        props.className
      )}
    />
  );
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
        props.className
      )}
    />
  );
}

// ─── Card ────────────────────────────────────────────────
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-border bg-card shadow-sm", className)}>{children}</div>;
}
