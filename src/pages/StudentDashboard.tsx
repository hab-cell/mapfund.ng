import { useEffect, useState } from "react";
import { FileText, Heart, CheckCircle2, Clock, Upload, Bell, ExternalLink, Landmark, Lock, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, EmptyState, Input, ProgressBar, StatCard, StatusBadge } from "@/components/shared";
import { formatDate, formatNaira, timeAgo } from "@/lib/formatters";
import { useAuth } from "@/lib/AuthContext";
import StudentFilesSection from "@/components/files/StudentFilesSection";

const STAGES = ["SUBMITTED", "UNDER_REVIEW", "STAGE_1", "STAGE_2", "STAGE_3", "STAGE_4", "APPROVED"];

export default function StudentDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [donations, setDonations] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [docRequests, setDocRequests] = useState<any[]>([]);
  const [bank, setBank] = useState({ bank_name: "", account_number: "", account_holder: "" });
  const [savingBank, setSavingBank] = useState(false);

  useEffect(() => {
    (async () => {
      // Each student sees ONLY their own profile — resolved from the logged-in user
      if (!user) return;
      const p = await base44.entities.StudentProfile.get(user.id);
      setProfile(p);
      if (!p) return;
      setBank({ bank_name: p.bank_name || "", account_number: p.account_number || "", account_holder: p.account_holder || "" });
      const studentApps = await base44.entities.FundingApplication.filter({ student_profile_id: p.id }, "-created_date");
      setApps(studentApps);
      const cs = await base44.entities.Campaign.filter({ student_profile_id: p.id }, "-created_date");
      setCampaigns(cs);
      setNotifications(await base44.entities.AppNotification.filter({ user_id: p.id }, "-created_date"));
      const stages = await base44.entities.VerificationStage.list("-created_date");
      const applicationIds = new Set(studentApps.map(a => a.id));
      setDocRequests(stages.filter(s => applicationIds.has(s.application_id) && s.decision === "MORE_DOCS_NEEDED"));
      // Donations only load when a campaign exists
      if (cs.length) {
        const ds = await base44.entities.Donation.filter({ campaign_id: cs[0].id, payment_status: "SUCCESS" }, "-created_date", 25);
        setDonations(ds);
      }
    })();
  }, [user]);

  const liveCampaigns = campaigns.filter(c => c.status === "ACTIVE" || c.status === "COMPLETED");
  const totalRaised = campaigns.reduce((s, c) => s + (c.raised_amount || 0), 0);
  const hasFunds = liveCampaigns.length > 0;
  const accommodationApp = apps.find(a => a.purpose === "ACCOMMODATION" && a.status === "APPROVED");
  const canManageBank = !!profile?.is_verified && !!accommodationApp;

  const saveBank = async () => {
    if (!profile) return;
    if (!bank.bank_name.trim() || !bank.account_holder.trim()) return toast.error("Bank name and account holder are required");
    if (!/^\d{10}$/.test(bank.account_number)) return toast.error("Account number must be exactly 10 digits");
    setSavingBank(true);
    await base44.entities.StudentProfile.update(profile.id, bank);
    await base44.entities.AuditLog.create({
      actor_name: profile.full_name,
      action: "BANK_DETAILS_UPDATED",
      target_id: profile.id,
      target_type: "StudentProfile",
      metadata: JSON.stringify({ bank_name: bank.bank_name }),
    });
    setSavingBank(false);
    toast.success("Bank details saved. Disbursements will be sent to this account.");
  };

  const replaceDocument = async (key: string, file?: File) => {
    if (!file || !profile) return;
    toast.loading("Uploading replacement document...", { id: key });
    const { file_url } = await base44.integrations.UploadFile(file);
    const updated = await base44.entities.StudentProfile.update(profile.id, { [key]: file_url });
    setProfile(updated);
    await base44.entities.AuditLog.create({
      actor_name: profile.full_name,
      action: "DOCUMENT_REUPLOADED",
      target_id: profile.id,
      target_type: "StudentProfile",
      metadata: JSON.stringify({ document: key, file_name: file.name }),
    });
    toast.success("Document replaced. An admin can now verify it.", { id: key });
  };

  const documents = [
    ["passport_photo_url", "Passport photo"], ["school_id_url", "School ID"],
    ["admission_letter_url", "Admission letter"], ["fee_invoice_url", "Fee invoice"],
    ["course_reg_url", "Course registration"], ["profile_printout_url", "Profile printout"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Welcome back{profile ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
        <p className="text-muted-foreground mt-1">Track your applications and campaigns.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Applications" value={apps.length} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Active Campaigns" value={campaigns.filter(c => c.status === "ACTIVE").length} icon={<Heart className="h-5 w-5" />} accent="secondary" />
        <StatCard
          label="Total Raised"
          value={hasFunds ? formatNaira(totalRaised) : "—"}
          hint={hasFunds ? undefined : "Unlocks after approval"}
          icon={hasFunds ? <TrendingUp className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          accent={hasFunds ? "success" : "secondary"}
        />
        <StatCard label="Profile" value={profile?.is_verified ? "Verified" : "Pending"} icon={profile?.is_verified ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />} accent={profile?.is_verified ? "success" : "secondary"} />
      </div>

      {/* Profile */}
      {profile && (
        <Card className="p-6">
          <h2 className="font-heading text-lg font-semibold mb-3">Your profile</h2>
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Matric</div><div className="font-medium">{profile.matric_number}</div></div>
            <div><div className="text-xs text-muted-foreground">Department</div><div className="font-medium">{profile.department}</div></div>
            <div><div className="text-xs text-muted-foreground">Level</div><div className="font-medium">{profile.level}</div></div>
          </div>
        </Card>
      )}

      {/* Bank details — only verified students with an APPROVED accommodation application */}
      {canManageBank && (
        <Card className="p-6 border-secondary/40">
          <h2 className="font-heading text-lg font-semibold mb-2 flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" /> Disbursement account
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Your accommodation application is approved. Add the bank account where your disbursement will be sent.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div><label className="text-sm font-medium mb-1 block">Bank name *</label><Input placeholder="e.g. Access Bank" value={bank.bank_name} onChange={e => setBank({ ...bank, bank_name: e.target.value })} /></div>
            <div><label className="text-sm font-medium mb-1 block">Account number *</label><Input placeholder="10 digits" maxLength={10} value={bank.account_number} onChange={e => setBank({ ...bank, account_number: e.target.value.replace(/\D/g, "") })} /></div>
            <div><label className="text-sm font-medium mb-1 block">Account holder *</label><Input placeholder="Your full name" value={bank.account_holder} onChange={e => setBank({ ...bank, account_holder: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={saveBank} disabled={savingBank}>{savingBank ? "Saving…" : "Save bank details"}</Button>
          </div>
        </Card>
      )}

      {/* Payment / donations — only visible when campaign is live */}
      {hasFunds ? (
        <Card className="p-6">
          <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" /> Your fundraising
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {campaigns.map(c => (
              <div key={c.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold">{c.title}</h3>
                  <StatusBadge status={c.status} />
                </div>
                <ProgressBar value={c.raised_amount || 0} goal={c.goal_amount} />
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.donor_count || 0} donors</span>
                </div>
              </div>
            ))}
          </div>
          {donations.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold mb-2">Recent donations</h3>
              <div className="space-y-2">
                {donations.slice(0, 8).map(d => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div>
                      <div className="text-sm font-medium">{d.is_anonymous ? "Anonymous supporter" : d.donor_name}</div>
                      {d.message && <div className="text-xs text-muted-foreground italic mt-0.5">"{d.message}"</div>}
                      <div className="text-xs text-muted-foreground">{timeAgo(d.created_date)}</div>
                    </div>
                    <div className="font-heading font-bold text-primary">{formatNaira(d.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6 border-dashed">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-muted p-2.5 text-muted-foreground"><Lock className="h-5 w-5" /></div>
            <div>
              <h2 className="font-heading font-semibold">Payments & donations</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Once an admin approves your application and your campaign goes live, your donation totals,
                donor list, and payment status will appear here automatically.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Applications timeline */}
      <Card className="p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">Your applications</h2>
        {apps.length === 0 ? (
          <EmptyState title="No applications yet" description="Apply for funding to get started." />
        ) : (
          <div className="space-y-4">
            {apps.map(a => {
              const idx = STAGES.indexOf(a.status);
              return (
                <div key={a.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold">{a.purpose} — {formatNaira(a.amount_needed)}</div>
                      <div className="text-xs text-muted-foreground">Submitted {formatDate(a.created_date)}</div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="flex items-center gap-1">
                    {STAGES.map((s, i) => (
                      <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`} />
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground uppercase">
                    <span>Submitted</span>
                    <span>Approved</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Notifications */}
      {notifications.length > 0 && (
        <Card className="p-6">
          <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Status notifications</h2>
          <div className="space-y-2">
            {notifications.slice(0, 5).map(n => (
              <div key={n.id} className={`rounded-lg border p-3 ${n.is_read ? "border-border" : "border-primary/30 bg-primary/5"}`}>
                <div className="text-sm font-semibold">{n.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{n.message}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Documents */}
      {profile && (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div><h2 className="font-heading text-lg font-semibold">Your documents</h2><p className="text-sm text-muted-foreground">Replace a document when an admin asks for a clearer or authentic copy.</p></div>
            {docRequests.length > 0 && <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">Re-upload requested</span>}
          </div>
          {docRequests[0] && <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"><div className="font-semibold text-warning">Admin request</div><div className="mt-1 text-muted-foreground">{docRequests[0].comment}</div></div>}
          <div className="grid gap-2 md:grid-cols-2">
            {documents.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div><div className="text-sm font-medium">{label}</div>{profile[key] && <a href={profile[key]} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline"><ExternalLink className="mr-1 inline h-3 w-3" />View current</a>}</div>
                <label className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"><input type="file" accept="image/*,.pdf" className="hidden" onChange={e => replaceDocument(key, e.target.files?.[0])} /><Upload className="mr-1 inline h-3.5 w-3.5" />{profile[key] ? "Replace" : "Upload"}</label>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Uploaded Files — Cloudinary for new uploads, linked via student_uploads */}
      {profile && (
        <StudentFilesSection profileId={profile.id} actorName={profile.full_name} />
      )}
    </div>
  );
}
