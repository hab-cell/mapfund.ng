-- MapFund student file uploads
-- Uses the EXISTING private bucket: student-uploads
-- Do NOT create another bucket.

-- 1) Metadata table
CREATE TABLE IF NOT EXISTS public.student_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('profile', 'documents', 'fundraising')),
  file_size integer NOT NULL DEFAULT 0,
  mime text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  -- Cloudinary fields for NEW uploads
  cloudinary_public_id text,
  cloudinary_secure_url text,
  storage_provider text DEFAULT 'cloudinary'
);

-- Ensure Cloudinary columns exist even if table already existed
ALTER TABLE public.student_uploads
  ADD COLUMN IF NOT EXISTS cloudinary_public_id text,
  ADD COLUMN IF NOT EXISTS cloudinary_secure_url text,
  ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'cloudinary';

CREATE INDEX IF NOT EXISTS student_uploads_student_idx
  ON public.student_uploads (student_id);
CREATE INDEX IF NOT EXISTS student_uploads_path_idx
  ON public.student_uploads (file_path);

ALTER TABLE public.student_uploads ENABLE ROW LEVEL SECURITY;

-- Students can only manage their own metadata rows.
DROP POLICY IF EXISTS "Students select own uploads" ON public.student_uploads;
CREATE POLICY "Students select own uploads"
  ON public.student_uploads
  FOR SELECT
  USING (student_id = auth.uid()::text);

DROP POLICY IF EXISTS "Students insert own uploads" ON public.student_uploads;
CREATE POLICY "Students insert own uploads"
  ON public.student_uploads
  FOR INSERT
  WITH CHECK (student_id = auth.uid()::text);

DROP POLICY IF EXISTS "Students update own uploads" ON public.student_uploads;
CREATE POLICY "Students update own uploads"
  ON public.student_uploads
  FOR UPDATE
  USING (student_id = auth.uid()::text)
  WITH CHECK (student_id = auth.uid()::text);

DROP POLICY IF EXISTS "Students delete own uploads" ON public.student_uploads;
CREATE POLICY "Students delete own uploads"
  ON public.student_uploads
  FOR DELETE
  USING (student_id = auth.uid()::text);

-- Admins can read all upload metadata.
-- Adjust the admin check to match your existing auth role claim if different.
DROP POLICY IF EXISTS "Admins select all uploads" ON public.student_uploads;
CREATE POLICY "Admins select all uploads"
  ON public.student_uploads
  FOR SELECT
  USING (
    coalesce((auth.jwt() ->> 'role'), '') = 'admin'
    OR coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
    OR coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'admin'
  );

-- 2) Keep the existing private bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'student-uploads';

-- 3) Storage object policies for the existing private bucket
-- Students can only access objects under their own user-id folder.
DROP POLICY IF EXISTS "Students upload own folder" ON storage.objects;
CREATE POLICY "Students upload own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Students read own folder" ON storage.objects;
CREATE POLICY "Students read own folder"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'student-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Students update own folder" ON storage.objects;
CREATE POLICY "Students update own folder"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'student-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'student-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Students delete own folder" ON storage.objects;
CREATE POLICY "Students delete own folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'student-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can read all student upload objects.
DROP POLICY IF EXISTS "Admins read all student uploads" ON storage.objects;
CREATE POLICY "Admins read all student uploads"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'student-uploads'
    AND (
      coalesce((auth.jwt() ->> 'role'), '') = 'admin'
      OR coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
      OR coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'admin'
    )
  );
