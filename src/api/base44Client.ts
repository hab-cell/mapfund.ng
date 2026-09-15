// Mock in-memory Base44 SDK client — mimics the real SDK surface
// Provides entities, auth, and integration helpers for the demo.

type Record = { id: string; created_date: string; updated_date: string; created_by_id?: string; [k: string]: any };

type Listener = () => void;

class Entity<T extends Record> {
  name: string;
  items: T[] = [];
  private listeners: Set<Listener> = new Set();

  constructor(name: string) {
    this.name = name;
    try {
      const saved = localStorage.getItem(`mapfund_entity_${name}`);
      if (saved) this.items = JSON.parse(saved);
    } catch {
      this.items = [];
    }
    // Cross-tab sync: when another admin tab updates data, mirror it live
    window.addEventListener("storage", (e) => {
      if (e.key === `mapfund_entity_${name}` && e.newValue) {
        try {
          this.items = JSON.parse(e.newValue);
          this.listeners.forEach(l => l());
        } catch {
          // ignore malformed payloads
        }
      }
    });
  }

  private uid() {
    return this.name.slice(0, 3).toLowerCase() + "_" + Math.random().toString(36).slice(2, 10);
  }

  private notify() {
    localStorage.setItem(`mapfund_entity_${this.name}`, JSON.stringify(this.items));
    this.listeners.forEach(l => l());
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  async list(sort?: string, limit?: number): Promise<T[]> {
    await new Promise(r => setTimeout(r, 40));
    let items = [...this.items];
    if (sort) {
      const desc = sort.startsWith("-");
      const key = desc ? sort.slice(1) : sort;
      items.sort((a: any, b: any) => {
        const av = a[key]; const bv = b[key];
        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
        return 0;
      });
    }
    if (limit) items = items.slice(0, limit);
    return items;
  }

  async filter(where: Partial<T>, sort?: string, limit?: number): Promise<T[]> {
    const items = await this.list(sort, undefined);
    const filtered = items.filter(it => Object.entries(where).every(([k, v]) => (it as any)[k] === v));
    return limit ? filtered.slice(0, limit) : filtered;
  }

  async get(id: string): Promise<T | null> {
    await new Promise(r => setTimeout(r, 20));
    return this.items.find(i => i.id === id) || null;
  }

  async create(data: Partial<T>): Promise<T> {
    await new Promise(r => setTimeout(r, 60));
    const now = new Date().toISOString();
    const item = { id: this.uid(), created_date: now, updated_date: now, ...data } as T;
    this.items.push(item);
    this.notify();
    return item;
  }

  async bulkCreate(rows: Partial<T>[]): Promise<T[]> {
    await new Promise(r => setTimeout(r, 80));
    const now = new Date().toISOString();
    const created = rows.map(d => ({ id: this.uid(), created_date: now, updated_date: now, ...d }) as T);
    this.items.push(...created);
    this.notify(); // single write → instantly persisted + synced to other admin tabs
    return created;
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    await new Promise(r => setTimeout(r, 50));
    const idx = this.items.findIndex(i => i.id === id);
    if (idx < 0) return null;
    this.items[idx] = { ...this.items[idx], ...data, updated_date: new Date().toISOString() };
    this.notify();
    return this.items[idx];
  }

  async delete(id: string): Promise<boolean> {
    await new Promise(r => setTimeout(r, 40));
    const before = this.items.length;
    this.items = this.items.filter(i => i.id !== id);
    if (this.items.length !== before) { this.notify(); return true; }
    return false;
  }
}

// DonationEntity: filtering by payment_status "SUCCESS" intentionally also
// matches confirmed donations so aggregates keep working across the new
// bank-transfer lifecycle (PENDING_PAYMENT → … → CONFIRMED).
class DonationEntity extends Entity<any> {
  override async filter(where: any, sort?: string, limit?: number): Promise<any[]> {
    if (where && where.payment_status === "SUCCESS") {
      const [success, confirmed] = await Promise.all([
        super.filter({ ...where, payment_status: "SUCCESS" }, sort),
        super.filter({ ...where, payment_status: "CONFIRMED" }, sort),
      ]);
      let merged = [...success, ...confirmed];
      if (sort) {
        const desc = sort.startsWith("-");
        const key = desc ? sort.slice(1) : sort;
        merged.sort((a, b) => (a[key] < b[key] ? (desc ? 1 : -1) : a[key] > b[key] ? (desc ? -1 : 1) : 0));
      }
      return limit ? merged.slice(0, limit) : merged;
    }
    return super.filter(where, sort, limit);
  }
}

// User & Auth
type CurrentUser = { id: string; full_name: string; email: string; role: "admin" | "student" } | null;

// Hardcoded admin credentials — created in the backend by a super-admin
// Only these exact email/password combinations grant admin access.
const ADMIN_CREDENTIALS: { email: string; password: string; full_name: string }[] = [
  { email: "Admin1@demo.com", password: "V7!qR2#Lm9@Xp4Z", full_name: "Admin One" },
  { email: "Admin2@demo.com", password: "K8@tN5$wQ3!Hs7Y", full_name: "Admin Two" },
  { email: "Admin3@demo.com", password: "P4#vX9!rM6@Dz2L", full_name: "Admin Three" },
  { email: "Admin4@demo.com", password: "T6$kW8@bN3#Fy5Q", full_name: "Admin Four" },
];

class AuthAPI {
  private user: CurrentUser = null;
  private listeners: Set<Listener> = new Set();

  subscribe(cb: Listener): () => void { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private notify() { this.listeners.forEach(l => l()); }

  async me(): Promise<CurrentUser> {
    const raw = localStorage.getItem("mapfund_user");
    if (raw && !this.user) this.user = JSON.parse(raw);
    return this.user;
  }

  isAuthenticated() { return !!this.user || !!localStorage.getItem("mapfund_user"); }

  async loginViaEmailPassword(email: string, password: string): Promise<CurrentUser> {
    await new Promise(r => setTimeout(r, 500));
    if (!email || !password) throw new Error("Email and password required");

    // 1) Check admin credentials first — exact email + password match required
    const admin = ADMIN_CREDENTIALS.find(a => a.email === email);
    if (admin) {
      if (password !== admin.password) throw new Error("Incorrect admin password");
      const user = { id: "adm_" + Math.random().toString(36).slice(2, 10), full_name: admin.full_name, email: admin.email, role: "admin" as const };
      this.user = user;
      localStorage.setItem("mapfund_user", JSON.stringify(user));
      this.notify();
      return user;
    }

    // 2) Check if this email belongs to a registered student profile
    const profiles: any[] = await base44.entities.StudentProfile.list();
    const profile = profiles.find((p: any) => p.school_email?.toLowerCase() === email.toLowerCase());
    if (!profile) throw new Error("No account found with this email. Please apply for funding first.");

    // Password = surname (last word of full_name) lowercased
    const surname = profile.full_name.split(" ").pop()?.toLowerCase() || "";
    if (password !== surname) throw new Error("Incorrect password. Use your surname (lowercase).");

    const user = { id: profile.id, full_name: profile.full_name, email: profile.school_email, role: "student" as const };
    this.user = user;
      localStorage.setItem("mapfund_user", JSON.stringify(user));
    this.notify();
    return user;
  }

  async logout() {
    this.user = null;
    localStorage.removeItem("mapfund_user");
    this.notify();
  }

  async updateMe(data: Partial<NonNullable<CurrentUser>>) {
    if (this.user) {
      this.user = { ...this.user, ...data } as any;
      localStorage.setItem("edufund_user", JSON.stringify(this.user));
      this.notify();
    }
    return this.user;
  }
}

// Integrations (mock)
async function UploadFile(file: File): Promise<{ file_url: string }> {
  await new Promise(r => setTimeout(r, 400));
  return { file_url: `https://files.mapfund.ng/${encodeURIComponent(file.name)}` };
}

async function SendEmail(_to: string, _subject: string, _body: string): Promise<{ success: boolean }> {
  await new Promise(r => setTimeout(r, 200));
  return { success: true };
}

async function GenerateImage(_prompt: string): Promise<{ image_url: string }> {
  await new Promise(r => setTimeout(r, 400));
  return { image_url: `https://images.mapfund.ng/generated/${Date.now()}` };
}

async function InvokeLLM(_prompt: string): Promise<{ content: string }> {
  await new Promise(r => setTimeout(r, 300));
  return { content: "LLM analysis complete." };
}

// Build the SDK
export const base44 = {
  auth: new AuthAPI(),
  integrations: {
    UploadFile,
    SendEmail,
    Core: {
      SendEmail: (opts: { to: string; subject: string; body: string }) =>
        SendEmail(opts.to, opts.subject, opts.body),
    },
    GenerateImage,
    InvokeLLM,
  },
  entities: {
    StudentProfile: new Entity<any>("StudentProfile"),
    StudentRecord: new Entity<any>("StudentRecord"),
    FundingApplication: new Entity<any>("FundingApplication"),
    VerificationStage: new Entity<any>("VerificationStage"),
    Campaign: new Entity<any>("Campaign"),
    Donation: new DonationEntity("Donation"),
    BankAccount: new Entity<any>("BankAccount"),
    Disbursement: new Entity<any>("Disbursement"),
    CommunityPost: new Entity<any>("CommunityPost"),
    CommunityComment: new Entity<any>("CommunityComment"),
    AppNotification: new Entity<any>("AppNotification"),
    AuditLog: new Entity<any>("AuditLog"),
    EmailLog: new Entity<any>("EmailLog"),
    PaymentSubmission: new Entity<any>("PaymentSubmission"),
    PaymentSettings: new Entity<any>("PaymentSettings"),
    StudentFile: new Entity<any>("StudentFile"),
  },
};

// ─── One-time cleanup of legacy dummy data ─────────────────────────────
// Previous builds shipped demo/seed data (students, campaigns, donations…).
// Clear it once so the platform starts clean and only contains:
//   • MAPOLY roster → live Supabase API (src/lib/supabase.ts)
//   • everything else → user-generated actions (applications, donations, etc.)
const CLEANUP_FLAG = "mapfund_cleanup_v1";
if (typeof window !== "undefined" && !localStorage.getItem(CLEANUP_FLAG)) {
  (Object.values(base44.entities) as Entity<any>[]).forEach(e => {
    e.items = [];
    localStorage.removeItem(`mapfund_entity_${e.name}`);
  });
  localStorage.removeItem("mapfund_seed_version");
  localStorage.setItem(CLEANUP_FLAG, "1");
}

// Helpers
export type { CurrentUser };
