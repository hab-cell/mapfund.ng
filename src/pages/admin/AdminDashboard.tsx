import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  FileText, Heart, TrendingUp, AlertTriangle, Flag, Wallet,
  GraduationCap, ArrowRight, ClipboardCheck, ArrowUpRight, ScrollText,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button, Card, StatCard, StatusBadge } from "@/components/shared";
import { formatNaira, timeAgo } from "@/lib/formatters";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const STATUS_BAR_COLORS: Record<string, string> = {
  SUBMITTED: "#3b82f6", UNDER_REVIEW: "#f59e0b", STAGE_1: "#8b5cf6",
  STAGE_2: "#6366f1", STAGE_3: "#4f46e5", STAGE_4: "#4338ca",
  APPROVED: "#16a34a", REJECTED: "#dc2626", EMERGENCY: "#ea580c",
};

export default function AdminDashboard() {
  const { data: apps = [] } = useQuery({
    queryKey: ["admin-apps"], queryFn: () => base44.entities.FundingApplication.list("-created_date"),
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ["admin-campaigns"], queryFn: () => base44.entities.Campaign.list("-created_date"),
  });
  const { data: donations = [] } = useQuery({
    queryKey: ["admin-donations"], queryFn: () => base44.entities.Donation.filter({ payment_status: "SUCCESS" }),
  });
  const { data: disbursements = [] } = useQuery({
    queryKey: ["admin-disbursements"], queryFn: () => base44.entities.Disbursement.list(),
  });

  const pendingReview = apps.filter(a => !["APPROVED", "REJECTED"].includes(a.status)).length;
  const approved = apps.filter(a => a.status === "APPROVED").length;
  const emergency = apps.filter(a => a.is_emergency && a.status !== "APPROVED" && a.status !== "REJECTED").length;
  const totalRaised = donations.reduce((s, d) => s + d.amount, 0);
  const activeCampaigns = campaigns.filter(c => c.status === "ACTIVE").length;
  const totalDisbursed = disbursements.filter(d => d.status === "PROCESSED").reduce((s, d) => s + d.amount, 0);

  const statusCounts = apps.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const chartData = Object.entries(statusCounts).map(([k, v]) => ({ status: k.replace(/_/g, " "), count: v }));

  const recentApps = apps.slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of all platform activity requiring your attention.</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total applications" value={apps.length} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Pending review" value={pendingReview} icon={<ClipboardCheck className="h-5 w-5" />} accent="secondary" hint={emergency > 0 ? `${emergency} emergency` : undefined} />
        <StatCard label="Approved" value={approved} icon={<GraduationCap className="h-5 w-5" />} accent="success" />
        <StatCard label="Active campaigns" value={activeCampaigns} icon={<Heart className="h-5 w-5" />} />
        <StatCard label="Total raised" value={formatNaira(totalRaised)} icon={<TrendingUp className="h-5 w-5" />} accent="success" />
        <StatCard label="Total disbursed" value={formatNaira(totalDisbursed)} icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Emergency" value={emergency} icon={<AlertTriangle className="h-5 w-5" />} accent={emergency > 0 ? "danger" : "secondary"} />
        <StatCard label="Open fraud flags" value="—" icon={<Flag className="h-5 w-5" />} />
      </div>

      {/* Quick actions */}
      <Card className="p-4 flex flex-wrap gap-2">
        <Link to="/admin/applications"><Button size="sm"><FileText className="h-4 w-4" /> Review applications</Button></Link>
        <Link to="/admin/campaigns"><Button size="sm" variant="secondary"><Heart className="h-4 w-4" /> Manage campaigns</Button></Link>
        <Link to="/admin/disbursements"><Button size="sm" variant="outline"><ArrowUpRight className="h-4 w-4" /> Disbursements</Button></Link>
        <Link to="/admin/audit-log"><Button size="sm" variant="ghost"><ScrollText className="h-4 w-4" /> Audit log</Button></Link>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Chart */}
        <Card className="p-5">
          <h2 className="font-heading font-semibold text-lg mb-3">Applications by status</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="status" width={110} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(152 15% 88%)", fontSize: 13 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={STATUS_BAR_COLORS[entry.status.replace(/ /g, "_")] || "#64748b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Recent applications */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold text-lg">Recent applications</h2>
            <Link to="/admin/applications" className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {recentApps.map(a => (
              <Link
                key={a.id}
                to={`/admin/applications/${a.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.purpose} • {formatNaira(a.amount_needed)}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(a.created_date)}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {a.is_emergency && <Flag className="h-3.5 w-3.5 text-destructive" />}
                  <StatusBadge status={a.status} />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
