// Supabase client for MAPOLY institutional records
// Supabase project: https://dzzixnldfqnzjhnddpgn.supabase.co
// Table: "MAPOLY STUDENT" — approximately 26,550 real student records

import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://dzzixnldfqnzjhnddpgn.supabase.co";

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_rtebhJRf28fd7-suoaASjA_XrEXDh5W";

const TABLE = "MAPOLY STUDENT";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Shape returned after normalization ──────────────────────────────────
export interface MapolyRecord {
  studentId: string;
  matricNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: string;
  school: string;
  department: string;
  departmentCode: string;
  programme: string;
  level: string;
  admissionYear: string;
  academicSession: string;
  phone: string;
  email: string;
  status: string;
  _source: "supabase";
}

// Normalize one raw Supabase row into MapFund's expected shape.
// Uses the EXACT column names from the actual table.
function normalize(row: any): MapolyRecord {
  return {
    studentId: String(row["Student ID"] ?? ""),
    matricNumber: String(row["Matric Number"] ?? ""),
    firstName: String(row["First Name"] ?? ""),
    lastName: String(row["Last Name"] ?? ""),
    fullName: `${String(row["First Name"] ?? "")} ${String(row["Last Name"] ?? "")}`.trim(),
    gender: String(row["Gender"] ?? ""),
    school: String(row["School"] ?? ""),
    department: String(row["Department"] ?? ""),
    departmentCode: String(row["Department Code"] ?? ""),
    programme: String(row["Programme"] ?? ""),
    level: String(row["Level"] ?? ""),
    admissionYear: String(row["Admission Year"] ?? ""),
    academicSession: String(row["Academic Session"] ?? ""),
    phone: String(row["Phone"] ?? ""),
    email: String(row["Email"] ?? ""),
    status: String(row["Status"] ?? ""),
    _source: "supabase",
  };
}

// ─── Search & verification helpers ──────────────────────────────────────

/**
 * Search the MAPOLY STUDENT table for a record by matric number.
 * Returns null when not found, or throws on Supabase errors.
 */
export async function searchMapolyByMatric(matric: string): Promise<MapolyRecord | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("Matric Number", matric)
    .maybeSingle();
  if (error) throw error;
  return data ? normalize(data) : null;
}

// ─── Composite primary key verification ────────────────────────────────────
// The MAPOLY STUDENT table identifies a student uniquely by these SIX
// columns (composite primary key):
//   First Name · Last Name · School · Department · Level · Email
// Other fields (Matric Number, Phone, Admission Year etc.) are accepted as
// extra info but verification is decided by these key fields only.
export interface CompositeCandidate {
  firstName?: string;
  lastName?: string;
  school?: string;
  department?: string;
  level?: string;
  email?: string;
  matricNumber?: string; // optional secondary info (not part of the key)
}

const COMPOSITE_KEYS: { db: string; ours: keyof CompositeCandidate }[] = [
  { db: "First Name", ours: "firstName" },
  { db: "Last Name", ours: "lastName" },
  { db: "School", ours: "school" },
  { db: "Department", ours: "department" },
  { db: "Level", ours: "level" },
  { db: "Email", ours: "email" },
];

function normStr(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Normalize MAPOLY level values into a canonical token ("nd1".."hnd2") so
// "ND I", "ND1", "ND 1", "ND-I", "ND_II", "NDII", "HND I", "HND I", "1", etc.
// all compare equal regardless of punctuation/casing.
function normLevel(v: unknown): string {
  const raw = normStr(v);
  if (!raw) return "";
  const clean = raw.toLowerCase().replace(/[.\-_]/g, "").replace(/\s+/g, "");
  // Determine diploma type
  let type = "";
  if (/^hnd/.test(clean) || /higher\s+national\s+diploma/i.test(raw)) type = "hnd";
  else if (/^nd/.test(clean) || /national\s+diploma/i.test(raw)) type = "nd";
  else return raw; // custom level like "100", "400", "MSc"
  // Determine number: digit or trailing roman numeral
  let num = "";
  const digit = clean.match(/(\d)/);
  if (digit) num = digit[1];
  else {
    const tail = clean.replace(/^h?nd/, "");
    if (/ii/.test(tail)) num = "2";
    else if (/i$/.test(tail)) num = "1";
  }
  if (!num) return raw;
  return `${type}${num}`;
}

const wordAbbr: Record<string, string[]> = {
  engr: ["engineering"],
  engineering: ["engineering"],
  tech: ["technology"],
  technology: ["technology"],
  comm: ["communication"],
  communication: ["communication"],
  admin: ["administration"],
  administration: ["administration"],
  mgt: ["management"],
  mgmt: ["management"],
  management: ["management"],
  comp: ["computer"],
  computer: ["computer"],
  bldg: ["building"],
  building: ["building"],
  acct: ["accountancy"],
  accounting: ["accountancy"],
  accountancy: ["accountancy"],
  sci: ["science"],
  science: ["science"],
  stats: ["statistics"],
  statistics: ["statistics"],
};

function fieldMatches(dbVal: unknown, userVal: unknown): boolean {
  const a = normStr(dbVal);
  const b = normStr(userVal);
  if (!a || !b) return a === b;
  if (a === b) return true;
  // tolerant semantic match: same tokens after abbreviation expansion
  const expand = (s: string) => s.split(" ").map(t => wordAbbr[t]?.[0] ?? t).join(" ");
  const ea = expand(a), eb = expand(b);
  return ea === eb || ea.includes(eb) || eb.includes(ea);
}

// Level-specific matching — strips spaces/punctuation before comparing so
// "HND I" and "HND1" and "HND 1" all compare as identical.
function levelMatches(dbVal: unknown, userVal: unknown): boolean {
  // Both sides normalize (nd1/2, hnd1/2) then strict equality.
  return normLevel(dbVal) === normLevel(userVal);
}

// MAPOLY school abbreviations ↔ full names, so "SEG" matches
// "School of Engineering" during verification.
const SCHOOL_ABBREVIATIONS: { abbr: string; full: string }[] = [
  { abbr: "SBMS", full: "School of Business and Management Studies" },
  { abbr: "SCIT", full: "School of Communication and Information Technology" },
  { abbr: "ENG", full: "School of Engineering" },
  { abbr: "ENV", full: "School of Environmental Studies" },
  { abbr: "SST", full: "School of Science and Technology" },
  // Legacy full names still present in older institutional rows
  { abbr: "SST", full: "School of Science and Computer Studies" },
  { abbr: "SST", full: "School of Technology" },
  { abbr: "SST", full: "School of Health and Allied Studies" },
  { abbr: "SST", full: "School of Part-Time and Continuing Education" },
];

function schoolMatches(dbVal: unknown, userVal: unknown): boolean {
  const a = normStr(dbVal);
  const b = normStr(userVal);
  if (!a || !b) return false;

  const expand = (v: string): string => {
    const hit = SCHOOL_ABBREVIATIONS.find(
      s => s.abbr.toLowerCase() === v || s.full.toLowerCase() === v,
    );
    return hit ? hit.full.toLowerCase() : v;
  };

  const ea = expand(a), eb = expand(b);
  return ea === eb || ea.includes(eb) || eb.includes(ea);
}

/**
 * Find a student by the composite primary key.
 * Anchors the query on provided fields, compares ALL key columns, and
 * returns the matched record plus any key-field differences.
 */
export async function findStudentByCompositeKey(c: CompositeCandidate): Promise<{
  record: MapolyRecord | null;
  differences: string[];
  foundMatricMatch: boolean;
}> {
  // 1) Anchor query — use email first (most precise), else matric.
  let rows: any[] = [];
  if (c.email) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("Email", c.email)
      .limit(5);
    if (error) throw error;
    rows = data || [];
  }

  let matricRecord: MapolyRecord | null = null;
  if (c.matricNumber) {
    try {
      matricRecord = await searchMapolyByMatric(c.matricNumber);
    } catch {
      matricRecord = null;
    }
  }

  if (rows.length === 0 && matricRecord?.email) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("Email", matricRecord.email)
      .limit(5);
    if (error) throw error;
    rows = data || [];
  }
  if (rows.length === 0 && c.lastName && c.department) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("Last Name", c.lastName)
      .eq("Department", c.department)
      .limit(10);
    if (error) throw error;
    rows = data || [];
  }

  const candidates = rows.map(normalize);
  if (matricRecord && !candidates.some(r => r.matricNumber === matricRecord.matricNumber)) {
    candidates.unshift(matricRecord);
  }

  // 2) Score each candidate on the 7 composite key fields
  let best: { record: MapolyRecord | null; differences: string[] } = { record: null, differences: [] };
  for (const r of candidates) {
    const differences: string[] = [];
    for (const { db, ours } of COMPOSITE_KEYS) {
      const userVal = c[ours];
      if (userVal === undefined || userVal === null || String(userVal).trim() === "") continue;
      const dbVal = db === "First Name" ? r.firstName
        : db === "Last Name" ? r.lastName
        : db === "School" ? r.school
        : db === "Department" ? r.department
        : db === "Level" ? r.level
        : r.email;
      // School compares tolerant of abbreviations (e.g. "SEG" ↔ "School of Engineering")
      const matches = db === "Level"
        ? levelMatches(dbVal, userVal)
        : db === "School"
          ? fieldMatches(dbVal, userVal) || schoolMatches(dbVal, userVal)
          : fieldMatches(dbVal, userVal);
      if (!matches) differences.push(ours);
    }
    if (differences.length === 0) return { record: r, differences: [], foundMatricMatch: !!matricRecord };
    if (!best.record || differences.length < best.differences.length) best = { record: r, differences };
  }

  // No exact composite match
  return { record: best.record, differences: best.differences, foundMatricMatch: !!matricRecord };
}

/**
 * Attempt to find a student record by matching the full detail set.
 * Used when the student supplies more than just a matric number.
 */
export async function verifyStudentDetails(candidate: {
  matricNumber: string;
  firstName?: string;
  lastName?: string;
  school?: string;
  department?: string;
  departmentCode?: string;
  programme?: string;
  level?: string;
  admissionYear?: string;
  academicSession?: string;
  email?: string;
}): Promise<{ record: MapolyRecord; differences: string[] }> {
  const record = await searchMapolyByMatric(candidate.matricNumber);
  if (!record) throw new Error("STUDENT_NOT_FOUND");

  const differences: string[] = [];
  const fields: [keyof MapolyRecord, string | undefined][] = [
    ["firstName", candidate.firstName],
    ["lastName", candidate.lastName],
    ["school", candidate.school],
    ["department", candidate.department],
    ["departmentCode", candidate.departmentCode],
    ["programme", candidate.programme],
    ["level", candidate.level],
    ["admissionYear", candidate.admissionYear],
    ["academicSession", candidate.academicSession],
    ["email", candidate.email],
  ];

  for (const [key, value] of fields) {
    if (value === undefined || value === null) continue;
    const dbValue = String(record[key as keyof MapolyRecord] ?? "").trim().toLowerCase();
    const userValue = String(value).trim().toLowerCase();
    if (dbValue && dbValue !== userValue) differences.push(key);
  }

  return { record, differences };
}

/**
 * Test the connection — used by admin UI to confirm Supabase is reachable.
 */
export async function testMapolyConnection(): Promise<boolean> {
  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true });
  return !error && (count ?? 0) > 0;
}

// Legacy helpers — kept so older pages still compile
export async function fetchMapolyRoster(): Promise<any[]> {
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) throw error;
  return Array.isArray(data) ? data.map(normalize) : [];
}

export async function searchMapolyStudent(matric: string): Promise<any | null> {
  try {
    const record = await searchMapolyByMatric(matric);
    return record;
  } catch (err) {
    console.error("[MapFund] Supabase roster lookup failed:", err);
    return null;
  }
}
