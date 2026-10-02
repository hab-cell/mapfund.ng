import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Search, Filter } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card, EmptyState, Input, Select, Button } from "@/components/shared";
import { formatDateTime } from "@/lib/formatters";

const PAGE_SIZE = 15;
const ACTIONS = [
  "ALL", "IDENTITY_VERIFIED", "IDENTITY_VERIFICATION_FAILED", "APPLICATION_ADVANCED",
  "APPLICATION_REJECTED", "APPLICATION_CANCELLED", "ADMIN_NOTE_ADDED", "MORE_DOCS_REQUESTED",
  "BANK_ACCOUNT_CREATED", "BANK_ACCOUNT_TOGGLED", "BANK_ACCOUNT_DELETED",
  "CAMPAIGN_FEATURE_TOGGLED", "CAMPAIGN_STATUS_CHANGED", "DISBURSEMENT_CREATED",
  "DISBURSEMENT_APPROVED", "DISBURSEMENT_FAILED",
];

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => base44.entities.AuditLog.list("-created_date"),
  });

  const filtered = useMemo(() => items.filter(a => {
    const matchQ = !q || a.actor_name?.toLowerCase().includes(q.toLowerCase()) || a.action?.toLowerCase().includes(q.toLowerCase());
    const matchAction = actionFilter === "ALL" || a.action === actionFilter;
    return matchQ && matchAction;
  }), [items, q, actionFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground mt-1">
          Every admin action is recorded here — immutable and traceable. {filtered.length} entries.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by actor or action…"
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}>
            {ACTIONS.map(a => (
              <option key={a} value={a}>{a === "ALL" ? "All actions" : a.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-10 w-10" />} title="No matching entries" description="Try adjusting your filters." />
        ) : (
          <>
            <div className="divide-y divide-border">
              {paged.map((a: any) => (
                <div key={a.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0 mt-0.5">
                    <ScrollText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono text-sm font-semibold text-primary">{a.action?.replace(/_/g, " ")}</span>
                      <span className="text-xs text-muted-foreground">by {a.actor_name || "System"}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                      {a.target_type && <span><Filter className="inline h-3 w-3 mr-0.5" />{a.target_type} {a.target_id?.slice(0, 12)}</span>}
                      <span>{formatDateTime(a.created_date)}</span>
                    </div>
                    {a.metadata && a.metadata !== "{}" && a.metadata !== '""' && (
                      <pre className="mt-1.5 rounded-md bg-muted/60 p-2 text-[10px] leading-relaxed overflow-x-auto max-h-24">{a.metadata}</pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
