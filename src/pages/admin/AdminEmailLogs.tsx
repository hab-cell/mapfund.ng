import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, CheckCircle2, XCircle, Search, RefreshCw, Inbox } from "lucide-react";
import { Card, Input, Select, EmptyState, Button, StatusBadge } from "@/components/shared";
import { base44 } from "@/api/base44Client";
import { formatDateTime } from "@/lib/formatters";
import { TEMPLATE_NAMES } from "@/lib/email";

const PAGE_SIZE = 15;

export default function AdminEmailLogs() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["email-logs"],
    queryFn: () => base44.entities.EmailLog.list("-created_date", 500),
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    return logs.filter((l: any) => {
      const matchesStatus = status === "ALL" || l.status === status;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        l.recipient_email?.toLowerCase().includes(q) ||
        l.template_name?.toLowerCase().includes(q) ||
        String(l.template_id ?? "").includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [logs, search, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const sent = logs.filter((l: any) => l.status === "SENT").length;
  const failed = logs.filter((l: any) => l.status === "FAILED").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold">Email Management</h1>
          <p className="text-muted-foreground mt-1">
            Transactional emails sent through the Supabase <code className="text-xs">send-email</code> Edge Function (Brevo).
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Inbox className="h-5 w-5" /></div>
          <div><div className="text-xs text-muted-foreground">Total emails</div><div className="font-heading font-bold text-xl">{logs.length}</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-success/10 p-2 text-success"><CheckCircle2 className="h-5 w-5" /></div>
          <div><div className="text-xs text-muted-foreground">Delivered</div><div className="font-heading font-bold text-xl text-success">{sent}</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-destructive/10 p-2 text-destructive"><XCircle className="h-5 w-5" /></div>
          <div><div className="text-xs text-muted-foreground">Failed</div><div className="font-heading font-bold text-xl text-destructive">{failed}</div></div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search recipient, template…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="ALL">All statuses</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </Select>
      </Card>

      {/* Log table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading email logs…</div>
        ) : pageItems.length === 0 ? (
          <EmptyState
            icon={<Mail className="h-10 w-10" />}
            title="No emails logged yet"
            description="Welcome, verification, application, and donation emails will appear here as they're sent."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Date/Time</th>
                    <th className="text-left px-4 py-3">Recipient</th>
                    <th className="text-left px-4 py-3">Template</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((log: any) => (
                    <tr key={log.id} className="border-t border-border hover:bg-muted/40">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(log.sent_at || log.created_date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{log.recipient_email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                          #{log.template_id} {log.template_name ?? TEMPLATE_NAMES[log.template_id] ?? ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status === "SENT" ? "SUCCESS" : "FAILED"} />
                        {log.status !== "SENT" && <StatusBadge status="PENDING" className="ml-1 opacity-0" />}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        {log.status === "SENT" && log.brevo_message_id ? (
                          <span className="text-xs text-muted-foreground font-mono">
                            ID: {String(log.brevo_message_id).slice(0, 20)}…
                          </span>
                        ) : log.error_message ? (
                          <span className="text-xs text-destructive">{log.error_message}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
