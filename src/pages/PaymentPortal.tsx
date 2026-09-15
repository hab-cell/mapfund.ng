import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  ArrowLeft, Copy, CheckCircle2, Upload, FileText, Landmark, UploadCloud,
  ShieldAlert, Eye, EyeOff, GraduationCap, RefreshCw, AlertTriangle, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, Input, StatusBadge } from "@/components/shared";
import { formatNaira } from "@/lib/formatters";
import {
  generatePaymentReference, hashFile, getPaymentSettings, storeReceiptFile,
  parseReceiptText, validatePaymentSubmission,
  DONATION_STATUS,
} from "@/lib/payments";
import { analyzeReceipt } from "@/lib/ocr";
import {
  sendPaymentInstructionsEmail, sendReceiptReceivedEmail,
  sendReceiptValidatedEmail, sendPaymentNeedsReviewEmail,
  sendPaymentRejectedEmail, sendPaymentConfirmedEmail,
  sendDonationReceivedEmail, sendDonationConfirmationEmail,
} from "@/lib/email";

const QUICK_AMOUNTS = [1000, 2500, 5000, 10000, 25000, 50000];
const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];

type Step = 1 | 2 | 3 | 4;

function StepIndicator({ step }: { step: Step }) {
  const steps = ["Amount", "Reference & Transfer", "Upload Receipt", "Verification"];
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === step, done = n < step;
        return (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
              done ? "bg-success text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            }`}>{done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}</div>
            <span className={`text-[10px] sm:text-xs hidden xs:block ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
            {n < steps.length && <div className={`h-0.5 flex-1 rounded ${done ? "bg-success" : "bg-muted"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function PaymentPortal() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const campaign_id = sp.get("campaign_id") || "";

  const [step, setStep] = useState<Step>(1);
  const [campaign, setCampaign] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [amount, setAmount] = useState(5000);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [anon, setAnon] = useState(false);
  const [donation, setDonation] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [validation, setValidation] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if (campaign_id) setCampaign(await base44.entities.Campaign.get(campaign_id));
      setSettings(await getPaymentSettings());
    })();
  }, [campaign_id]);

  // ── STEP 1 → Initiate donation with unique payment reference ──
  const initiate = async () => {
    if (!campaign_id || !campaign) return toast.error("No campaign selected");
    if (!amount || amount < 100) return toast.error("Minimum donation is ₦100");
    if (!anon && !name.trim()) return toast.error("Please enter your name");
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return toast.error("Please enter a valid email");

    setProcessing(true);
    try {
      const reference = await generatePaymentReference();
      // Anti-fraud: record the exact amount the donor committed to. It cannot be edited later.
      const created = await base44.entities.Donation.create({
        campaign_id,
        donor_name: anon ? "Anonymous" : name.trim(),
        donor_email: email.trim(),
        amount,
        is_anonymous: anon,
        message: message.trim() || null,
        payment_reference: reference,
        payment_status: DONATION_STATUS.PENDING_PAYMENT,
        created_at: new Date().toISOString(),
      });
      setDonation(created);
      await base44.entities.AuditLog.create({
        actor_name: email.trim(), action: "DONATION_INITIATED",
        target_id: created.id, target_type: "Donation",
        metadata: JSON.stringify({ payment_reference: reference, amount, campaign_id }),
      });
      toast.success(`Payment reference generated: ${reference}`);
      // Email the instructions (non-blocking)
      sendPaymentInstructionsEmail(created).catch(() => undefined);
      setStep(2);
    } finally {
      setProcessing(false);
    }
  };

  const copyReference = async () => {
    if (!donation) return;
    await navigator.clipboard.writeText(donation.payment_reference);
    setCopied(true);
    toast.success("Reference copied — paste it in the Remark/Description field of your transfer");
    setTimeout(() => setCopied(false), 2500);
  };

  // ── STEP 3 → Upload + scan + validate receipt ──
  const handleFile = async (file?: File) => {
    if (!file || !donation) return;
    const maxBytes = (settings?.max_size_mb ?? 8) * 1024 * 1024;
    if (!ACCEPTED.includes(file.type)) return toast.error("Unsupported file. Accepted: JPG, JPEG, PNG, WEBP, PDF");
    if (file.size > maxBytes) return toast.error(`File exceeds the ${settings?.max_size_mb ?? 8} MB limit`);
    setScanning(true);
    setStep(4);

    try {
      // Fingerprint for duplicate detection
      const fileHash = await hashFile(file);

      // Store the receipt (Supabase Storage → local fallback)
      const stored = await storeReceiptFile(donation.id, file);

      // Create submission record — receipt_uploaded state first
      const createdSub = await base44.entities.PaymentSubmission.create({
        donation_id: donation.id,
        campaign_id: donation.campaign_id,
        payment_reference: donation.payment_reference,
        expected_amount: donation.amount,
        receipt_file_path: stored.path,
        receipt_data_url: stored.dataUrl || null,
        file_hash: fileHash,
        verification_status: DONATION_STATUS.RECEIPT_UPLOADED,
        submitted_at: new Date().toISOString(),
      });
      await base44.entities.Donation.update(donation.id, { payment_status: DONATION_STATUS.RECEIPT_UPLOADED });
      sendReceiptReceivedEmail(donation).catch(() => undefined);

      // SCANNING (OCR)
      await base44.entities.PaymentSubmission.update(createdSub.id, { verification_status: DONATION_STATUS.SCANNING_RECEIPT });
      await base44.entities.Donation.update(donation.id, { payment_status: DONATION_STATUS.SCANNING_RECEIPT });
      const ocr = await analyzeReceipt(file);
      const extracted = parseReceiptText(ocr.text, ocr.confidence);

      // VALIDATION
      const result = await validatePaymentSubmission({
        donation, submission: { ...createdSub, file_hash: fileHash },
        extracted, settings,
      });
      setValidation(result);

      // Persist extraction + validation results
      const nowIso = new Date().toISOString();
      const autoConfirmed = result.status === DONATION_STATUS.CONFIRMED;
      const submissionUpdate = {
        extracted_amount: extracted.amount ?? null,
        extracted_transaction_reference: extracted.transactionReference ?? null,
        extracted_payment_reference: extracted.paymentReference ?? null,
        extracted_transaction_date: extracted.transactionDate ?? null,
        extracted_transaction_time: extracted.transactionTime ?? null,
        extracted_sender_name: extracted.senderName ?? null,
        extracted_recipient_name: extracted.recipientName ?? null,
        extracted_bank_name: extracted.bankName ?? null,
        extracted_account_number: extracted.recipientAccountNumber ?? null,
        extracted_remark: extracted.remark ?? null,
        extracted_status: extracted.transferStatus ?? null,
        verification_score: result.score,
        amount_match: result.amountMatch,
        reference_match: result.referenceMatch,
        recipient_match: result.recipientMatch,
        status_match: result.statusMatch,
        date_valid: result.dateValid,
        duplicate_detected: result.duplicateDetected,
        ocr_confidence: extracted.confidence,
        ocr_source: ocr.source,
        verification_status: result.status,
        verification_reasons: result.reasons.join(" | "),
        verification_method: result.verification_method || null,
        verified_at: autoConfirmed ? nowIso : null,
        verified_by: autoConfirmed ? "automatic_threshold_60" : null,
      };
      await base44.entities.PaymentSubmission.update(createdSub.id, submissionUpdate);

      // Final donation status comes from the validation engine (not the browser)
      const donationUpdate: any = {
        payment_status: result.status,
        verification_score: result.score,
        verification_method: result.verification_method || null,
      };
      if (autoConfirmed) {
        donationUpdate.confirmed = true;
        donationUpdate.verified_at = nowIso;
      }
      await base44.entities.Donation.update(donation.id, donationUpdate);

      // Auto-confirmed donations update campaign totals immediately (no admin queue)
      if (autoConfirmed && campaign && !donation.confirmed) {
        await base44.entities.Campaign.update(campaign.id, {
          raised_amount: (campaign.raised_amount || 0) + donation.amount,
          donor_count: (campaign.donor_count || 0) + 1,
        });
      }

      setDonation((d: any) => ({ ...d, payment_status: result.status, _lastScore: result.score, confirmed: autoConfirmed }));

      // Emails by outcome (never blocking)
      const d2 = { ...donation, _lastScore: result.score, payment_status: result.status };
      if (autoConfirmed) {
        // Auto-verified (>=60%): confirmation notifications only (no review email)
        sendPaymentConfirmedEmail(d2, campaign?.title || "your campaign").catch(() => undefined);
        sendDonationConfirmationEmail(
          { email: donation.donor_email, name: donation.donor_name },
          { full_name: campaign?.student_name || "the student" },
          campaign || { title: "your campaign" },
          d2,
        ).catch(() => undefined);
        // Notify campaign owner if we can resolve the profile later in admin flows.
        void sendDonationReceivedEmail;
      } else if (result.status === DONATION_STATUS.NEEDS_REVIEW) {
        sendPaymentNeedsReviewEmail(d2, result.reasons[0]).catch(() => undefined);
      } else if (result.status === DONATION_STATUS.EVIDENCE_VALID) {
        sendReceiptValidatedEmail(d2).catch(() => undefined);
      } else {
        sendPaymentRejectedEmail(d2, result.reasons[0] || "Could not validate receipt").catch(() => undefined);
      }
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong while processing your receipt");
      setStep(3);
    } finally {
      setScanning(false);
    }
  };

  const restartReceipt = () => { setValidation(null); setStep(3); };

  const goToStatus = () => {
    nav(donation ? `/payment-status?ref=${donation.payment_reference}` : "/donor");
  };

  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center text-muted-foreground">Loading campaign…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/10">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Link to={`/campaigns/${campaign_id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to campaign
        </Link>
        <div className="flex items-center gap-2 mb-6">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground"><GraduationCap className="h-5 w-5" /></div>
          <div className="font-heading text-2xl font-bold">MapFund Secure Donation</div>
        </div>

        <StepIndicator step={step} />

        {/* ────────── STEP 1: Amount ────────── */}
        {step === 1 && (
          <div className="grid gap-6 md:grid-cols-[1fr_320px]">
            <Card className="p-6">
              <h1 className="font-heading text-2xl font-bold mb-1">Support {campaign.title}</h1>
              <p className="text-sm text-muted-foreground mb-6">Bank transfer only. No card payments, USSD or wallets.</p>

              <label className="text-sm font-medium">Donation amount</label>
              <div className="mt-2 grid grid-cols-3 gap-2 mb-3">
                {QUICK_AMOUNTS.map(a => (
                  <button key={a} type="button" onClick={() => setAmount(a)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${amount === a ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
                    {formatNaira(a)}
                  </button>
                ))}
              </div>
              <Input type="number" value={amount || ""} onChange={e => setAmount(Number(e.target.value))} min={100} />
              <div className="mt-2 rounded-lg bg-secondary/10 border border-secondary/30 p-2.5 text-xs">
                <strong className="text-foreground">Note:</strong> The amount selected here is locked once your payment reference is generated and cannot be changed later.
              </div>

              <label className="text-sm font-medium mt-5 block">Your details</label>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} disabled={anon} />
                <Input type="email" placeholder="Email (for updates)" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <Input placeholder="Message of encouragement (optional)" value={message} onChange={e => setMessage(e.target.value)} className="mt-3" />
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} className="rounded" />
                Donate anonymously
              </label>

              <Button size="lg" className="w-full mt-6" onClick={initiate} disabled={processing}>
                <Landmark className="h-4 w-4" /> {processing ? "Generating reference…" : `Continue with ${formatNaira(amount)}`}
              </Button>
            </Card>

            <Card className="p-5 h-fit">
              <div className="text-xs uppercase text-muted-foreground font-semibold">Summary</div>
              <div className="mt-2 font-heading font-semibold text-lg line-clamp-2">{campaign.title}</div>
              <div className="mt-5 border-t border-border pt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Donation</span><span>{formatNaira(amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fees</span><span>₦0</span></div>
                <div className="flex justify-between font-heading font-bold text-base pt-2 border-t border-border">
                  <span>Total</span><span className="text-primary">{formatNaira(amount)}</span>
                </div>
              </div>
              <div className="mt-4 text-[10px] text-muted-foreground">Bank transfer only • Every naira is tracked</div>
            </Card>
          </div>
        )}

        {/* ────────── STEP 2: Reference + transfer instructions ────────── */}
        {step === 2 && donation && settings && (
          <div className="grid gap-6 md:grid-cols-[1fr_320px]">
            <Card className="p-6">
              <h1 className="font-heading text-2xl font-bold mb-4">Bank transfer instructions</h1>

              {/* The unique payment reference */}
              <div className="rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 p-5 text-center">
                <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground font-semibold">Payment Reference</div>
                <div className="mt-1 font-mono text-3xl font-bold text-primary tracking-wide">{donation.payment_reference}</div>
                <Button onClick={copyReference} variant={copied ? "secondary" : "primary"} className="mt-3">
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy Reference"}
                </Button>
                <p className="mt-3 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  {settings.instructions}
                </p>
              </div>

              {/* Bank details */}
              <div className="mt-5 rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transfer to</div>
                <div className="divide-y divide-border text-sm">
                  <div className="flex justify-between px-4 py-3"><span className="text-muted-foreground">Bank name</span><span className="font-semibold">{settings.bank_name}</span></div>
                  <div className="flex justify-between px-4 py-3"><span className="text-muted-foreground">Account name</span><span className="font-semibold">{settings.account_name}</span></div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-muted-foreground">Account number</span>
                    <span className="font-mono font-semibold inline-flex items-center gap-2">
                      {showAccount ? settings.account_number : "••••••" + settings.account_number.slice(-4)}
                      <button onClick={() => setShowAccount(v => !v)} className="text-primary hover:text-primary-dark" title={showAccount ? "Hide account" : "Show account"}>
                        {showAccount ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-3"><span className="text-muted-foreground">Amount</span><span className="font-bold text-primary">{formatNaira(donation.amount)}</span></div>
                </div>
              </div>

              <div className="mt-5 space-y-2 text-sm">
                <div className="font-semibold">How to complete your donation:</div>
                <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
                  <li>Open your banking app and start a transfer to the account above.</li>
                  <li>Enter exactly <strong className="text-foreground">{formatNaira(donation.amount)}</strong>.</li>
                  <li><strong className="text-foreground">Paste your payment reference</strong> into the <em>Remark / Description</em> field.</li>
                  <li>Complete the transfer, then come back and upload your receipt below.</li>
                </ol>
              </div>

              <Button size="lg" className="w-full mt-6" onClick={() => setStep(3)}>
                I've made the transfer — upload receipt <Upload className="h-4 w-4" />
              </Button>
            </Card>

            <Card className="p-5 h-fit">
              <div className="text-xs uppercase text-muted-foreground font-semibold">Donation summary</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Campaign</span><span className="font-medium text-right line-clamp-1 ml-3">{campaign.title}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Donor</span><span>{donation.is_anonymous ? "Anonymous" : donation.donor_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount (locked)</span><span className="font-semibold">{formatNaira(donation.amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono text-xs">{donation.payment_reference}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={donation.payment_status} /></div>
              </div>
              <div className="mt-4 rounded-lg bg-success/10 border border-success/30 p-3 text-xs text-success flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                An email with these instructions has been sent to {donation.donor_email}.
              </div>
            </Card>
          </div>
        )}

        {/* ────────── STEP 3: Receipt upload ────────── */}
        {step === 3 && donation && (
          <Card className="p-6 max-w-2xl mx-auto">
            <h1 className="font-heading text-2xl font-bold mb-1">Upload your payment receipt</h1>
            <p className="text-sm text-muted-foreground mb-5">
              After completing your transfer, upload a screenshot or PDF of the bank receipt / debit alert here.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <div className="rounded-2xl bg-primary/10 p-4 text-primary"><UploadCloud className="h-10 w-10" /></div>
              <div className="mt-4 font-semibold">Drag & drop your receipt here</div>
              <div className="mt-1 text-sm text-muted-foreground">or tap to choose a file (preferably a screenshot)</div>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> JPG, JPEG, PNG, WEBP or PDF • Max {settings?.max_size_mb ?? 8} MB
              </div>
              <input ref={fileInputRef} type="file" accept={ACCEPTED.join(",")} className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
            </div>

            <Button size="lg" className="w-full mt-5" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Choose receipt file
            </Button>

            <p className="mt-4 text-xs text-center text-muted-foreground">
              No manual entry needed — our scanner reads the amount, date, transaction reference and remark from the receipt itself.
            </p>
          </Card>
        )}

        {/* ────────── STEP 4: Scanning + validation result ────────── */}
        {step === 4 && donation && (
          <Card className="p-6 max-w-2xl mx-auto">
            {scanning || !validation ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="relative">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-muted border-t-primary" />
                  <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
                </div>
                <h1 className="font-heading text-2xl font-bold mt-6">Scanning your receipt…</h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                  Reading transaction amount, date, references and transfer status. This takes a few seconds.
                </p>
              </div>
            ) : (
              <ValidationResultView
                validation={validation}
                donation={donation}
                onRestart={restartReceipt}
                onStatus={goToStatus}
              />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// Result view after automated validation
function ValidationResultView({ validation, donation, onRestart, onStatus }: any) {
  const s = validation.status;
  const isConfirmed = s === DONATION_STATUS.CONFIRMED;
  const isGreen = isConfirmed || s === DONATION_STATUS.EVIDENCE_VALID;
  const isYellow = s === DONATION_STATUS.NEEDS_REVIEW;

  const icon = isGreen
    ? <CheckCircle2 className="h-12 w-12 text-success" />
    : isYellow
      ? <AlertTriangle className="h-12 w-12 text-warning" />
      : <ShieldAlert className="h-12 w-12 text-destructive" />;

  const headline = isConfirmed
    ? "Payment Verified ✓"
    : isGreen
      ? "Evidence Valid — Ready for Confirmation"
      : isYellow
        ? "Payment Requires Review"
        : s === DONATION_STATUS.DUPLICATE
          ? "Duplicate Payment Detected"
          : "Payment Evidence Invalid";

  const checks: { label: string; pass: boolean | null }[] = [
    { label: "Receipt readable", pass: !validation.unreadable },
    { label: "Amount matched", pass: validation.amountMatch },
    { label: "Payment reference matched", pass: validation.referenceMatch },
    { label: "Recipient matched", pass: validation.recipientMatch },
    { label: "Transfer status successful", pass: validation.statusMatch },
    { label: "Transaction date valid", pass: validation.dateValid },
    { label: "Not a duplicate submission", pass: !validation.duplicateDetected },
  ];

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        {icon}
        <div className="mt-4 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          Verification Score: {validation.score}%
        </div>
        <h1 className="font-heading text-2xl font-bold mt-2">{headline}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          {isConfirmed
            ? "Your payment receipt has been successfully verified and your donation has been confirmed."
            : isGreen
              ? "Your payment evidence passed automated checks. This confirms the receipt is valid — the funds will be confirmed by an administrator shortly."
              : isYellow
                ? "Some details couldn't be verified automatically. An administrator will review your receipt and confirm your payment."
                : (validation.reasons?.[0] || "We couldn't validate this receipt. Please try again with a clearer image of a successful transfer.")}
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-border overflow-hidden text-sm">
        {checks.map(c => (
          <div key={c.label} className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-0">
            <span className="text-muted-foreground">{c.label}</span>
            {c.pass
              ? <CheckCircle2 className="h-4 w-4 text-success" />
              : <XCircle className="h-4 w-4 text-destructive" />}
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={onRestart}>
          <RefreshCw className="h-4 w-4" /> Upload a different receipt
        </Button>
        <Button onClick={onStatus}>
          Track my donation status
        </Button>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground text-center">
        Reference: <span className="font-mono">{donation.payment_reference}</span> •
        Receipt uploaded <span className="font-medium">≠ Payment confirmed</span>. Funds are confirmed only after receipt validation and admin confirmation.
      </p>
    </div>
  );
}

// compact icon
function XCircle({ className }: { className?: string }) {
  return <span className={className}>✕</span>;
}
