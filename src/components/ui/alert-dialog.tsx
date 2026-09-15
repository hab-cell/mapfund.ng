import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/shared";

type AlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  actionLabel?: string;
  actionVariant?: "primary" | "danger" | "secondary" | "outline";
  onAction?: () => void;
  cancelLabel?: string;
};

export function AlertDialog({
  open, onOpenChange, title, description, children,
  actionLabel, actionVariant = "danger", onAction, cancelLabel = "Cancel",
}: AlertDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div ref={overlayRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-6 animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h2 className="font-heading text-lg font-bold">{title}</h2>
          <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          {actionLabel && onAction && (
            <Button variant={actionVariant} size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
