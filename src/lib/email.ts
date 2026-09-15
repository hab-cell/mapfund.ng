// Brevo transactional email integration for MapFund
// ────────────────────────────────────────────────────────────────────────────
// The frontend NEVER talks to Brevo directly. All emails go through the
// already-deployed Supabase Edge Function "send-email", which holds the
// BREVO_API_KEY securely in Supabase Secrets.
//
// Request format:  { templateId, to, params }
// No API keys here. No secrets here.
// ────────────────────────────────────────────────────────────────────────────

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { formatDate, formatNaira } from "@/lib/formatters";

// Exact Edge Function URL — already deployed, uses BREVO_API_KEY from
// Supabase Secrets. Frontend highlights this and never calls Brevo itself.
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/bright-function`;

// Only these Brevo template IDs exist in the project. Do NOT add others.
export const TEMPLATE_NAMES: Record<number, string> = {
  2: "Welcome",
  3: "Verify Your Email",
  4: "Student Verification Successful",
  5: "Student Verification Requires Attention",
  6: "Fundraising Application Submitted",
  7: "Fundraising Application Approved",
  8: "Fundraising Application Rejected",
  9: "You Received a New Donation",
  10: "Reset Your Password",
  12: "Donation Confirmation",
};

type SendResult = { ok: boolean; error?: string };

// ── Email logging ────────────────────────────────────────────────────────────
// Logs to the local EmailLog entity (visible in the Admin Email Management
// page) AND makes a best-effort write to the Supabase `email_logs` table if it
// exists. Never stores any API keys.
async function logEmail(entry: {
  student_id?: string | null;
  recipient_email: string;
  template_id: number;
  template_name: string;
  status: "SENT" | "FAILED";
  brevo_message_id?: string | null;
  error_message?: string | null;
}) {
  // Local log (always works, feeds admin dashboard)
  await base44.entities.EmailLog.create({ ...entry, sent_at: new Date().toISOString() });
  // Best-effort Supabase log — silently ignored if the table/RLS isn't ready
  try {
    await supabase.from("email_logs").insert([{
      student_id: entry.student_id ?? null,
      recipient_email: entry.recipient_email,
      template_id: entry.template_id,
      template_name: entry.template_name,
      status: entry.status,
      brevo_message_id: entry.brevo_message_id ?? null,
      error_message: entry.error_message ?? null,
      sent_at: new Date().toISOString(),
    }]);
  } catch {
    // Silently continue — logging failure must never break the app
  }
}

// ── Core sender — Supabase Edge Function invocation ("bright-function") ───────
export async function sendBrevoEmail(
  templateId: number,
  to: string,
  params: Record<string, unknown>,
  student_id?: string | null,
): Promise<SendResult> {
  const templateName = TEMPLATE_NAMES[templateId] ?? `Template ${templateId}`;
  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ templateId, to, params }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Edge function returned ${res.status}: ${errText || res.statusText}`);
    }

    const data = await res.json().catch(() => ({}));
    await logEmail({
      student_id,
      recipient_email: to,
      template_id: templateId,
      template_name: templateName,
      status: "SENT",
      brevo_message_id: (data as any)?.messageId ?? (data as any)?.id ?? (data as any)?.message_id ?? null,
    });
    return { ok: true };
  } catch (err: any) {
    const message = err?.message || "Unknown error";
    await logEmail({
      student_id,
      recipient_email: to,
      template_id: templateId,
      template_name: templateName,
      status: "FAILED",
      error_message: message,
    });
    console.error(`[MapFund] bright-function failed (template ${templateId} → ${to}):`, err);
    return { ok: false, error: message };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Typed event helpers — one function per Brevo template
// ────────────────────────────────────────────────────────────────────────────

/** Template 2 — Welcome (account created) */
export function sendWelcomeEmail(profile: any) {
  return sendBrevoEmail(2, profile.school_email, {
    student_name: profile.full_name,
  }, profile.id);
}

/** Template 3 — Verify Your Email (existing email verification flow) */
export function sendEmailVerificationEmail(profile: any, verification_link: string) {
  return sendBrevoEmail(3, profile.school_email, {
    student_name: profile.full_name,
    verification_link,
  }, profile.id);
}

/** Template 4 — Student Verification Successful (verification actually succeeded) */
export function sendVerificationSuccessEmail(profile: any) {
  return sendBrevoEmail(4, profile.school_email, {
    student_name: profile.full_name,
  }, profile.id);
}

/** Template 5 — Student Verification Requires Attention (actual failure reason) */
export function sendVerificationFailedEmail(profile: any, verification_reason: string) {
  return sendBrevoEmail(5, profile.school_email, {
    student_name: profile.full_name,
    verification_reason,
  }, profile.id);
}

/** Template 6 — Fundraising Application Submitted (after saved to DB) */
export function sendApplicationSubmittedEmail(profile: any, application: any, campaignTitle: string) {
  return sendBrevoEmail(6, profile.school_email, {
    student_name: profile.full_name,
    application_id: application.id,
    campaign_title: campaignTitle,
    submission_date: formatDate(application.created_date || new Date().toISOString()),
  }, profile.id);
}

/** Template 7 — Fundraising Application Approved (only when status → APPROVED) */
export function sendApplicationApprovedEmail(profile: any, application: any, campaignTitle: string) {
  return sendBrevoEmail(7, profile.school_email, {
    student_name: profile.full_name,
    application_id: application.id,
    campaign_title: campaignTitle,
  }, profile.id);
}

/** Template 8 — Fundraising Application Rejected (actual admin rejection reason) */
export function sendApplicationRejectedEmail(profile: any, application: any, campaignTitle: string, rejection_reason: string) {
  return sendBrevoEmail(8, profile.school_email, {
    student_name: profile.full_name,
    application_id: application.id,
    campaign_title: campaignTitle,
    rejection_reason,
  }, profile.id);
}

/** Template 9 — You Received a New Donation (to campaign owner's verified email) */
export function sendDonationReceivedEmail(profile: any, campaign: any, donation: any) {
  return sendBrevoEmail(9, profile.school_email, {
    student_name: profile.full_name,
    campaign_title: campaign.title,
    donation_amount: formatNaira(donation.amount),
    donation_date: formatDate(donation.created_date || new Date().toISOString()),
    transaction_reference: donation.payment_reference,
  }, profile.id);
}

/** Template 12 — Donation Confirmation (to the donor's email) */
export function sendDonationConfirmationEmail(
  donor: { email: string; name: string },
  profile: any,
  campaign: any,
  donation: any,
) {
  return sendBrevoEmail(12, donor.email, {
    donor_name: donor.name,
    student_name: profile.full_name,
    campaign_title: campaign.title,
    donation_amount: formatNaira(donation.amount),
    donation_date: formatDate(donation.created_date || new Date().toISOString()),
    transaction_reference: donation.payment_reference,
  });
}

/** Template 10 — Reset Your Password (existing Supabase-auth reset flow) */
export function sendPasswordResetEmail(profile: any, reset_password_link: string, expiration_time: string) {
  return sendBrevoEmail(10, profile.school_email, {
    student_name: profile.full_name,
    reset_password_link,
    expiration_time,
  }, profile.id);
}

// ── Bank-transfer payment emails ────────────────────────────────────────────
// Your Brevo account has no templates for intermediate payment states
// (instructions / receipt received / needs review / rejected). These helpers
// are local no-ops so no request is made to a non-existent Brevo template.
// Payment CONFIRMATION does have a real template (12 — Donation Confirmation).

type NoopResult = { ok: boolean; skipped: string };
const noop = (): Promise<NoopResult> => Promise.resolve({ ok: true, skipped: "no_template" });

/** Payment instructions — no Brevo template. */
export function sendPaymentInstructionsEmail(_donation: any): Promise<NoopResult> { return noop(); }
/** Receipt received — no Brevo template. */
export function sendReceiptReceivedEmail(_donation: any): Promise<NoopResult> { return noop(); }
/** Receipt evidence validated — no Brevo template. */
export function sendReceiptValidatedEmail(_donation: any): Promise<NoopResult> { return noop(); }
/** Payment requires review — no Brevo template. */
export function sendPaymentNeedsReviewEmail(_donation: any, _reason?: string): Promise<NoopResult> { return noop(); }
/** Payment rejected — no Brevo template. */
export function sendPaymentRejectedEmail(_donation: any, _reason: string): Promise<NoopResult> { return noop(); }

/** Payment confirmed → Template 12 (Donation Confirmation). */
export function sendPaymentConfirmedEmail(donation: any, campaignTitle: string) {
  return sendBrevoEmail(12, donation.donor_email, {
    donor_name: donation.donor_name,
    student_name: donation._ownerName ?? "the student",
    campaign_title: campaignTitle,
    donation_amount: formatNaira(donation.amount),
    donation_date: formatDate(donation.created_date || new Date().toISOString()),
    transaction_reference: donation.payment_reference,
  });
}
