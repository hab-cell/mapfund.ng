import { useEffect, useState } from "react";
import { BarChart3, Heart, GraduationCap, TrendingUp, Wallet, Clock, Users, Lock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { base44 } from "@/api/base44Client";
import { StatCard, Card } from "@/components/shared";
import { formatNaira } from "@/lib/formatters";

export default function Transparency() {
  const [data, setData] = useState({
    totalRaised: 0, raisedThisMonth: 0, activeCampaigns: 0, studentsFunded: 0,
    totalDisbursed: 0, pendingDisbursement: 0, peopleDonatedToThisMonth: 0,
    monthly: [] as { month: string; raised: number; disbursed: number }[],
  });

  useEffect(() => {
    (async () => {
      const [campaigns, donations, disbursements] = await Promise.all([
        base44.entities.Campaign.list(),
        base44.entities.Donation.filter({ payment_status: "SUCCESS" }),
        base44.entities.Disbursement.list(),
      ]);
      const totalRaised = donations.reduce((s, d) => s + d.amount, 0);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthDonations = donations.filter(d => new Date(d.created_date) >= monthStart);
      const raisedThisMonth = thisMonthDonations.reduce((s, d) => s + d.amount, 0);
      const peopleDonatedToThisMonth = new Set(thisMonthDonations.map(d => d.campaign_id)).size;

      const totalDisbursed = disbursements.filter(d => d.status === "PROCESSED").reduce((s, d) => s + d.amount, 0);
      const pendingDisbursement = disbursements.filter(d => d.status !== "PROCESSED" && d.status !== "FAILED").reduce((s, d) => s + d.amount, 0);

      // Monthly breakdown (last 6 months)
      const monthly: { month: string; raised: number; disbursed: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const label = start.toLocaleDateString("en-NG", { month: "short" });
        monthly.push({
          month: label,
          raised: donations.filter(d => { const dt = new Date(d.created_date); return dt >= start && dt < end; }).reduce((s, d) => s + d.amount, 0),
          disbursed: disbursements.filter(d => { const dt = new Date(d.created_date); return dt >= start && dt < end && d.status === "PROCESSED"; }).reduce((s, d) => s + d.amount, 0),
        });
      }

      setData({
        totalRaised, raisedThisMonth,
        activeCampaigns: campaigns.filter(c => c.status === "ACTIVE").length,
        studentsFunded: new Set(campaigns.map(c => c.student_profile_id)).size,
        totalDisbursed, pendingDisbursement, peopleDonatedToThisMonth,
        monthly,
      });
    })();
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium mb-3">
          <Lock className="h-3.5 w-3.5" /> Privacy-first — no donor or recipient names shown
        </div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Transparency Report</h1>
        <p className="text-muted-foreground mt-2">Aggregate analytics only. We never expose individual donor or student identities.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total Raised" value={formatNaira(data.totalRaised)} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Raised this month" value={formatNaira(data.raisedThisMonth)} icon={<Heart className="h-5 w-5" />} accent="secondary" />
        <StatCard label="Active Campaigns" value={data.activeCampaigns} icon={<BarChart3 className="h-5 w-5" />} accent="success" />
        <StatCard label="Students Funded" value={data.studentsFunded} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Total Disbursed" value={formatNaira(data.totalDisbursed)} icon={<Wallet className="h-5 w-5" />} accent="success" />
        <StatCard label="Pending Disbursement" value={formatNaira(data.pendingDisbursement)} icon={<Clock className="h-5 w-5" />} accent="secondary" />
        <StatCard label="People Donated To" value={data.peopleDonatedToThisMonth} hint="Unique campaigns funded this month" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Fund Utilization" value={data.totalRaised > 0 ? Math.round(data.totalDisbursed / data.totalRaised * 100) + "%" : "0%"} icon={<TrendingUp className="h-5 w-5" />} accent="secondary" />
      </div>

      <Card className="mt-8 p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">Monthly breakdown</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(152 15% 88%)" />
              <XAxis dataKey="month" stroke="hsl(152 10% 40%)" />
              <YAxis stroke="hsl(152 10% 40%)" tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatNaira(v)} contentStyle={{ borderRadius: 8, border: "1px solid hsl(152 15% 88%)" }} />
              <Bar dataKey="raised" fill="hsl(152 69% 31%)" radius={[4, 4, 0, 0]} name="Raised" />
              <Bar dataKey="disbursed" fill="hsl(43 96% 56%)" radius={[4, 4, 0, 0]} name="Disbursed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">Cumulative growth</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthly.map((m, i, a) => ({
              month: m.month,
              cumulative: a.slice(0, i + 1).reduce((s, x) => s + x.raised, 0)
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(152 15% 88%)" />
              <XAxis dataKey="month" stroke="hsl(152 10% 40%)" />
              <YAxis stroke="hsl(152 10% 40%)" tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatNaira(v)} contentStyle={{ borderRadius: 8 }} />
              <Line type="monotone" dataKey="cumulative" stroke="hsl(152 69% 31%)" strokeWidth={3} dot={{ fill: "hsl(43 96% 56%)", r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
