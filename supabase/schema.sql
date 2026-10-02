-- MapFund — Supabase schema additions for the bank-transfer donation system + student uploads
-- Run in the Supabase SQL editor. Existing tables (MAPOLY STUDENT) are untouched.

-- ── email_logs (referenced by the frontend Email Management page) ───────────
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text,
  recipient_email text NOT NULL,
  template_id integer NOT NULL,
  template_name text NOT NULL,
  status text NOT NULL DEFAULT 'SENT',
  brevo_message_id text,
  error_message text,
  sent_at timestamptz DEFAULT now()
);
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read email logs" ON public.email_logs
  FOR SELECT USING (true);
-- Only the send-email edge function (service role) should insert:
REVOKE INSERT ON public.email_logs FROM anon;

-- ── donations (bank-transfer donations) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  donor_name text NOT NULL,
  donor_email text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 100),
  is_anonymous boolean DEFAULT false,
  message text,
  payment_reference text NOT NULL UNIQUE,        -- MAP-YYYYMMDD-XXXXX
  payment_status text NOT NULL DEFAULT 'PENDING_PAYMENT',
  confirmed boolean DEFAULT false,               -- only true after admin confirms
  receipt_file_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS donations_reference_idx ON public.donations (payment_reference);
CREATE INDEX IF NOT EXISTS donations_campaign_idx ON public.donations (campaign_id);
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read donations" ON public.donations FOR SELECT USING (true);
CREATE POLICY "Donors create donations" ON public.donations FOR INSERT WITH CHECK (true);

-- ── payment_submissions (receipts + OCR extraction) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id uuid NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  payment_reference text NOT NULL,
  expected_amount numeric NOT NULL,
  receipt_file_path text,
  receipt_data_url text,                          -- fallback for preview
  file_hash text,                                 -- SHA-256 fingerprint
  extracted_amount numeric,
  extracted_transaction_reference text,
  extracted_payment_reference text,
  extracted_transaction_date date,
  extracted_transaction_time text,
  extracted_sender_name text,
  extracted_recipient_name text,
  extracted_bank_name text,
  extracted_account_number text,
  extracted_remark text,
  extracted_status text,
  verification_score integer,
  amount_match boolean,
  reference_match boolean,
  recipient_match boolean,
  status_match boolean,
  date_valid boolean,
  duplicate_detected boolean,
  ocr_confidence numeric,
  ocr_source text,
  verification_status text DEFAULT 'RECEIPT_UPLOADED',
  verification_reasons text,
  admin_notes text,
  submitted_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  verified_by text
);
CREATE INDEX IF NOT EXISTS payment_submissions_hash_idx ON public.payment_submissions (file_hash);
CREATE INDEX IF NOT EXISTS payment_submissions_txn_idx ON public.payment_submissions (extracted_transaction_reference);
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read submissions" ON public.payment_submissions FOR SELECT USING (true);
CREATE POLICY "Donors create submissions" ON public.payment_submissions FOR INSERT WITH CHECK (true);

-- ── student_files (file metadata for student uploads) ──────────────────────
CREATE TABLE IF NOT EXISTS public.student_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL UNIQUE,           -- storage path (e.g. {student_id}/documents/{unique}.pdf)
  file_type text NOT NULL,                  -- profile | documents | fundraising
  file_size integer NOT NULL DEFAULT 0,
  mime text,
  uploaded_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_files_student_idx ON public.student_files (student_id);
CREATE INDEX IF NOT EXISTS student_files_path_idx ON public.student_files (file_path);
ALTER TABLE public.student_files ENABLE ROW LEVEL SECURITY;

-- Students manage only their own rows (folder path starts with their ID);
-- admins can read/manage all rows.
CREATE POLICY "Students read own files" ON public.student_files
  FOR SELECT USING (
    file_path LIKE (auth.uid()::text) || '/%' OR auth.role() = 'authenticated'
  );
CREATE POLICY "Students insert own files" ON public.student_files
  FOR INSERT WITH CHECK (file_path LIKE (auth.uid()::text) || '/%');
CREATE POLICY "Students update own files" ON public.student_files
  FOR UPDATE USING (file_path LIKE (auth.uid()::text) || '/%');
CREATE POLICY "Students delete own files" ON public.student_files
  FOR DELETE USING (file_path LIKE (auth.uid()::text) || '/%');

-- ── student-uploads PRIVATE storage bucket ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-uploads', 'student-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (apply the SAME folder-prefix isolation to the objects):
CREATE POLICY IF NOT EXISTS "Students upload own folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'student-uploads'
    AND name LIKE (auth.uid()::text) || '/%'
  );
CREATE POLICY IF NOT EXISTS "Students read own folder" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'student-uploads'
    AND name LIKE (auth.uid()::text) || '/%'
  );
CREATE POLICY IF NOT EXISTS "Students delete own folder" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'student-uploads'
    AND name LIKE (auth.uid()::text) || '/%'
  );

-- ── payment_receipts storage bucket ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;
-- Donors may only upload to their own donation folder; admins can read.
CREATE POLICY IF NOT EXISTS "Donor upload own receipts" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'payment-receipts');
CREATE POLICY IF NOT EXISTS "Authenticated read receipts" ON storage.objects
  FOR SELECT USING (bucket_id = 'payment-receipts' AND auth.role() = 'authenticated');
