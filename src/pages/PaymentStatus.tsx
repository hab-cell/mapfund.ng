import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, Clock, XCircle, AlertTriangle, ShieldAlert, GraduationCap, Home, Copy, RefreshCw, Landmark, Upload, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card } from "@/components/shared";
import { formatNaira, formatDateTime } from "@/lib/formatters";
import { DONATION_STATUS } from "@/lib/payments";

function Confetti() {
  const colors = ["#f59e0b", "#16a34a", "#eab308", "#22c55e", "#059669", "#facc15", "#84cc16", "#fbbf24"];
  return (
    <>
      {Array.from({ length: 80 }).map((_, i) => (
        <div key={i} className="confetti" style={{
          left: `${Math.random() * 100}%`,
          background: colors[i % colors.length],
          animationDelay: `${Math.random() * 3}s`,
          animationDuration: `${2.5 + Math.random() * 2.5}s`,
          width: `${6 + Math.random() * 8}px`,
          height: `${6 + Math.random() * 8}px`,
        }} />
      ))}
    </>
  );
}

export default function PaymentStatus() {
  const [sp] = useSearchParams();
  const ref = sp.get("ref");
  const [donation, setDonation] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!ref) { setLoading(false); return; }
    const ds = await base44.entities.Donation.filter({ payment_reference: ref });
    const d = ds[0];
    setDonation(d || null);
    if (d) {
      if (d.campaign_id && !campaign) setCampaign(await base44.entities.Campaign.get(d.campaign_id));
      const subs = await base44.entities.PaymentSubmission.filter({ donation_id: d.id }, "-created_date");
      setSubmission(subs[0] || null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const stop = setTimeout(() => {}, 0); return () => clearTimeout(stop);
  }, [ref]);

  const status = donation?.payment_status || "PENDING_PAYMENT";
  const copying = async () => {
    if (!donation) return;
    await navigator.clipboard.writeText(donation.payment_reference);
    toast.success("Reference copied");
  };

  const statusConfig: Record<string, { icon: any; color: string; bg: string; title: string; desc: string }> = {
    PENDING_PAYMENT: {
      icon: Clock, color: "text-warning", bg: "bg-warning/15",
      title: "Awaiting bank transfer",
      desc: "Make your transfer using the bank account below and paste the payment reference into the Remark/Description field of your bank app.",
    },
    RECEIPT_UPLOADED: { icon: Upload, color: "text-primary", bg: "bg-primary/15", title: "Receipt received", desc: "Your receipt has been received and is queued for automated scanning." },
    SCANNING_RECEIPT: { icon: RefreshCw, color: "text-primary", bg: "bg-primary/15", title: "Scanning receipt", desc: "Our system is extracting the transaction details from your receipt." },
    EVIDENCE_VALID: { icon: CheckCircle2, color: "text-success", bg: "bg-success/15", title: "Evidence valid — awaiting confirmation", desc: "Your receipt passed all automated checks. This confirms the receipt is valid." },
    NEEDS_REVIEW: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/15", title: "Payment requires review", desc: "Verification score is below 60%. An administrator will review your receipt and get back to you." },
    CONFIRMED: { icon: CheckCircle2, color: "text-success", bg: "bg-success/15", title: "Payment Verified ✓", desc: "Your payment receipt has been successfully verified and your donation has been confirmed." },
    REJECTED: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/15", title: "Payment evidence rejected", desc: "The receipt could not be validated. Please review the reason below and upload a clearer, genuine receipt." },
    DUPLICATE: { icon: ShieldAlert, color: "text-destructive", bg: "bg-destructive/15", title: "Duplicate payment detected", desc: "This receipt or transaction reference has already been used for another donation and cannot be accepted." },
    FAILED: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/15", title: "Payment failed", desc: "Your payment did not go through. Please try again." },
    REFUNDED: { icon: RefreshCw, color: "text-muted-foreground", bg: "bg-muted", title: "Payment refunded", desc: "Your payment has been refunded to your account." },
  };

  const cfg = statusConfig[status] || statusConfig.PENDING_PAYMENT;
  const Icon = cfg.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/10 flex items-center justify-center p-4">
      {status === "CONFIRMED" && <Confetti />}
      <div className="w-full max-w-lg">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground"><GraduationCap className="h-5 w-5" /></div>
          <div className="font-heading text-2xl font-bold">MapFund</div>
        </Link>

        {loading ? (
          <Card className="p-12 text-center text-muted-foreground">Checking payment status…</Card>
        ) : !donation ? (
          <Card className="p-12 text-center">
            <XCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <div>No donation found for this reference.</div>
            <Link to="/campaigns"><Button className="mt-4" size="sm">Back to campaigns</Button></Link>
          </Card>
        ) : (
          <Card className="p-8 text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${cfg.bg} ${cfg.color} mb-5`}>
                <Icon className="h-10 w-10" />
              </div>
              <h1 className="font-heading text-2xl font-bold">{cfg.title}</h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{cfg.desc}</p>

              {/* Summary card */}
              <div className="mt-5 rounded-xl bg-muted/40 border border-border/60 p-4 text-left space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Donation amount</span><span className="font-bold text-primary">{formatNaira(donation.amount)}</span></div>
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground">Payment reference</span>
                  <button onClick={copying} className="font-mono font-semibold inline-flex items-center gap-1.5 text-primary hover:text-primary-dark">
                    {donation.payment_reference} <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Initiated</span><span>{formatDateTime(donation.created_date)}</span></div>
                {submission?.submitted_at && <div className="flex justify-between"><span className="text-muted-foreground">Receipt submitted</span><span>{formatDateTime(submission.submitted_at)}</span></div>}
                {campaign && <div className="flex justify-between"><span className="text-muted-foreground">Campaign</span><span className="font-medium line-clamp-1">{campaign.title}</span></div>}
              </div>

              {/* Verification reasons (rejected/duplicate/needs_review) */}
              {submission?.verification_reasons && ["REJECTED", "DUPLICATE", "NEEDS_REVIEW"].includes(status) && (
                <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-left text-xs space-y-1">
                  <div className="font-semibold text-destructive">Why this needs attention:</div>
                  {String(submission.verification_reasons).split(" | ").slice(0, 4).map((r: string, i: number) => (
                    <div key={i} className="text-muted-foreground flex gap-1.5"><span className="text-destructive">•</span>{r}</div>
                  ))}
                </div>
              )}

              {/* Bank details for pending */}
              {status === DONATION_STATUS.PENDING_PAYMENT && (
                <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left text-sm">
                  <div className="font-semibold inline-flex items-center gap-1.5 mb-2"><Landmark className="h-4 w-4 text-primary" /> Transfer to MapFund account</div>
                  <div className="text-muted-foreground text-xs">
                    Use these details from the payment page, or return to the checkout flow to view them.
                  </div>
                  <Link to={`/payment?campaign_id=${donation.campaign_id}`} className="mt-2 block text-xs text-primary font-medium hover:underline">
                    Continue to payment instructions →
                  </Link>
                </div>
              )}

              {/* Receipt preview for review states */}
              {submission?.receipt_data_url && ["NEEDS_REVIEW", "EVIDENCE_VALID"].includes(status) && (
                <div className="mt-4 text-left">
                  <div className="text-xs font-semibold text-muted-foreground mb-1.5 inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Receipt preview</div>
                  {submission.receipt_file_path?.endsWith(".pdf") || submission.receipt_data_url.startsWith("data:application/pdf") ? (
                    <a href={submission.receipt_data_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open PDF receipt →</a>
                  ) : (
                    <img src={submission.receipt_data_url} alt="Receipt" className="rounded-lg border border-border max-h-64 w-full object-contain bg-white p-1" />
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex flex-col gap-2">
                {["REJECTED", "DUPLICATE", "FAILED"].includes(status) && (
                  <Link to={`/payment?campaign_id=${donation.campaign_id}`}>
                    <Button className="w-full">Try again with a new receipt</Button>
                  </Link>
                )}
                <Link to="/">
                  <Button variant="outline" className="w-full">
                    <Home className="h-4 w-4" /> Return home
                  </Button>
                </Link>
              </div>

              <div className="mt-5 text-[10px] text-muted-foreground">
                Receipt uploaded ⌁ Payment confirmed — your funds are only confirmed after validation and administrator confirmation.
              </div>
            </motion.div>
          </Card>
        )}
      </div>
    </div>
  );
}
