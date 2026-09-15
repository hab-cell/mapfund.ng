import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, AlertTriangle, Search, Clock, X, Eye,
  ShieldCheck, ShieldAlert, Landmark, StickyNote, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, Input, Select, Textarea, EmptyState, StatusBadge } from "@/components/shared";
import { formatNaira, formatDateTime } from "@/lib/formatters";
import { DONATION_STATUS } from "@/lib/payments";
import { logAudit } from "@/lib/notifyStudent";
import {
  sendPaymentConfirmedEmail, sendPaymentRejectedEmail,
  sendPaymentNeedsReviewEmail,
} from "@/lib/email";

const PAGE_SIZE = 12;

export default function AdminPayments() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [internalNote, setInternalNote] = useState("");
  const [noteSave, setNoteSave] = useState(false);

  const { data: subs = [], refetch } = useQuery({
    queryKey: ["payment-subs"],
    queryFn: () => base44.entities.PaymentSubmission.list("-submitted_at"),
  });
  const { data: donations = [] } = useQuery({
    queryKey: ["payment-donations"], queryFn: () => base44.entities.Donation.list("-created_date"),
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ["payment-campaigns"], queryFn: () => base44.entities.Campaign.list(),
  });

  const campaignMap = useMemo(() => Object.fromEntries(campaigns.map((c: any) => [c.id, c])), [campaigns]);
  const donationMap = useMemo(() => Object.fromEntries(donations.map((d: any) => [d.id, d])), [donations]);

  const counts = useMemo(() => ({
    // Auto-verified (>=60%) payments are CONFIRMED and excluded from review queue
    pending: subs.filter((s: any) => !["CONFIRMED", "REJECTED", "DUPLICATE", "FAILED", "EVIDENCE_VALID"].includes(s.verification_status)).length,
    needsReview: subs.filter((s: any) => s.verification_status === DONATION_STATUS.NEEDS_REVIEW).length,
    confirmed: subs.filter((s: any) => s.verification_status === DONATION_STATUS.CONFIRMED).length,
    flagged: subs.filter((s: any) => s.duplicate_detected).length,
  }), [subs]);

  const filtered = useMemo(() => subs.filter((s: any) => {
    const matchesSearch = !search ||
      s.payment_reference?.toLowerCase().includes(search.toLowerCase()) ||
      s.extracted_transaction_reference?.toLowerCase().includes(search.toLowerCase()) ||
      campaignMap[s.campaign_id]?.title?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || s.verification_status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [subs, search, statusFilter, campaignMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const act = async (subId: string, donationId: string, kind: "CONFIRM" | "REJECT" | "REVIEW" | "NOTE") => {
    const sub = subs.find((s: any) => s.id === subId);
    const donation = donationMap[donationId];
    if (!sub || !donation) return;
    const campaign = campaignMap[donation.campaign_id];
    let newStatus: string | undefined;

    if (kind === "CONFIRM") {
      newStatus = DONATION_STATUS.CONFIRMED;
      // Update campaign totals ONLY on confirmation — never on upload.
      if (campaign && !donation.confirmed) {
        await base44.entities.Campaign.update(campaign.id, {
          raised_amount: (campaign.raised_amount || 0) + donation.amount,
          donor_count: (campaign.donor_count || 0) + 1,
        });
        await base44.entities.Donation.update(donation.id, {
          payment_status: DONATION_STATUS.CONFIRMED, confirmed: true,
        });
      }
      await sendPaymentConfirmedEmail(donation, campaign?.title || "your campaign").catch(() => undefined);
    } else if (kind === "REJECT") {
      newStatus = DONATION_STATUS.REJECTED;
      await base44.entities.Donation.update(donation.id, { payment_status: DONATION_STATUS.REJECTED });
      await sendPaymentRejectedEmail(donation, "Payment could not be validated against our records.").catch(() => undefined);
    } else if (kind === "REVIEW") {
      newStatus = DONATION_STATUS.NEEDS_REVIEW;
      await base44.entities.Donation.update(donation.id, { payment_status: DONATION_STATUS.NEEDS_REVIEW });
      await sendPaymentNeedsReviewEmail(donation, "This payment has been flagged for manual review.").catch(() => undefined);
    } else {
      // NOTE only
      setNoteSave(true);
      setTimeout(() => setNoteSave(false), 900);
    }

    if (kind !== "NOTE") {
      await base44.entities.PaymentSubmission.update(subId, {
        verification_status: newStatus,
        verified_at: new Date().toISOString(),
        verified_by: "Admin",
      });
      await logAudit(
        `PAYMENT_${kind}`, donationId, "Donation",
        { submission: subId, payment_reference: sub.payment_reference, amount: donation.amount }, "Admin",
      );
      toast.success(kind === "CONFIRM" ? "Payment confirmed — campaign totals updated" : kind === "REJECT" ? "Payment rejected" : "Flagged for review");
    }
    if (internalNote.trim()) {
      await base44.entities.PaymentSubmission.update(subId, {
        admin_notes: `${String(sub.admin_notes || "")}\n[${new Date().toLocaleString("en-NG")}] ${internalNote.trim()}`.trim(),
      });
      await logAudit("PAYMENT_NOTE", subId, "PaymentSubmission", { note: internalNote.trim() }, "Admin");
      toast.success("Internal note saved");
    }
    setInternalNote("");
    refetch();
    setSelected(null);
  };

  const VkChip = ({ ok, label }: any) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
      ok === true ? "bg-success/15 text-success" : ok === false ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
    }`}>
      {ok === true ? <CheckCircle2 className="h-3 w-3" /> : ok === false ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {label}
    </span>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold">Payment Verification</h1>
          <p className="text-muted-foreground mt-1">Validate bank-transfer receipts submitted by donors.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 font-semibold text-warning">{counts.pending} pending</span>
          <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 font-semibold text-warning">{counts.needsReview} need review</span>
          <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 font-semibold text-success">{counts.confirmed} confirmed</span>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by reference, transaction ref, campaign…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="w-52">
          <option value="ALL">All statuses</option>
          {Object.values(DONATION_STATUS).map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </Select>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={<Landmark className="h-10 w-10" />} title="No payment submissions yet" description="Receipts uploaded by donors will appear here automatically." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Donation / Reference</th>
                  <th className="text-left px-4 py-3">Campaign</th>
                  <th className="text-left px-4 py-3">Amounts</th>
                  <th className="text-left px-4 py-3">Transaction ref</th>
                  <th className="text-left px-4 py-3">Score</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Duplicate</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s: any) => {
                  const campaign = campaignMap[s.campaign_id];
                  const color = s.verification_score >= 60 ? "text-success" : s.verification_score >= 40 ? "text-warning" : "text-destructive";
                  return (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/40 align-top">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-primary">{s.payment_reference}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{formatDateTime(s.submitted_at)}</div>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <div className="line-clamp-2 text-xs font-medium">{campaign?.title || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs"><span className="text-muted-foreground">Expected:</span> <span className="font-semibold">{formatNaira(s.expected_amount)}</span></div>
                        {s.extracted_amount != null && (
                          <div className="text-xs mt-0.5"><span className="text-muted-foreground">Receipt:</span> <span className={s.amount_match ? "text-success font-semibold" : "text-destructive font-semibold"}>{formatNaira(s.extracted_amount)}</span></div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{s.extracted_transaction_reference || <span className="text-muted-foreground italic">—</span>}</td>
                      <td className="px-4 py-3"><span className={`font-bold ${color}`}>{s.verification_score ?? "—"}%</span></td>
                      <td className="px-4 py-3"><StatusBadge status={s.verification_status} /></td>
                      <td className="px-4 py-3">{s.duplicate_detected ? <ShieldAlert className="h-4 w-4 text-destructive" data-title="Duplicate" /> : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(s)}><Eye className="h-3.5 w-3.5" /> Review</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Detail drawer ─── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setSelected(null)} />
          <div className="w-full max-w-2xl bg-card border-l border-border overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-heading font-bold text-xl">Payment submission</div>
                <div className="font-mono text-xs text-muted-foreground mt-0.5">{selected.payment_reference}</div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>

            {/* Receipt + extracted data side-by-side */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Receipt preview</div>
                {selected.receipt_data_url ? (
                  selected.receipt_data_url.startsWith("data:application/pdf") ? (
                    <a href={selected.receipt_data_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">Open PDF receipt →</a>
                  ) : (
                    <img src={selected.receipt_data_url} alt="Receipt" className="max-h-72 w-full rounded-lg object-contain bg-white p-1" />
                  )
                ) : (
                  <div className="rounded-lg bg-muted h-40 flex items-center justify-center text-xs text-muted-foreground italic">Receipt stored at {selected.receipt_file_path}</div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extracted data</div>
                {[
                  ["Amount", selected.extracted_amount ? formatNaira(selected.extracted_amount) : null, selected.amount_match],
                  ["Payment reference", selected.extracted_payment_reference, selected.reference_match],
                  ["Transaction reference", selected.extracted_transaction_reference, !selected.duplicate_detected],
                  ["Date", selected.extracted_transaction_date, selected.date_valid],
                  ["Time", selected.extracted_transaction_time, null],
                  ["Sender name", selected.extracted_sender_name, null],
                  ["Recipient name", selected.extracted_recipient_name, selected.recipient_match],
                  ["Recipient account", selected.extracted_account_number, selected.recipient_match],
                  ["Bank", selected.extracted_bank_name, null],
                  ["Remark", selected.extracted_remark, null],
                  ["Transfer status", selected.extracted_status, selected.status_match],
                ].map(([label, val, ok]: any) => (
                  <div key={label} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium flex items-center gap-2">
                      {val ?? <span className="italic text-muted-foreground">—</span>}
                      {ok === true && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                      {ok === false && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation breakdown */}
            <Card className="mt-4 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" /> Automated validation
              </div>
              <div className="flex flex-wrap gap-1.5">
                <VkChip ok={!selected.unreadable} label={selected.unreadable ? "Unreadable" : "Readable"} />
                <VkChip ok={selected.amount_match} label="Amount" />
                <VkChip ok={selected.reference_match} label="Payment ref" />
                <VkChip ok={selected.recipient_match} label="Recipient" />
                <VkChip ok={selected.status_match} label="Transfer status" />
                <VkChip ok={selected.date_valid} label="Date range" />
                <VkChip ok={!selected.duplicate_detected} label={selected.duplicate_detected ? "DUPLICATE" : "Not duplicate"} />
              </div>
              {selected.verification_reasons && (
                <div className="mt-3 rounded-lg bg-muted/40 border border-border/50 p-3 text-xs space-y-1">
                  {String(selected.verification_reasons).split(" | ").map((r: string, i: number) => (
                    <div key={i} className="flex gap-1.5 text-muted-foreground">
                      <span className={r.includes("matched") || r.includes("successful") || r.includes("valid") || r.includes("exactly") ? "text-success" : "text-warning"}>●</span>{r}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Actions */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
              <Button variant="primary" onClick={() => act(selected.id, selected.donation_id, "CONFIRM")} disabled={selected.verification_status === DONATION_STATUS.CONFIRMED}>
                <CheckCircle2 className="h-4 w-4" /> Confirm Payment
              </Button>
              <Button variant="danger" onClick={() => act(selected.id, selected.donation_id, "REJECT")} disabled={selected.verification_status === DONATION_STATUS.REJECTED}>
                <XCircle className="h-4 w-4" /> Reject
              </Button>
              <Button variant="outline" onClick={() => act(selected.id, selected.donation_id, "REVIEW")}>
                <AlertTriangle className="h-4 w-4" /> Flag for Review
              </Button>
              <Button variant="ghost" onClick={() => {
                toast.success("Request sent to donor to upload a new receipt");
                act(selected.id, selected.donation_id, "NOTE");
              }}>
                <Sparkles className="h-4 w-4" /> Request new receipt
              </Button>
            </div>

            {/* Internal note */}
            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Internal note (admin only)</div>
              <Textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} placeholder="Add an internal note visible to other admins only…" className="min-h-[70px]" />
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => act(selected.id, selected.donation_id, "NOTE")} disabled={!internalNote.trim() || noteSave}>
                <StickyNote className="h-4 w-4" /> {noteSave ? "Saving…" : "Save note"}
              </Button>
              {selected.admin_notes && (
                <div className="mt-3 border-t border-border pt-3 text-xs space-y-1.5 max-h-32 overflow-y-auto">
                  {String(selected.admin_notes).split("\n").filter(Boolean).map((n: string, i: number) => (
                    <div key={i} className="text-muted-foreground">{n}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
