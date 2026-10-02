// Donation payment utilities for MapFund
// Unique references, receipt parsing, validation, duplicate detection, scoring.

import { base44 } from "@/api/base44Client";

// ─── Donation status system ────────────────────────────────────────────────
export const DONATION_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  RECEIPT_UPLOADED: "RECEIPT_UPLOADED",
  SCANNING_RECEIPT: "SCANNING_RECEIPT",
  EVIDENCE_VALID: "EVIDENCE_VALID",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  DUPLICATE: "DUPLICATE",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type DonationStatus = keyof typeof DONATION_STATUS;

// A donation is financially "successful" when either legacy SUCCESS or CONFIRMED
export const SUCCESS_STATUSES = ["SUCCESS", "CONFIRMED"];

// ─── Unique payment reference ──────────────────────────────────────────────
// Format: MAP-YYYYMMDD-XXXXX (5 uppercase alphanumerics, ambiguous chars removed)
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newReferenceToken(): string {
  let token = "";
  for (let i = 0; i < 5; i++) token += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  return token;
}

export async function generatePaymentReference(): Promise<string> {
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const ref = `MAP-${datePart}-${newReferenceToken()}`;
    const existing = await base44.entities.Donation.filter({ payment_reference: ref });
    if (existing.length === 0) return ref;
  }
  // Astronomically unlikely — add entropy
  return `MAP-${datePart}-${newReferenceToken()}${newReferenceToken().slice(0, 2)}`;
}

// ─── File fingerprint (SHA-256) for duplicate-receipt detection ────────────
export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Receipt field extraction ──────────────────────────────────────────────
export interface ExtractedReceipt {
  amount?: number;
  transactionReference?: string;
  paymentReference?: string;
  transactionDate?: string;   // ISO-ish date string (YYYY-MM-DD)
  transactionTime?: string;   // HH:MM
  senderName?: string;
  senderAccountNumber?: string;
  recipientName?: string;
  recipientAccountNumber?: string;
  bankName?: string;
  remark?: string;
  transferStatus?: "SUCCESS" | "PENDING" | "FAILED";
  rawText: string;
  confidence: number;
}

const BANKS = [
  "GTBank", "Guaranty Trust", "Zenith", "Access", "First Bank", "UBA", "United Bank",
  "Opay", "OPay", "Palmpay", "PalmPay", "Kuda", "Moniepoint", "Wema", "Sterling",
  "Union", "Ecobank", "Fidelity", "FCMB", "Stanbic", "Polaris", "Providus", "VFD",
  "Unity", "Jaiz", "TAJ", "Keystone", "Paycom", "Globus", "Titan", "Lotus",
];

// "₦50,000.00", "NGN 50,000", "50,000.00 NGN" → 50000
export function normalizeMoney(str: string): number | undefined {
  if (!str) return undefined;
  const cleaned = str.replace(/[₦,\s]/g, "").replace(/NGN/ig, "").replace(/N($|\s)/i, "$1");
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const value = parseFloat(match[0]);
  return isNaN(value) ? undefined : value;
}

function extractAmount(text: string): number | undefined {
  const patterns = [
    /amount[^\n\r]{0,20}?(?:₦|NGN|N)?\s([\d,]+(?:\.\d{1,2})?)/i,
    /(?:₦|NGN)\s?([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s?(?:NGN|naira)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const v = normalizeMoney(m[1]);
      if (v !== undefined && v >= 100 && v < 100_000_000) return v;
    }
  }
  return undefined;
}

function extractPaymentReference(text: string): string | undefined {
  const m = text.replace(/\s+/g, " ").match(/\b(MAP[-\s]?\d{8}[-\s]?[A-Za-z0-9]{4,7})\b/i);
  if (!m) return undefined;
  return m[1].replace(/\s/g, "").toUpperCase().replace(/^MAP-?(\d{8})-?/i, "MAP-$1-");
}

function extractTransactionReference(text: string): string | undefined {
  const patterns = [
    /(?:transaction|trans)?\s*(?:ref(?:erence)?|id|no)\s*[:\-#]?\s*([A-Z0-9]{10,}(?:\/[A-Z0-9]+)?)/i,
    /(?:session|session id|rrr|ft ref|nip ref)\s*[:\-#]?\s*([A-Z0-9]{10,})/i,
    /\b([A-Z]{3}\d{8,14})\b/, // e.g. FTX..., NIP...
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return m[1].toUpperCase();
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  // 27 Aug 2026 / Aug 27 2026 / 27-08-2026 / 2026-08-27 / 27/08/26
  const m = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) ||
            text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/) ||
            text.match(/(\d{1,2})\s([A-Za-z]{3,9})\s(\d{4})/) ||
            text.match(/([A-Za-z]{3,9})\s(\d{1,2}),?\s(\d{4})/);
  if (!m) return undefined;
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const mk = (y: number, mo: number, da: number) => {
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return undefined;
    return `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
  };
  if (/^\d{4}/.test(m[0]) || m[0].includes("-") || m[0].includes("/")) {
    if (m[1].length === 4) return mk(+m[1], +m[2], +m[3]);                    // y-m-d
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return mk(y, +m[2], +m[1]);                                              // d-m-y
  }
  const monthWords = m[0].match(/[A-Za-z]{3,9}/);
  if (monthWords) {
    const mo = months.findIndex(x => monthWords[0].toLowerCase().startsWith(x));
    if (mo < 0) return undefined;
    const nums = (m[0].match(/\d+/g) || []).map(Number);
    if (nums.length < 2) return undefined;
    return mk(nums[nums.length - 1], mo + 1, nums[0]);
  }
  return undefined;
}

function extractTime(text: string): string | undefined {
  const m = text.match(/\b(\d{1,2}:\d{2})(?::\d{2})?\s*(?:\b(?:AM|PM|am|pm)\b)?/);
  return m ? m[0].trim() : undefined;
}

function extractAccountNumbers(text: string): string[] {
  return Array.from(new Set(text.match(/\b\d{10}\b/g) || []));
}

function sentenceAfter(text: string, keywords: RegExp): string | undefined {
  const m = text.match(keywords);
  if (!m) return undefined;
  const idx = m.index ?? 0;
  const tail = text.slice(idx).split(/[\n\r]/, 1)[0];
  const after = tail.replace(new RegExp(keywords.source, "i"), "").replace(/^[:\s\-–—]+/, "").trim();
  return after.length >= 3 ? after.slice(0, 60) : undefined;
}

function extractBank(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const b of BANKS) if (lower.includes(b.toLowerCase())) return b;
  return undefined;
}

function extractTransferStatus(text: string): "SUCCESS" | "PENDING" | "FAILED" | undefined {
  const l = text.toLowerCase();
  if (/success|successful|completed|complete|approved/.test(l) && !/fail|declin|revers|cancel/.test(l)) return "SUCCESS";
  if (/pending|processing|in progress/.test(l)) return "PENDING";
  if (/fail|failed|declin|revers|cancelled|cancel/.test(l)) return "FAILED";
  return undefined;
}

export function parseReceiptText(rawText: string, confidence = 0): ExtractedReceipt {
  const text = rawText.replace(/\r/g, "");
  const accounts = extractAccountNumbers(text);
  const extracted: ExtractedReceipt = {
    amount: extractAmount(text),
    transactionReference: extractTransactionReference(text),
    paymentReference: extractPaymentReference(text),
    transactionDate: extractDate(text),
    transactionTime: extractTime(text),
    senderName: sentenceAfter(text, /sender|from\s+account|debit\s+account|payer/i),
    recipientName: sentenceAfter(text, /beneficiary|recipient|receiver|receiving\s+account|credit\s+account|to\s+account/i),
    senderAccountNumber: accounts[0],
    recipientAccountNumber: accounts.length > 1 ? accounts[accounts.length - 1] : accounts[0],
    bankName: extractBank(text),
    remark: sentenceAfter(text, /remark|description|narration|purpose|memo/i),
    transferStatus: extractTransferStatus(text),
    rawText: text,
    confidence,
  };
  if (!extracted.remark && extracted.paymentReference) extracted.remark = extracted.paymentReference;
  return extracted;
}

// ─── Validation & scoring ──────────────────────────────────────────────────
export interface ValidationResult {
  score: number;
  amountMatch: boolean;
  referenceMatch: boolean;
  recipientMatch: boolean;
  statusMatch: boolean;
  dateValid: boolean;
  duplicateDetected: boolean;
  unreadable: boolean;
  reasons: string[];
  status: DonationStatus;
  automatically_confirm_payment?: boolean;
  requires_admin_review?: boolean;
  verification_method?: string;
}

function norm(s?: string): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function validatePaymentSubmission(opts: {
  donation: any;
  submission: any;
  extracted: ExtractedReceipt;
  settings: any;
}): Promise<ValidationResult> {
  const { donation, submission, extracted, settings } = opts;
  const reasons: string[] = [];
  let score = 0;

  // 0. Unreadable receipt?
  const unreadable = !extracted.rawText || extracted.rawText.trim().length < 25;

  // 1. Payment reference — the critical check (30 pts)
  const expectedRef = norm(donation.payment_reference);
  const foundRef = norm(extracted.paymentReference || extracted.remark);
  const rawTextNorm = norm(extracted.rawText);
  const referenceMatch = !!foundRef && foundRef === expectedRef;
  if (referenceMatch) {
    score += 30;
    reasons.push("Payment reference matched exactly");
  } else if (foundRef) {
    reasons.push(`Different reference detected on receipt (${extracted.paymentReference})`);
  } else {
    reasons.push("Payment reference not found on receipt");
  }

  // 2. Amount check (25 pts)
  const amountMatch =
    extracted.amount !== undefined &&
    Math.abs(extracted.amount - donation.amount) < Math.max(1, donation.amount * 0.005); // ±0.5%
  if (amountMatch) score += 25;
  else if (extracted.amount !== undefined) reasons.push(`Amount mismatch: expected ₦${donation.amount}, receipt shows ₦${extracted.amount}`);
  else reasons.push("Could not read amount from receipt");

  // 3. Recipient account check (15 pts)
  const configuredAccount = norm(settings?.account_number);
  const recipientAcct = norm(extracted.recipientAccountNumber);
  const recipientName = norm(extracted.recipientName);
  const configuredName = norm(settings?.account_name);
  let recipientMatch = false;
  if (recipientAcct && configuredAccount && recipientAcct === configuredAccount) recipientMatch = true;
  else if (configuredName && recipientName && (recipientName.includes(configuredName) || configuredName.includes(recipientName))) recipientMatch = true;
  else if (configuredAccount && rawTextNorm.includes(configuredAccount)) recipientMatch = true;
  if (recipientMatch) score += 15;
  else if (recipientAcct || recipientName) reasons.push("Recipient details on receipt do not match the MapFund fundraising account");
  else reasons.push("Recipient details not visible on receipt");

  // 4. Transfer status (15 pts)
  const statusMatch = extracted.transferStatus === "SUCCESS";
  if (statusMatch) score += 15;
  else if (extracted.transferStatus === "FAILED") reasons.push("Receipt indicates the transfer FAILED");
  else if (extracted.transferStatus === "PENDING") reasons.push("Receipt indicates the transfer is still PENDING");
  else reasons.push("Transfer status could not be confirmed from receipt");

  // 5. Date validation (10 pts) — not in future, within verification window
  const windowDays = settings?.verification_window_days ?? 7;
  let dateValid = false;
  if (extracted.transactionDate) {
    const txDate = new Date(extracted.transactionDate);
    const now = new Date();
    const diffDays = (now.getTime() - txDate.getTime()) / 86400000;
    dateValid = !isNaN(txDate.getTime()) && diffDays >= -0.5 && diffDays <= windowDays;
    if (!dateValid) reasons.push(diffDays > windowDays ? `Transaction date is older than the ${windowDayLabel(windowDays)} window` : "Transaction date is in the future");
  } else {
    reasons.push("Transaction date not found on receipt");
  }
  if (dateValid) score += 10;

  // 6. Duplicate checks (5 pts each) — file hash & transaction reference
  let duplicateDetected = false;
  const subs: any[] = await base44.entities.PaymentSubmission.list();
  const sameHash = subs.find((s: any) => s.file_hash && s.file_hash === submission.file_hash && s.id !== submission.id);
  if (sameHash) {
    duplicateDetected = true;
    reasons.push("This exact receipt file has already been submitted");
  } else {
    score += 5;
  }
  if (extracted.transactionReference) {
    const sameRef = subs.find((s: any) =>
      s.extracted_transaction_reference &&
      s.extracted_transaction_reference === extracted.transactionReference &&
      s.id !== submission.id);
    if (sameRef) {
      duplicateDetected = true;
      reasons.push("This bank transaction reference has already been used for another donation");
    } else {
      score += 5;
    }
  } else {
    reasons.push("Transaction reference not found — duplicate check limited");
    score += 2;
  }

  // 7. Confidence floor from OCR (0–5 pts)
  score += Math.min(5, Math.round((extracted.confidence || 0) / 20));

  // Final score is clamped but NOT rounded in a way that changes the threshold.
  const finalScore = Math.max(0, Math.min(100, score));

  // ── Final decision threshold (ONLY place that decides auto-confirm) ──
  // Previous logic:
  //   score >= 95 + all checks pass → EVIDENCE_VALID (still needed admin confirm)
  //   score >= 55 → NEEDS_REVIEW
  // New logic:
  //   score >= 60 → CONFIRMED (auto-verified, no admin review)
  //   score <  60 → NEEDS_REVIEW (admin queue)
  // Hard rejects still apply for duplicates / failed transfers.
  const AUTO_VERIFY_THRESHOLD = 60;
  let status: DonationStatus;
  if (duplicateDetected) {
    status = DONATION_STATUS.DUPLICATE;
  } else if (extracted.transferStatus === "FAILED") {
    status = DONATION_STATUS.REJECTED;
  } else if (unreadable) {
    status = DONATION_STATUS.NEEDS_REVIEW;
    reasons.unshift("Receipt could not be read clearly — manual review required");
  } else if (finalScore >= AUTO_VERIFY_THRESHOLD) {
    // Automatically confirm — donor must NOT see "requires review"
    status = DONATION_STATUS.CONFIRMED;
    reasons.unshift(`Automatic verification passed (score ${finalScore}% ≥ ${AUTO_VERIFY_THRESHOLD}%)`);
  } else {
    status = DONATION_STATUS.NEEDS_REVIEW;
    reasons.unshift(`Verification score ${finalScore}% is below the ${AUTO_VERIFY_THRESHOLD}% automatic confirmation threshold`);
  }

  return {
    score: finalScore,
    amountMatch, referenceMatch, recipientMatch, statusMatch, dateValid,
    duplicateDetected, unreadable, reasons, status,
    automatically_confirm_payment: status === DONATION_STATUS.CONFIRMED,
    requires_admin_review: status === DONATION_STATUS.NEEDS_REVIEW,
    verification_method: status === DONATION_STATUS.CONFIRMED ? "automatic_threshold_60" : "admin_review_required",
  };
}

function windowDayLabel(days: number): string {
  return `${days}-day`;
}

// ─── Payment settings (admin-configurable, no code edits needed) ───────────
const DEFAULT_SETTINGS = {
  bank_name: "Zenith Bank",
  account_name: "MapFund — MAPOLY Student Fund",
  account_number: "1234567890",
  instructions:
    "Copy this payment reference and paste it into the Remark/Description field when making your bank transfer. This allows us to match your payment to your donation.",
  verification_window_days: 7,
  accepted_types: ["jpg", "jpeg", "png", "webp", "pdf"],
  max_size_mb: 8,
};

export async function getPaymentSettings(): Promise<any> {
  const all: any[] = await base44.entities.PaymentSettings.list();
  if (all.length === 0) {
    return await base44.entities.PaymentSettings.create({ ...DEFAULT_SETTINGS, is_active: true });
  }
  return all[0];
}

// ─── Receipt storage (Supabase Storage w/ graceful local fallback) ──────────
import { supabase } from "@/lib/supabase";

export async function storeReceiptFile(donationId: string, file: File): Promise<{ path: string; dataUrl?: string }> {
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
  const path = `donations/${donationId}/${safeName}`;
  try {
    const { error } = await supabase.storage.from("payment-receipts").upload(path, file, { upsert: false });
    if (!error) {
      const { data } = supabase.storage.from("payment-receipts").getPublicUrl(path);
      return { path: data.publicUrl };
    }
  } catch {
    // fall through to local data URL for demo/preview
  }
  // Fallback: inline data URL (sufficient for ≤2 MB previews in this build)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  return { path, dataUrl };
}
