import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, XCircle, FileText, Shield, Flag, Trash2, Send,
  ExternalLink, AlertTriangle, Sparkles, MessageSquare, Eye, Clock, Ban,
  GraduationCap, Mail, Phone, UserCircle, ArrowUpRight, StickyNote, Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button, Card, Textarea, StatusBadge } from "@/components/shared";
import { formatDate, formatNaira, timeAgo } from "@/lib/formatters";
import { notifyStudent, logAudit } from "@/lib/notifyStudent";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { verifyStudentIdentity } from "@/lib/verifyStudent";
import { isImageUrl } from "@/lib/cloudinary";
import {
  sendVerificationSuccessEmail,
  sendVerificationFailedEmail,
  sendApplicationApprovedEmail,
  sendApplicationRejectedEmail,
} from "@/lib/email";

const STAGES = ["SUBMITTED", "UNDER_REVIEW", "STAGE_1", "STAGE_2", "STAGE_3", "STAGE_4", "APPROVED"] as const;
const DOC_LINKS = [
  { key: "passport_photo_url", label: "Passport photo" },
  { key: "school_id_url", label: "School ID card" },
  { key: "admission_letter_url", label: "Admission letter" },
  { key: "fee_invoice_url", label: "Fee invoice" },
  { key: "course_reg_url", label: "Course registration" },
  { key: "profile_printout_url", label: "Profile printout" },
];

function stageForTransition(from: string, to: string): "received" | "reviewed" | "decided" {
  if (to === "APPROVED" || to === "REJECTED") return "decided";
  if (from === "SUBMITTED" || from === "EMERGENCY") return "received";
  return "reviewed";
}

export default function AdminApplicationDetail() {
  const { id } = useParams();
  const nav = useNavigate();

  const { data: app, refetch: refetchApp } = useQuery({
    queryKey: ["application", id],
    queryFn: () => base44.entities.FundingApplication.get(id!),
    enabled: !!id,
  });
  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ["studentProfile", id],
    queryFn: () => (app ? base44.entities.StudentProfile.get(app.student_profile_id) : null),
    enabled: !!app,
  });
  const { data: stages, refetch: refetchStages } = useQuery({
    queryKey: ["verificationStages", id],
    queryFn: () => base44.entities.VerificationStage.filter({ application_id: id! }, "-created_date"),
    enabled: !!id,
  });
  const { data: campaigns, refetch: refetchCampaigns } = useQuery({
    queryKey: ["appCampaigns", id],
    queryFn: () => base44.entities.Campaign.filter({ application_id: id! }),
    enabled: !!id,
  });

  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [dialog, setDialog] = useState<{ type: "reject" | "cancel" | "doc_flag" | null }>({ type: null });
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [verifiedRecord, setVerifiedRecord] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  // Fetch the verified Supabase record when profile is already verified so the UI displays the real record
  useQuery({
    queryKey: ["verified-record", profile?.matric_number],
    queryFn: async () => {
      if (!profile?.matric_number || !profile.is_verified) return null;
      const { verifyStudentIdentity } = await import("@/lib/verifyStudent");
      const result = await verifyStudentIdentity({ matricNumber: profile.matric_number });
      if (result.ok) setVerifiedRecord(result.record);
      return result.ok ? result.record : null;
    },
    enabled: !!profile?.is_verified && !!profile?.matric_number,
  });
  const [docFlag, setDocFlag] = useState({ docKey: "", docLabel: "", reason: "" });

  const refetchAll = () => { refetchApp(); refetchProfile(); refetchStages(); refetchCampaigns(); };

  if (!app || !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">Loading application…</div>
        </div>
      </div>
    );
  }

  const currentStageIdx = STAGES.indexOf(app.status as any);
  const nextStatus = currentStageIdx >= 0 && currentStageIdx < STAGES.length - 1 ? STAGES[currentStageIdx + 1] : null;

  const deriveTitle = () =>
    campaigns?.[0]?.title ||
    `Help ${profile.full_name}: ${app.purpose.charAt(0).toUpperCase() + app.purpose.slice(1).toLowerCase()} Support`;

  // ─── Identity verification against the real Supabase MAPOLY STUDENT table ───
  const verifyIdentity = async () => {
    setVerifying(true);
    setVerifyError("");

    // Verify against the real MAPOLY STUDENT table using the composite key:
    // First Name + Last Name + School + Department + Level + Email
    const nameParts = (profile.full_name || "").trim().split(/\s+/);
    const result = await verifyStudentIdentity({
      matricNumber: profile.matric_number, // secondary info only — not part of the key
      firstName: nameParts[0],
      lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : "",
      school: profile.faculty,
      department: profile.department,
      level: profile.level,
      email: profile.school_email || undefined,
    });

    if (result.ok) {
      const r = result.record;
      setVerifiedRecord(r);
      await base44.entities.StudentProfile.update(profile.id, { is_verified: true });
      await notifyStudent({
        user_id: profile.id, email: profile.school_email,
        type: "APPLICATION_UPDATE", title: "Identity verified ✓",
        message: `Your identity (${r.fullName} — ${r.department}, ${r.programme}) has been confirmed against MAPOLY records using your name, school, department, level and email.`,
      });
      // Template 4 — Verification successful (only after it actually succeeds)
      await sendVerificationSuccessEmail(profile);
      await logAudit("IDENTITY_VERIFIED", profile.id, "StudentProfile", {
        matric: profile.matric_number,
        fullName: r.fullName, department: r.department, programme: r.programme, level: r.level, status: r.status,
        source: "supabase",
      }, "Admin");
      toast.success(`Verified ✓ ${r.fullName} — ${r.department}`);
    } else if (result.reason === "NOT_FOUND" || result.reason === "MISMATCH") {
      await base44.entities.StudentProfile.update(profile.id, { is_verified: false });
      await base44.entities.FundingApplication.update(app.id, {
        status: "REJECTED",
        rejection_reason: result.message,
        admin_notes: `${app.admin_notes || ""}\n[${new Date().toISOString()}] Identity verification failed: ${result.message}`.trim(),
      });
      await base44.entities.VerificationStage.create({
        application_id: app.id, stage: Math.max(1, currentStageIdx + 1), reviewed_by: "Admin", decision: "REJECTED", comment: result.message,
      });
      await notifyStudent({
        user_id: profile.id, email: profile.school_email,
        type: "APPLICATION_UPDATE", title: "Application rejected: identity could not be verified",
        message: `${result.message} Your application cannot be approved.`,
      });
      // Template 5 — Verification requires attention, with the ACTUAL reason
      await sendVerificationFailedEmail(profile, result.message);
      await logAudit("IDENTITY_VERIFICATION_FAILED", profile.id, "StudentProfile", {
        matric: profile.matric_number, reason: result.reason, application_rejected: true,
      }, "Admin");
      toast.error(result.message, { duration: 7000 });
    } else {
      setVerifyError(result.message);
      await base44.entities.StudentProfile.update(profile.id, { is_verified: false });
      toast.error(result.message, { duration: 8000 });
    }

    setVerifying(false);
    refetchAll();
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const notify = async (opts: Parameters<typeof notifyStudent>[0]) => notifyStudent(opts);
  void notify;

  // ─── Advance ────────────────────────────────────────────────────────────
  // One-click: verify → approve → publish campaign (skips intermediate stages)
  const approveAndPublish = async () => {
    if (!profile.is_verified) return toast.error("Verify the student first before approving.");
    setActionLoading(true);
    // Update status to APPROVED
    await base44.entities.FundingApplication.update(app.id, {
      status: "APPROVED",
      admin_notes: `${app.admin_notes || ""}\n[${new Date().toISOString()}] Approved & published by Admin (verified: ${profile.full_name})`.trim(),
    });
    await base44.entities.VerificationStage.create({
      application_id: app.id, stage: 7, reviewed_by: "Admin",
      decision: "APPROVED", comment: note || "Approved & published directly after verification.",
    });
    // Publish the campaign live
    const campaign = await base44.entities.Campaign.create({
      application_id: app.id, student_profile_id: profile.id,
      title: `Help ${profile.full_name}: ${app.purpose.toLowerCase().charAt(0).toUpperCase() + app.purpose.toLowerCase().slice(1)} Support`,
      description: app.personal_statement,
      goal_amount: app.amount_needed, raised_amount: 0, deadline: app.deadline,
      is_public: true, is_featured: false, status: "ACTIVE", category: app.purpose,
      department: profile.department, level: profile.level, donor_count: 0,
    });
    // Notify the student (in-app + Template 7 — handled once here)
    await sendApplicationApprovedEmail(profile, app, campaign.title);
    await notifyStudent({
      user_id: profile.id, email: profile.school_email,
      type: "CAMPAIGN_UPDATE", title: "Campaign published! 🎉",
      message: `Congratulations! Your campaign is now live and accepting donations from donors.`,
      link: `/campaigns/${campaign.id}`,
    });
    await logAudit("CAMPAIGN_PUBLISHED", campaign.id, "Campaign", { application_id: app.id, verified: true }, "Admin");
    toast.success("Application approved & campaign published live! 🎉");
    setNote(""); setActionLoading(false);
    refetchAll();
  };

  const advance = async () => {
    if (!nextStatus) return;

    if (!profile.is_verified) {
      toast.error("⚠️ Cannot advance: student identity not verified against MAPOLY records.", { duration: 6000 });
      toast.error("Click \"Verify identity\" first.", { duration: 6000 });
      return;
    }

    const latestDocRequest = stages?.[0]?.decision === "MORE_DOCS_NEEDED" ? stages[0] : null;
    if (latestDocRequest && !note) {
      toast.error("⚠️ This student has a pending document re-upload request. Please verify new uploads before advancing.", { duration: 5000 });
      return;
    }

    setActionLoading(true);
    await base44.entities.FundingApplication.update(app.id, {
      status: nextStatus,
      admin_notes: note ? `${app.admin_notes || ""}\n[${new Date().toISOString()}] ${note}`.trim() : app.admin_notes,
    });
    await base44.entities.VerificationStage.create({
      application_id: app.id, stage: currentStageIdx + 1,
      reviewed_by: "Admin", decision: "APPROVED", comment: note || null,
    });
    void stageForTransition; // suppress unused warning
    await notifyStudent({
      user_id: profile.id, email: profile.school_email,
      type: "APPLICATION_UPDATE",
      title: `Application advanced: ${nextStatus.replace(/_/g, " ")}`,
      message: `Your funding application has moved to ${nextStatus.replace(/_/g, " ")}.${note ? ` Note: ${note}` : ""}`,
    });
    await logAudit("APPLICATION_ADVANCED", app.id, "FundingApplication", { from: app.status, to: nextStatus }, "Admin");

    if (nextStatus === "APPROVED") {
      const campaign = await base44.entities.Campaign.create({
        application_id: app.id, student_profile_id: profile.id,
        title: `Help ${profile.full_name}: ${app.purpose.toLowerCase().charAt(0).toUpperCase() + app.purpose.toLowerCase().slice(1)} Support`,
        description: app.personal_statement,
        goal_amount: app.amount_needed, raised_amount: 0,
        deadline: app.deadline, is_public: true, is_featured: false,
        status: "ACTIVE", category: app.purpose,
        department: profile.department, level: profile.level, donor_count: 0,
      });
      // Template 7 — Application Approved (only when status actually became APPROVED)
      await sendApplicationApprovedEmail(profile, app, campaign.title);
      await notifyStudent({
        user_id: profile.id, email: profile.school_email,
        type: "CAMPAIGN_UPDATE", title: "Campaign published! 🎉",
        message: `Your funding campaign has been approved and is now live. Share your link with friends and well-wishers.`,
        link: `/campaigns/${campaign.id}`,
      });
      toast.success("Approved & campaign published!");
    } else {
      toast.success(`Advanced to ${nextStatus.replace(/_/g, " ")}`);
    }
    setNote(""); setActionLoading(false);
    refetchAll();
  };

  const publishCampaign = async () => {
    if (app.status !== "APPROVED") return toast.error("Only approved applications can be published");
    if (!profile.is_verified) return toast.error("Identity verification is required before publishing");
    if (campaigns?.length) return toast.error("A campaign already exists for this application");
    setActionLoading(true);
    const campaign = await base44.entities.Campaign.create({
      application_id: app.id, student_profile_id: profile.id,
      title: `Help ${profile.full_name}: ${app.purpose.toLowerCase().charAt(0).toUpperCase() + app.purpose.toLowerCase().slice(1)} Support`,
      description: app.personal_statement,
      goal_amount: app.amount_needed, raised_amount: 0, deadline: app.deadline,
      is_public: true, is_featured: false, status: "ACTIVE", category: app.purpose,
      department: profile.department, level: profile.level, donor_count: 0,
    });
    await notifyStudent({
      user_id: profile.id, email: profile.school_email,
      type: "CAMPAIGN_UPDATE", title: "Campaign published",
      message: "Your approved funding campaign is now live and ready to share.",
      link: `/campaigns/${campaign.id}`,
    });
    await logAudit("CAMPAIGN_PUBLISHED", campaign.id, "Campaign", { application_id: app.id }, "Admin");
    await refetchCampaigns();
    setActionLoading(false);
    toast.success("Campaign published");
  };

  const verifyReplacementDocuments = async () => {
    setActionLoading(true);
    await base44.entities.VerificationStage.create({
      application_id: app.id, stage: Math.max(1, currentStageIdx + 1),
      reviewed_by: "Admin", decision: "APPROVED",
      comment: note || "Replacement documents reviewed and accepted.",
    });
    await notifyStudent({
      user_id: profile.id, email: profile.school_email,
      type: "APPLICATION_UPDATE", title: "Replacement document verified",
      message: "Your replacement document has been reviewed and accepted. Your application review can now continue.",
    });
    await logAudit("REPLACEMENT_DOCUMENT_VERIFIED", app.id, "FundingApplication", null, "Admin");
    setNote(""); setActionLoading(false);
    await refetchStages();
    toast.success("Replacement document verified. You can now advance the application.");
  };

  const requestMoreDocs = async () => {
    if (!note) return toast.error("Please add a note explaining what documents are needed");
    setActionLoading(true);
    await base44.entities.VerificationStage.create({
      application_id: app.id, stage: Math.max(1, currentStageIdx + 1), reviewed_by: "Admin",
      decision: "MORE_DOCS_NEEDED", comment: note,
    });
    await notifyStudent({
      user_id: profile.id, email: profile.school_email,
      type: "APPLICATION_UPDATE", title: "Additional documents needed",
      message: `Admin request: ${note}. Please upload additional documents to continue review.`,
    });
    await logAudit("MORE_DOCS_REQUESTED", app.id, "FundingApplication", { comment: note }, "Admin");
    toast.success("Request sent to student");
    setNote(""); setActionLoading(false);
    refetchStages();
  };

  const requestDocReupload = async () => {
    if (!docFlag.docKey || !docFlag.reason.trim()) return toast.error("Please select a document and provide a reason");
    setActionLoading(true);
    const msg = `Please re-upload your "${docFlag.docLabel}". Reason: ${docFlag.reason}`;
    await base44.entities.VerificationStage.create({
      application_id: app.id, stage: Math.max(1, currentStageIdx + 1), reviewed_by: "Admin",
      decision: "MORE_DOCS_NEEDED", comment: msg,
    });
    await notifyStudent({
      user_id: profile.id, email: profile.school_email,
      type: "APPLICATION_UPDATE", title: "Document needs re-upload",
      message: `${msg} Log into your portal to replace this document. Your application will continue once verified.`,
    });
    await logAudit("DOCUMENT_REUPLOAD_REQUESTED", app.id, "FundingApplication", { doc: docFlag.docKey, reason: docFlag.reason }, "Admin");
    toast.success(`Re-upload requested for ${docFlag.docLabel}`);
    setDocFlag({ docKey: "", docLabel: "", reason: "" });
    setDialog({ type: null });
    setActionLoading(false);
    refetchStages();
  };

  const reject = async () => {
    if (!rejectReason) return toast.error("A rejection reason is required");
    setActionLoading(true);
    await base44.entities.FundingApplication.update(app.id, { status: "REJECTED", rejection_reason: rejectReason });
    await base44.entities.VerificationStage.create({
      application_id: app.id, stage: Math.max(1, currentStageIdx + 1), reviewed_by: "Admin", decision: "REJECTED", comment: rejectReason,
    });
    await notifyStudent({
      user_id: profile.id, email: profile.school_email,
      type: "APPLICATION_UPDATE", title: "Application rejected",
      message: `Your application was not approved. Reason: ${rejectReason}`,
    });
    // Template 8 — Application rejected (admin's actual reason)
    await sendApplicationRejectedEmail(profile, app, deriveTitle(), rejectReason);
    await logAudit("APPLICATION_REJECTED", app.id, "FundingApplication", { reason: rejectReason }, "Admin");
    toast.error("Application rejected");
    setRejectReason(""); setDialog({ type: null }); setActionLoading(false);
    refetchAll();
  };

  const cancelApplication = async () => {
    setActionLoading(true);
    for (const c of campaigns || []) {
      await base44.entities.Campaign.update(c.id, { status: "SUSPENDED" });
    }
    await base44.entities.FundingApplication.update(app.id, {
      status: "REJECTED",
      admin_notes: `${app.admin_notes || ""}\n[${new Date().toISOString()}] CANCELLED by Admin`.trim(),
      rejection_reason: "Cancelled by administrator",
    });
    await notifyStudent({
      user_id: profile.id, email: profile.school_email,
      type: "APPLICATION_UPDATE", title: "Application cancelled",
      message: "Your application has been cancelled by an administrator. Contact support for more information.",
    });
    // Template 8 — Application rejected/cancelled
    await sendApplicationRejectedEmail(profile, app, deriveTitle(), "Your application was cancelled. Please contact support for more information.");
    await logAudit("APPLICATION_CANCELLED", app.id, "FundingApplication", { had_campaigns: (campaigns?.length || 0) > 0 }, "Admin");
    toast.success("Application cancelled");
    setDialog({ type: null }); setActionLoading(false);
    nav("/admin/applications");
  };

  const saveNote = async () => {
    if (!note) return;
    const updated = `${app.admin_notes || ""}\n[${new Date().toISOString()}] ${note}`.trim();
    await base44.entities.FundingApplication.update(app.id, { admin_notes: updated });
    await logAudit("ADMIN_NOTE_ADDED", app.id, "FundingApplication", { note }, "Admin");
    toast.success("Note saved");
    setNote("");
    refetchApp();
  };

  const progressPct = currentStageIdx >= 0 ? Math.round((currentStageIdx / (STAGES.length - 1)) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/admin/applications" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" /> Applications
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-heading font-semibold text-lg">{profile.full_name}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* ▸ LEFT COLUMN */}
        <div className="space-y-5">
          {/* Student header */}
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-heading text-2xl font-bold">{profile.full_name}</h1>
                <div className="flex flex-wrap gap-1.5 mt-1.5 items-center text-sm text-muted-foreground">
                  <UserCircle className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">{profile.matric_number}</span>
                  <span>•</span>
                  <span>{profile.department}</span>
                  <span>•</span>
                  <span>{profile.faculty}</span>
                  <span>•</span>
                  <span>Level {profile.level}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <StatusBadge status={app.status} />
                  {app.is_emergency && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive border border-destructive/20 px-2.5 py-0.5 text-xs font-semibold">
                      <Flag className="h-3 w-3" /> EMERGENCY
                    </span>
                  )}
                  {profile.is_verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success border border-success/20 px-2.5 py-0.5 text-xs font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Identity Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 text-warning border border-warning/20 px-2.5 py-0.5 text-xs font-medium">
                      <AlertTriangle className="h-3 w-3" /> Not Verified
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs uppercase text-muted-foreground tracking-wider">Requested</div>
                <div className="font-heading text-3xl font-bold text-primary">{formatNaira(app.amount_needed)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  <Clock className="inline h-3 w-3 mr-1" />
                  Deadline {formatDate(app.deadline)}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-6">
              <div className="flex items-center gap-1">
                {STAGES.map((s, i) => (
                  <div
                    key={s}
                    className={`h-2 flex-1 rounded-full transition-colors ${i <= currentStageIdx ? "bg-primary" : "bg-muted"}`}
                    title={s.replace(/_/g, " ")}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Submitted</span>
                <span>{progressPct}%</span>
                <span>Approved</span>
              </div>
            </div>
          </Card>

          {/* Contact info */}
          <div className="grid gap-3 md:grid-cols-2">
            {profile.phone && (
              <div className="rounded-lg border border-border p-3 flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div><div className="text-xs text-muted-foreground">Phone</div><div className="text-sm font-medium">{profile.phone}</div></div>
              </div>
            )}
            {profile.school_email && (
              <div className="rounded-lg border border-border p-3 flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div><div className="text-xs text-muted-foreground">Email</div><div className="text-sm font-medium truncate">{profile.school_email}</div></div>
              </div>
            )}
          </div>

          {/* Personal statement */}
          <Card className="p-5">
            <h2 className="font-heading font-semibold text-lg mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Personal statement
            </h2>
            <div className="text-sm leading-relaxed whitespace-pre-line bg-muted/40 rounded-lg p-4 border border-border/50">
              {app.personal_statement}
            </div>
          </Card>

          {/* Documents */}
          <Card className="p-5">
            <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Uploaded documents
            </h2>
            <div className="grid gap-2 md:grid-cols-2">
              {DOC_LINKS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 group">
                  <span className="text-sm">{label}</span>
                  <div className="flex items-center gap-2">
                    {(profile as any)?.[key] ? (
                      <a
                        href={(profile as any)[key]}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-xs font-medium inline-flex items-center gap-1 hover:underline"
                      >
                        {isImageUrl((profile as any)[key]) ? "View image" : "View PDF"} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">—</span>
                    )}
                    <button
                      onClick={() => { setDocFlag({ docKey: key, docLabel: label, reason: "" }); setDialog({ type: "doc_flag" }); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-medium text-destructive hover:bg-destructive/10 rounded px-2 py-0.5 inline-flex items-center gap-1"
                      title="Flag for re-upload"
                    >
                      <Flag className="h-2.5 w-2.5" /> Flag
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Disbursement account (only if purpose is ACCOMMODATION + verified) */}
            {app.purpose === "ACCOMMODATION" && profile.is_verified && (
              <div className="mt-4 pt-4 border-t border-border">
                <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-primary" /> Student disbursement account
                </h3>
                {(profile.bank_name || profile.account_number) ? (
                  <div className="grid gap-2 md:grid-cols-3 text-sm">
                    <div className="rounded bg-muted/40 px-3 py-1.5"><span className="text-muted-foreground">Bank</span><div className="font-medium">{profile.bank_name}</div></div>
                    <div className="rounded bg-muted/40 px-3 py-1.5"><span className="text-muted-foreground">Number</span><div className="font-medium font-mono">{profile.account_number}</div></div>
                    <div className="rounded bg-muted/40 px-3 py-1.5"><span className="text-muted-foreground">Holder</span><div className="font-medium">{profile.account_holder}</div></div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Student has not added bank account details yet.</p>
                )}
              </div>
            )}
          </Card>

          {/* Verified institutional record */}
          <Card className="p-5">
            <h2 className="font-heading font-semibold text-lg mb-3 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" /> Verified institutional record
                {verifiedRecord && (
                  <span className="ml-auto rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold" title="Verified by composite primary key: First Name · Last Name · School · Department · Level · Email">
                    COMPOSITE KEY VERIFIED • SUPABASE
                  </span>
                )}
              </h2>

            {verifyError && (
              <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {verifyError}
              </div>
            )}

            {verifiedRecord ? (
              <div className="grid gap-2 md:grid-cols-2 text-sm">
                {[
                  ["First Name ✓", verifiedRecord.firstName],
                  ["Last Name ✓", verifiedRecord.lastName],
                  ["Matric Number", verifiedRecord.matricNumber],
                  ["Gender", verifiedRecord.gender],
                  ["School ✓", verifiedRecord.school],
                  ["Department ✓", verifiedRecord.department],
                  ["Level ✓", verifiedRecord.level],
                  ["Email ✓", verifiedRecord.email],
                  ["Programme", verifiedRecord.programme],
                  ["Admission Year", verifiedRecord.admissionYear],
                  ["Session", verifiedRecord.academicSession],
                  ["Dept Code", verifiedRecord.departmentCode],
                  ["Status", verifiedRecord.status],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between rounded bg-muted/40 px-3 py-1.5">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-warning/40 bg-warning/5 p-4 flex flex-col items-center gap-2 text-center">
                <AlertTriangle className="h-6 w-6 text-warning" />
                <div className="text-sm font-semibold text-warning">Not verified yet</div>
                <div className="text-xs text-muted-foreground max-w-sm">
                  {profile.is_verified
                    ? "This student was previously verified. Click Verify Identity below to re-check against live records."
                    : `Use the "Verify Identity" button below to check ${profile.matric_number} against the live MAPOLY STUDENT table in Supabase.`}
                </div>
              </div>
            )}
          </Card>

          {/* Verification history */}
          <Card className="p-5">
            <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Verification history
            </h2>
            {(!stages || stages.length === 0) ? (
              <div className="text-sm text-muted-foreground italic py-3 text-center">No verification stages yet.</div>
            ) : (
              <div className="space-y-3">
                {stages.map((s: any) => (
                  <div key={s.id} className="flex gap-3 border-l-2 border-primary pl-4 py-1">
                    <div>
                      <div className="text-sm flex items-center gap-2">
                        <span className="font-semibold">Stage {s.stage}</span>
                        <StatusBadge status={s.decision} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Reviewed by {s.reviewed_by} • {timeAgo(s.created_date)}
                      </div>
                      {s.comment && <div className="text-sm mt-1.5 text-muted-foreground italic">"{s.comment}"</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ▸ RIGHT SIDEBAR — ACTION PANEL */}
        <div className="space-y-4">
          {/* Identity check */}
          <Card className="p-5">
            <h3 className="font-heading font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" /> Verify identity
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Verifies against the live <strong>MAPOLY STUDENT</strong> table using the 6-field composite key:
              <span className="block mt-1 text-[10px]">First Name · Last Name · School · Department · Level · Email</span>
            </p>

            {verifiedRecord && (
              <div className="mb-3 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
                <div className="flex items-center gap-2 text-success font-semibold mb-1">
                  <CheckCircle2 className="h-4 w-4" /> {verifiedRecord.fullName}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5 mt-1.5">
                  <div>Matric: <span className="font-mono">{verifiedRecord.matricNumber}</span></div>
                  <div>Department: {verifiedRecord.department}</div>
                  <div>Programme: {verifiedRecord.programme} • Level: {verifiedRecord.level}</div>
                  <div className="flex items-center gap-1 mt-1"><StatusBadge status={verifiedRecord.status} /></div>
                </div>
              </div>
            )}

            {verifyError && (
              <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {verifyError}
              </div>
            )}

            <Button
              onClick={verifyIdentity}
              disabled={verifying}
              className="w-full"
              variant={profile.is_verified ? "outline" : "primary"}
            >
              {verifying ? (
                <><span className="animate-spin rounded-full h-3.5 w-3.5 border border-t-transparent border-current mr-1.5" /> Checking Supabase…</>
              ) : profile.is_verified ? (
                <><CheckCircle2 className="h-4 w-4" /> Re-verify (live)</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Verify identity (live)</>
              )}
            </Button>
            <p className="mt-2 text-[10px] text-muted-foreground text-center">Uses the real MAPOLY STUDENT table — no mock data</p>
          </Card>

          {/* Stage advancement */}
          {app.status !== "APPROVED" && app.status !== "REJECTED" && (
            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-3">Review actions</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Admin note</label>
                  <Textarea
                    placeholder="Add a note for this stage…"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="min-h-[70px]"
                  />
                  <div className="mt-2 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={saveNote} disabled={!note}>
                      <StickyNote className="h-3.5 w-3.5" /> Save note
                    </Button>
                  </div>
                </div>

                {stages?.[0]?.decision === "MORE_DOCS_NEEDED" && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                    <div className="text-xs font-semibold text-warning">Document re-upload pending</div>
                    <p className="mt-1 text-xs text-muted-foreground">Review the student's replacement file, then confirm it before advancing.</p>
                    <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={verifyReplacementDocuments} disabled={actionLoading}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Verify replacement document
                    </Button>
                  </div>
                )}

                {nextStatus && (
                  <Button onClick={advance} disabled={actionLoading || !profile.is_verified} className="w-full">
                    {actionLoading ? <span className="animate-spin rounded-full h-3.5 w-3.5 border border-t-transparent border-current mr-1.5" /> : <Send className="h-4 w-4" />}
                    Advance → {nextStatus.replace(/_/g, " ")}
                  </Button>
                )}

                {/* One-click approve → publish for verified students */}
                {profile.is_verified && (
                  <Button variant="secondary" onClick={approveAndPublish} disabled={actionLoading} className="w-full">
                    🎉 Approve & Publish Campaign
                  </Button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={requestMoreDocs} disabled={!note || actionLoading}>
                    <MessageSquare className="h-4 w-4" /> Request docs
                  </Button>
                  <Button variant="outline" onClick={() => setDialog({ type: "reject" })}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Publish campaign */}
          {app.status === "APPROVED" && (!campaigns || campaigns.length === 0) && (
            <Card className="p-5 border-success/30 bg-success/5">
              <h3 className="font-heading font-semibold mb-2 text-success flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Ready to publish
              </h3>
              <p className="text-xs text-muted-foreground mb-3">Create a public campaign from this approved application.</p>
              <Button onClick={publishCampaign} disabled={actionLoading || !profile.is_verified} className="w-full" variant="secondary">
                <ArrowUpRight className="h-4 w-4" /> Publish campaign
              </Button>
            </Card>
          )}

          {/* Campaign info */}
          {campaigns && campaigns.length > 0 && (
            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-3">Linked campaign</h3>
              {campaigns.map((c: any) => (
                <div key={c.id} className="rounded-lg border border-border p-3 space-y-1.5">
                  <div className="text-sm font-semibold line-clamp-2">{c.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatNaira(c.raised_amount || 0)} raised • {c.donor_count || 0} donors • {c.status}
                  </div>
                  <Link to={`/campaigns/${c.id}`} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                    View public page <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </Card>
          )}

          {/* Danger zone */}
          <Card className="p-5 border-destructive/20">
            <h3 className="font-heading font-semibold mb-3 text-destructive flex items-center gap-2">
              <Ban className="h-4 w-4" /> Danger zone
            </h3>
            <Button variant="danger" size="sm" className="w-full" onClick={() => setDialog({ type: "cancel" })} disabled={actionLoading}>
              <Trash2 className="h-4 w-4" />
              {app.status === "APPROVED" ? "Cancel approved application" : "Delete application"}
            </Button>
          </Card>
        </div>
      </div>

      {/* Reject dialog */}
      <AlertDialog
        open={dialog.type === "reject"}
        onOpenChange={() => setDialog({ type: null })}
        title="Reject application"
        description="The student will be notified immediately."
        actionLabel={actionLoading ? "Rejecting…" : "Confirm rejection"}
        actionVariant="danger"
        onAction={reject}
      >
        <div className="mt-1">
          <label className="text-sm font-medium">Rejection reason *</label>
          <Textarea
            placeholder="Provide a clear reason the student can act on…"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            className="mt-1 min-h-[80px]"
          />
        </div>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog
        open={dialog.type === "cancel"}
        onOpenChange={() => setDialog({ type: null })}
        title={app.status === "APPROVED" ? "Cancel approved application" : "Delete application"}
        description={
          app.status === "APPROVED"
            ? "This will cancel the approved application and suspend any linked campaigns."
            : "This will permanently remove the application."
        }
        actionLabel={actionLoading ? "Processing…" : (app.status === "APPROVED" ? "Cancel application" : "Delete permanently")}
        actionVariant="danger"
        onAction={cancelApplication}
      />

      {/* Doc flag dialog */}
      <AlertDialog
        open={dialog.type === "doc_flag"}
        onOpenChange={() => { setDialog({ type: null }); setDocFlag({ docKey: "", docLabel: "", reason: "" }); }}
        title={`Flag document for re-upload`}
        description={`The student will be asked to upload a clearer or authentic version of "${docFlag.docLabel}"`}
        actionLabel={actionLoading ? "Sending…" : "Send re-upload request"}
        actionVariant="secondary"
        onAction={requestDocReupload}
      >
        <div className="mt-2 space-y-3">
          <div>
            <label className="text-sm font-medium">Document type</label>
            <select
              value={docFlag.docKey}
              onChange={e => {
                const selected = DOC_LINKS.find(d => d.key === e.target.value);
                setDocFlag({ docKey: e.target.value, docLabel: selected?.label || "", reason: docFlag.reason });
              }}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 mt-1 text-sm"
            >
              <option value="">Select a document…</option>
              {DOC_LINKS.map(d => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">What's wrong with this document?</label>
            <Textarea
              placeholder="e.g. Image is too blurry to read, appears edited, wrong document type…"
              value={docFlag.reason}
              onChange={e => setDocFlag({ ...docFlag, reason: e.target.value })}
              className="mt-1 min-h-[80px]"
            />
          </div>
        </div>
      </AlertDialog>
    </div>
  );
}
