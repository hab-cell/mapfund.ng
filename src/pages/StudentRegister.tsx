import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, GraduationCap, Upload } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, Input, Select, Textarea } from "@/components/shared";
import { formatNaira } from "@/lib/formatters";
import { sendWelcomeEmail, sendApplicationSubmittedEmail } from "@/lib/email";

const PURPOSES = ["TUITION", "ACCOMMODATION", "FEEDING", "MEDICAL", "BOOKS", "PROJECT", "OTHER"];
const LEVELS = ["ND I", "ND II", "HND I", "HND II"];
// 10 MB max, allowed types: PDF, JPG, JPEG, PNG
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const DOC_KEYS = [
  { k: "passport", l: "Passport photo" },
  { k: "school_id", l: "School ID card" },
  { k: "admission", l: "Admission letter" },
  { k: "fee", l: "Fee invoice / breakdown" },
  { k: "course_reg", l: "Course registration" },
  { k: "printout", l: "Profile printout" },
];

export default function StudentRegister() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [profile, setProfile] = useState({
    full_name: "", matric_number: "", department: "", faculty: "", level: "ND I",
    school_email: "", phone: "",
  });
  const [docs, setDocs] = useState<{ [k: string]: string }>({});
  const [docFiles, setDocFiles] = useState<{ [k: string]: File | null }>({});
  const [application, setApplication] = useState({
    purpose: "TUITION", amount_needed: 0, deadline: "",
    personal_statement: "", is_emergency: false,
  });

  const uploadDoc = async (key: string, file?: File) => {
    if (!file) return;
    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File "${file.name}" is too large. Maximum 10 MB allowed.`);
      return;
    }
    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(`File "${file.name}" type not allowed. Allowed: PDF, JPG, JPEG, PNG.`);
      return;
    }
    toast.loading(`Uploading ${key}…`, { id: key });
    const { file_url } = await base44.integrations.UploadFile(file);
    setDocs(d => ({ ...d, [key]: file_url }));
    setDocFiles(d => ({ ...d, [key]: file }));
    toast.success(`${key} uploaded`, { id: key });
  };

  // Step validation gates
  const canGoToStep2 = () => {
    if (!profile.full_name.trim()) { toast.error("Full name is required"); return false; }
    if (!profile.matric_number.trim()) { toast.error("Matric number is required"); return false; }
    if (!/^\d{2}\/\d{2,3}\/\d{4}$/.test(profile.matric_number.trim())) {
      toast.error("Matric number must be in the format YY/DEPTCODE/NUM (e.g. 21/69/0056)");
      return false;
    }
    if (!profile.department.trim()) { toast.error("Department is required"); return false; }
    if (!profile.faculty.trim()) { toast.error("Faculty is required"); return false; }
    if (!profile.school_email.trim()) { toast.error("School email is required"); return false; }
    if (!profile.school_email.includes("@")) { toast.error("Enter a valid school email"); return false; }
    return true;
  };

  const canGoToStep3 = () => {
    const missing = DOC_KEYS.filter(d => !docs[d.k]);
    if (missing.length > 0) {
      toast.error(`Please upload: ${missing.map(d => d.l).join(", ")}`);
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!profile.full_name || !profile.matric_number) return toast.error("Please complete your profile");
    if (!application.personal_statement.trim()) return toast.error("Personal statement is required");
    if (!application.amount_needed || application.amount_needed < 100) return toast.error("Please enter a valid amount");
    setSubmitting(true);
    const created = await base44.entities.StudentProfile.create({
      ...profile,
      passport_photo_url: docs.passport, school_id_url: docs.school_id,
      admission_letter_url: docs.admission, fee_invoice_url: docs.fee,
      course_reg_url: docs.course_reg, profile_printout_url: docs.printout,
      is_verified: false,
    });
    const createdApp = await base44.entities.FundingApplication.create({
      student_profile_id: created.id,
      purpose: application.purpose,
      amount_needed: Number(application.amount_needed),
      deadline: application.deadline || new Date(Date.now() + 30 * 86400000).toISOString(),
      personal_statement: application.personal_statement,
      supporting_evidence_urls: Object.values(docs),
      status: application.is_emergency ? "EMERGENCY" : "SUBMITTED",
      is_emergency: application.is_emergency,
    });

    // Transactional emails — sent ONLY after the account + application exist.
    // Template 2: Welcome   |   Template 6: Application Submitted
    // (Non-blocking: email failures never affect the registration.)
    if (profile.school_email) {
      try {
        await sendWelcomeEmail(created);
        const purposeCap = application.purpose.charAt(0).toUpperCase() + application.purpose.slice(1).toLowerCase();
        await sendApplicationSubmittedEmail(created, createdApp, `Help ${profile.full_name}: ${purposeCap} Support`);
      } catch (err) {
        console.error("[MapFund] Registration emails failed:", err);
      }
    }
    setSubmitting(false);
    toast.success("Application submitted! You'll be notified after review.");
    setStep(4);
  };

  const StepDot = ({ n, label }: { n: number; label: string }) => (
    <div className="flex items-center gap-2">
      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
        step > n ? "bg-success text-white" : step === n ? "bg-primary text-white" : "bg-muted text-muted-foreground"
      }`}>{step > n ? <CheckCircle2 className="h-4 w-4" /> : n}</div>
      <span className={`text-sm ${step === n ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="text-center mb-8">
        <div className="mx-auto inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground p-3 mb-3">
          <GraduationCap className="h-8 w-8" />
        </div>
        <h1 className="font-heading text-3xl font-bold">Apply for Funding (MAPOLY)</h1>
        <p className="text-muted-foreground mt-2">Complete each section before moving to the next. All information is verified privately.</p>
      </div>

      <div className="flex justify-center gap-6 mb-8 flex-wrap">
        <StepDot n={1} label="Profile" />
        <StepDot n={2} label="Documents" />
        <StepDot n={3} label="Application" />
      </div>

      <Card className="p-6">
        {step === 1 && (
          <div className="grid gap-4">
            <h2 className="font-heading text-xl font-semibold">Your details</h2>
            <p className="text-xs text-muted-foreground -mt-2">Must be completed before proceeding.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="text-sm font-medium">Full name *</label><Input value={profile.full_name} onChange={e => setProfile({ ...profile, full_name: e.target.value })} required /></div>
              <div><label className="text-sm font-medium">Matric number *</label><Input value={profile.matric_number} onChange={e => setProfile({ ...profile, matric_number: e.target.value })} placeholder="e.g. 21/69/0056" /></div>
              <div><label className="text-sm font-medium">Faculty *</label><Input value={profile.faculty} onChange={e => setProfile({ ...profile, faculty: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Department *</label><Input value={profile.department} onChange={e => setProfile({ ...profile, department: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Level *</label><Select value={profile.level} onChange={e => setProfile({ ...profile, level: e.target.value })}>{LEVELS.map(l => <option key={l}>{l}</option>)}</Select></div>
              <div><label className="text-sm font-medium">School email *</label><Input type="email" value={profile.school_email} onChange={e => setProfile({ ...profile, school_email: e.target.value })} placeholder="you@mapoly.edu.ng" /></div>
              <div className="md:col-span-2"><label className="text-sm font-medium">Phone</label><Input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => { if (canGoToStep2()) setStep(2); }}>Next <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <h2 className="font-heading text-xl font-semibold">Upload documents</h2>
            <p className="text-xs text-muted-foreground -mt-2">All documents required before proceeding. Max 10 MB per file. Allowed: PDF, JPG, JPEG, PNG.</p>
            {DOC_KEYS.map(({ k, l }) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{l} *</div>
                  {docs[k] && (
                    <div className="text-xs text-success mt-0.5 flex items-center gap-1 truncate">
                      <CheckCircle2 className="h-3 w-3 shrink-0" /> {docFiles[k]?.name || "Uploaded"}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      ref={el => { fileRefs.current[k] = el; }}
                      onChange={e => uploadDoc(k, e.target.files?.[0])}
                    />
                    <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                      <Upload className="h-3.5 w-3.5" /> {docs[k] ? "Replace" : "Choose"}
                    </span>
                  </label>
                </div>
              </div>
            ))}
            <div className="flex justify-between mt-2">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={() => { if (canGoToStep3()) setStep(3); }}>Next <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <h2 className="font-heading text-xl font-semibold">Funding request</h2>
            <p className="text-xs text-muted-foreground -mt-2">All fields required unless marked optional.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="text-sm font-medium">Purpose *</label><Select value={application.purpose} onChange={e => setApplication({ ...application, purpose: e.target.value })}>{PURPOSES.map(p => <option key={p}>{p}</option>)}</Select></div>
              <div><label className="text-sm font-medium">Amount needed (₦) *</label><Input type="number" value={application.amount_needed || ""} onChange={e => setApplication({ ...application, amount_needed: Number(e.target.value) })} min={100} /></div>
              <div className="md:col-span-2"><label className="text-sm font-medium">Deadline</label><Input type="date" value={application.deadline} onChange={e => setApplication({ ...application, deadline: e.target.value })} /></div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Your story *</label>
                <Textarea rows={6} value={application.personal_statement} onChange={e => setApplication({ ...application, personal_statement: e.target.value })} placeholder="Tell donors and admins about your situation, why you need help, and what this funding will make possible." />
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={application.is_emergency} onChange={e => setApplication({ ...application, is_emergency: e.target.checked })} className="rounded" />
                Mark as emergency (fast-track review)
              </label>
            </div>
            {application.amount_needed > 0 && <div className="text-sm text-muted-foreground">You're requesting <span className="font-bold text-primary">{formatNaira(application.amount_needed)}</span></div>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="font-heading text-2xl font-bold">Application received!</h2>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              Our admin team will verify your identity against MAPOLY institutional records and review your application. You will receive email updates at each stage.
            </p>
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-left max-w-md mx-auto">
              <div className="font-semibold">Your login credentials</div>
              <div className="mt-2 space-y-1 text-muted-foreground">
                <div>Email: <span className="font-medium text-foreground">{profile.school_email || "(use the email you entered)"}</span></div>
                <div>Password: <span className="font-medium text-foreground">{profile.full_name.split(" ").pop()?.toLowerCase() || "your surname"}</span></div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Your password is your surname in lowercase letters.</div>
            </div>
            <div className="mt-6 flex gap-2 justify-center">
              <Button variant="outline" onClick={() => nav("/")}>Go home</Button>
              <Button onClick={() => nav("/login")}>Sign in</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
