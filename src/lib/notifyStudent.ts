// In-app notifications + transactional emails for MapFund.
// Emails are sent ONLY when tied to a real event (viewing/reloading never
// sends one) and always via the Supabase "send-email" Edge Function.

import { base44 } from "@/api/base44Client";
import { sendApplicationApprovedEmail, sendApplicationRejectedEmail } from "@/lib/email";

export type NotificationType =
  | "APPLICATION_UPDATE" | "DONATION_RECEIVED" | "CAMPAIGN_UPDATE"
  | "SYSTEM" | "FRAUD_ALERT" | "DISBURSEMENT";

type NotifyOpts = {
  user_id: string;
  email?: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  /** Only "decided" actually triggers an email. Others are notification-only. */
  emailStage?: "received" | "reviewed" | "decided";
  emailApproved?: boolean;
  emailNote?: string;
};

function deriveCampaignTitle(profile: any, application: any): string {
  if (!application) return "your campaign";
  const purpose = String(application.purpose || "").toLowerCase();
  const cap = purpose.charAt(0).toUpperCase() + purpose.slice(1);
  return `Help ${profile.full_name}: ${cap} Support`;
}

export async function notifyStudent({
  user_id, email, type, title, message, link,
  emailStage, emailApproved, emailNote,
}: NotifyOpts) {
  // In-app notification — always safe to create
  await base44.entities.AppNotification.create({
    user_id,
    type,
    title,
    message,
    is_read: false,
    link: link || null,
  });

  // Transactional email — only for final decisions tied to a real action.
  if (email && emailStage === "decided") {
    try {
      const [profile, applications, campaigns] = await Promise.all([
        base44.entities.StudentProfile.get(user_id),
        base44.entities.FundingApplication.filter({ student_profile_id: user_id }, "-created_date"),
        base44.entities.Campaign.filter({ student_profile_id: user_id }, "-created_date"),
      ]);
      const application = applications?.[0];
      const campaign = campaigns?.find((c: any) => c.application_id === application?.id) || campaigns?.[0];
      if (profile && application) {
        const campaignTitle = campaign?.title || deriveCampaignTitle(profile, application);
        if (emailApproved) {
          await sendApplicationApprovedEmail(profile, application, campaignTitle);
        } else {
          await sendApplicationRejectedEmail(profile, application, campaignTitle, emailNote || "Not approved at this time.");
        }
      }
    } catch (err) {
      // Email layer must never break the underlying status change.
      console.error("[MapFund] Transactional email failed (non-blocking):", err);
    }
  }
}

export async function logAudit(
  action: string,
  target_id?: string,
  target_type?: string,
  metadata?: Record<string, unknown> | null,
  actor_name: string = "System",
) {
  await base44.entities.AuditLog.create({
    actor_name,
    action,
    target_id,
    target_type,
    metadata: metadata ? JSON.stringify(metadata) : "",
  });
}
