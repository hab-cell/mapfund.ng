import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { GraduationCap, Heart, Share2, Users, Clock, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, ProgressBar, Skeleton } from "@/components/shared";
import { formatNaira, timeAgo, daysLeft } from "@/lib/formatters";

export default function CampaignDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [donors, setDonors] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const c = await base44.entities.Campaign.get(id);
      setCampaign(c);
      if (c) {
        const d = await base44.entities.Donation.filter({ campaign_id: c.id, payment_status: "SUCCESS" }, "-created_date", 30);
        setDonors(d);
        const p = await base44.entities.StudentProfile.get(c.student_profile_id);
        setProfile(p);
      }
      setLoading(false);
    })();
  }, [id]);

  const share = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Campaign link copied to clipboard!");
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-64 w-full mb-4" />
        <Skeleton className="h-8 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (!campaign) return <div className="p-10 text-center">Campaign not found. <Link to="/campaigns" className="text-primary underline">Back</Link></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/campaigns" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to campaigns
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <Card className="overflow-hidden">
            <div className="h-64 bg-gradient-to-br from-primary/20 to-secondary/30 flex items-center justify-center">
              <GraduationCap className="h-24 w-24 text-primary/60" />
            </div>
            <div className="p-6">
              <div className="flex gap-2 mb-3 flex-wrap">
                <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">{campaign.category}</span>
                <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs">{campaign.department}</span>
                {profile?.is_verified && (
                  <span className="rounded-full bg-success/15 text-success px-2.5 py-0.5 text-xs font-medium inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Verified Student
                  </span>
                )}
              </div>
              <h1 className="font-heading text-3xl font-bold mb-3">{campaign.title}</h1>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{campaign.description}</p>

              {profile && (
                <div className="mt-6 rounded-lg border border-border p-4 bg-muted/30">
                  <div className="text-xs uppercase text-muted-foreground font-semibold mb-2">About the student</div>
                  <div className="font-heading font-semibold">{profile.full_name}</div>
                  <div className="text-sm text-muted-foreground">{profile.department} • Level {profile.level} • {profile.faculty}</div>
                </div>
              )}
            </div>
          </Card>

          {/* Donor wall */}
          <Card className="mt-5 p-6">
            <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Recent supporters
            </h2>
            {donors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Be the first to donate!</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {donors.map(d => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                    <div>
                      <div className="font-medium text-sm">{d.is_anonymous ? "Anonymous supporter" : d.donor_name}</div>
                      {d.message && <div className="text-xs text-muted-foreground italic mt-0.5">"{d.message}"</div>}
                      <div className="text-xs text-muted-foreground">{timeAgo(d.created_date)}</div>
                    </div>
                    <div className="font-heading font-bold text-primary">{formatNaira(d.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sticky sidebar */}
        <div>
          <Card className="p-6 sticky top-20">
            <ProgressBar value={campaign.raised_amount || 0} goal={campaign.goal_amount} />
            <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-border">
              <div>
                <div className="text-xs text-muted-foreground uppercase">Donors</div>
                <div className="font-heading text-xl font-bold flex items-center gap-1"><Users className="h-4 w-4 text-primary" />{campaign.donor_count || 0}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">Days left</div>
                <div className="font-heading text-xl font-bold flex items-center gap-1"><Clock className="h-4 w-4 text-primary" />{daysLeft(campaign.deadline)}</div>
              </div>
            </div>
            <Button size="lg" className="w-full mt-5" onClick={() => nav(`/payment?campaign_id=${campaign.id}`)}>
              <Heart className="h-4 w-4" /> Donate now
            </Button>
            <Button variant="outline" size="md" className="w-full mt-2" onClick={share}>
              <Share2 className="h-4 w-4" /> Share this campaign
            </Button>
            <div className="mt-5 text-xs text-muted-foreground text-center">
              🔒 Payments are secure and every naira is tracked publicly.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
