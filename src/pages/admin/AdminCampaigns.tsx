import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Star, Pause, Play, CheckCircle2, XCircle, ExternalLink, Heart, TrendingUp, Clock, Users, DoorClosed } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, EmptyState, ProgressBar, StatusBadge } from "@/components/shared";
import { formatNaira, formatDate, timeAgo } from "@/lib/formatters";
import { logAudit, notifyStudent } from "@/lib/notifyStudent";

export default function AdminCampaigns() {
  const { data: items = [], refetch } = useQuery({
    queryKey: ["admin-campaigns-list"],
    queryFn: () => base44.entities.Campaign.list("-created_date"),
  });
  const { data: profiles } = useQuery({
    queryKey: ["admin-campaign-profiles"],
    queryFn: () => base44.entities.StudentProfile.list(),
  });
  const { data: donations } = useQuery({
    queryKey: ["admin-campaign-donations"],
    queryFn: () => base44.entities.Donation.filter({ payment_status: "SUCCESS" }),
  });
  const donationMap: Record<string, any[]> = {};
  (donations || []).forEach(d => {
    if (!donationMap[d.campaign_id]) donationMap[d.campaign_id] = [];
    donationMap[d.campaign_id].push(d);
  });
  const profileMap: Record<string, any> = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  const toggleFeature = async (c: any) => {
    await base44.entities.Campaign.update(c.id, { is_featured: !c.is_featured });
    await logAudit("CAMPAIGN_FEATURE_TOGGLED", c.id, "Campaign", { is_featured: !c.is_featured }, "Admin");
    toast.success(c.is_featured ? "Removed from featured" : "Marked as featured");
    refetch();
  };

  const setStatus = async (c: any, newStatus: string) => {
    await base44.entities.Campaign.update(c.id, { status: newStatus });
    await logAudit("CAMPAIGN_STATUS_CHANGED", c.id, "Campaign", { from: c.status, to: newStatus }, "Admin");
    // Notify the student about campaign status changes
    const p = profileMap[c.student_profile_id];
    if (p) {
      const msgs: Record<string, { title: string; message: string }> = {
        ACTIVE: { title: "Campaign reactivated 🎉", message: "Your campaign is live again and accepting donations." },
        SUSPENDED: { title: "Campaign paused", message: "Your campaign was temporarily paused by the admin. It is no longer accepting donations." },
        COMPLETED: { title: "Campaign concluded 🎉", message: "Congratulations! Your campaign has been concluded. Disbursement will be processed soon." },
        CANCELLED: { title: "Campaign cancelled", message: "Your campaign has been cancelled by the admin. Contact support for more information." },
      };
      const m = msgs[newStatus];
      if (m) {
        await notifyStudent({ user_id: p.id, email: p.school_email, type: "CAMPAIGN_UPDATE", title: m.title, message: m.message, link: `/campaigns/${c.id}` });
      }
    }
    toast.success(`Campaign ${newStatus.toLowerCase()}`);
    refetch();
  };

  const cancel = async (c: any) => {
    if (!confirm("Cancel this campaign? The student will be notified and fundraising will stop immediately.")) return;
    await setStatus(c, "CANCELLED");
  };

  const totalSummary = items.reduce((acc, c) => ({
    raised: acc.raised + (c.raised_amount || 0),
    active: acc.active + (c.status === "ACTIVE" ? 1 : 0),
    completed: acc.completed + (c.status === "COMPLETED" ? 1 : 0),
    donors: acc.donors + (c.donor_count || 0),
  }), { raised: 0, active: 0, completed: 0, donors: 0 });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-bold">Campaigns</h1>
        <p className="text-muted-foreground mt-1">Publish, track, pause, conclude or cancel live student campaigns.</p>
      </div>

      {/* Summary bar */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><TrendingUp className="h-5 w-5" /></div>
          <div><div className="text-xs text-muted-foreground">Total raised</div><div className="font-heading font-bold">{formatNaira(totalSummary.raised)}</div></div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg bg-success/10 p-2 text-success"><Heart className="h-5 w-5" /></div>
          <div><div className="text-xs text-muted-foreground">Active</div><div className="font-heading font-bold text-success">{totalSummary.active}</div></div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg bg-secondary/20 p-2 text-primary-dark"><CheckCircle2 className="h-5 w-5" /></div>
          <div><div className="text-xs text-muted-foreground">Completed</div><div className="font-heading font-bold">{totalSummary.completed}</div></div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Users className="h-5 w-5" /></div>
          <div><div className="text-xs text-muted-foreground">Total donors</div><div className="font-heading font-bold">{totalSummary.donors}</div></div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-10 w-10" />}
          title="No campaigns yet"
          description="Verify a student, advance their application to APPROVED, then click Publish to push their campaign live."
          action={<Link to="/admin/applications"><Button>Review applications</Button></Link>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map(c => {
            const p = profileMap[c.student_profile_id];
            const campaignDonations = (donationMap[c.id] || []).sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
            const latestDonation = campaignDonations[0];
            const pct = c.goal_amount > 0 ? Math.min(100, (c.raised_amount || 0) / c.goal_amount * 100) : 0;
            const isActive = c.status === "ACTIVE";
            const isLive = isActive && pct < 100;

            return (
              <Card key={c.id} className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold line-clamp-1">{c.title}</h3>
                    {p && <div className="text-xs text-muted-foreground">{p.full_name} • {c.department}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={c.status} />
                    {c.is_featured && (
                      <span className="text-[10px] text-secondary font-semibold inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-secondary" /> Featured
                      </span>
                    )}
                  </div>
                </div>

                {/* Live indicator */}
                {isLive && (
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-success/15 text-success px-2 py-0.5 text-xs">
                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-success" /></span>
                    LIVE • Accepting donations
                  </div>
                )}

                {/* Progress */}
                <ProgressBar value={c.raised_amount || 0} goal={c.goal_amount} />
                <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.donor_count || 0} donors</span>
                  <span>{formatNaira(c.raised_amount || 0)} raised</span>
                  <span><Clock className="inline h-3.5 w-3.5 mr-0.5" /> {formatDate(c.deadline)}</span>
                </div>

                {/* Latest donation preview */}
                {latestDonation && (
                  <div className="mt-3 rounded-lg bg-muted/40 p-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Latest donation:</span>
                      <span className="font-semibold text-primary">{formatNaira(latestDonation.amount)}</span>
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {latestDonation.is_anonymous ? "Anonymous" : latestDonation.donor_name} • {timeAgo(latestDonation.created_date)}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/campaigns/${c.id}`} target="_blank">
                    <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /> View</Button>
                  </Link>
                  <Button size="sm" variant={c.is_featured ? "secondary" : "outline"} onClick={() => toggleFeature(c)}>
                    <Star className="h-3.5 w-3.5" /> {c.is_featured ? "Featured" : "Feature"}
                  </Button>
                  {c.status === "PENDING" && (
                    <Button size="sm" onClick={() => setStatus(c, "ACTIVE")}><Play className="h-3.5 w-3.5" /> Publish live</Button>
                  )}
                  {isActive && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(c, "SUSPENDED")}><Pause className="h-3.5 w-3.5" /> Pause</Button>
                  )}
                  {c.status === "SUSPENDED" && (
                    <Button size="sm" onClick={() => setStatus(c, "ACTIVE")}><Play className="h-3.5 w-3.5" /> Reactivate</Button>
                  )}
                  {(isActive || c.status === "PENDING") && (
                    <Button size="sm" variant="secondary" onClick={() => setStatus(c, "COMPLETED")}><DoorClosed className="h-3.5 w-3.5" /> Conclude</Button>
                  )}
                  {(c.status !== "COMPLETED" && c.status !== "CANCELLED") && (
                    <Button size="sm" variant="danger" onClick={() => cancel(c)}><XCircle className="h-3.5 w-3.5" /> Cancel</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
