import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Flag, ArrowRight, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button, Card, EmptyState, Input, Select, StatusBadge } from "@/components/shared";
import { formatDate, formatNaira } from "@/lib/formatters";

const PAGE_SIZE = 10;
const STATUSES = ["ALL", "SUBMITTED", "UNDER_REVIEW", "STAGE_1", "STAGE_2", "STAGE_3", "STAGE_4", "APPROVED", "REJECTED", "EMERGENCY"];

export default function AdminApplications() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [st, setSt] = useState("ALL");
  const [emergencyOnly, setEmergencyOnly] = useState(false);

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["admin-applications-list"],
    queryFn: () => base44.entities.FundingApplication.list("-created_date"),
  });
  const { data: profiles } = useQuery({
    queryKey: ["admin-student-profiles"],
    queryFn: () => base44.entities.StudentProfile.list(),
  });
  const profileMap = useMemo(() => {
    const m: Record<string, any> = {};
    (profiles || []).forEach(p => { m[p.id] = p; });
    return m;
  }, [profiles]);

  const filtered = useMemo(() => apps.filter(a => {
    const p = profileMap[a.student_profile_id];
    const matchQ = !q || p?.full_name?.toLowerCase().includes(q.toLowerCase()) || p?.matric_number?.toLowerCase().includes(q.toLowerCase());
    const matchSt = st === "ALL" || a.status === st;
    const matchEm = !emergencyOnly || a.is_emergency;
    return matchQ && matchSt && matchEm;
  }), [apps, profileMap, q, st, emergencyOnly]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold">Applications</h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} application{filtered.length !== 1 ? "s" : ""} found
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or matric number…"
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={st} onChange={e => { setSt(e.target.value); setPage(1); }}>
            {STATUSES.map(s => (
              <option key={s} value={s}>{s === "ALL" ? "All statuses" : s.replace(/_/g, " ")}</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none whitespace-nowrap">
            <input type="checkbox" checked={emergencyOnly} onChange={e => { setEmergencyOnly(e.target.checked); setPage(1); }} className="rounded" />
            <Flag className="h-3.5 w-3.5 text-destructive" /> Emergency only
          </label>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="No applications match your filters"
            description="Try clearing filters or check back when new applications arrive."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Student</th>
                    <th className="px-4 py-3 text-left">Purpose</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Deadline</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Submitted</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(a => {
                    const p = profileMap[a.student_profile_id];
                    return (
                      <tr key={a.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{p?.full_name || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{p?.matric_number}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-xs">{a.purpose}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatNaira(a.amount_needed)}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs">{formatDate(a.deadline)}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs">{formatDate(a.created_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {a.is_emergency && <Flag className="h-3.5 w-3.5 text-destructive" />}
                            <StatusBadge status={a.status} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/admin/applications/${a.id}`}
                            className="text-primary text-xs font-medium inline-flex items-center gap-1 hover:underline"
                          >
                            Review <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <div className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
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
