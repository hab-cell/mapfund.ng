// Student verification logic — Supabase is the ONLY source of truth.
//
// The "MAPOLY STUDENT" table uses a COMPOSITE PRIMARY KEY of six fields:
//   First Name · Last Name · School · Department · Level · Email
// A student is verified only when ALL supplied key fields match a live record.

import { findStudentByCompositeKey, MapolyRecord, CompositeCandidate, searchMapolyByMatric } from "@/lib/supabase";

export type VerificationResult =
  | { ok: true; record: MapolyRecord }
  | {
      ok: false;
      reason: "NOT_FOUND" | "MISMATCH" | "CONNECTION_ERROR";
      message: string;
      differences?: string[];
      bestRecord?: MapolyRecord;
    };

const LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  school: "School",
  department: "Department",
  level: "Level",
  email: "Email",
};

/**
 * Verify a MAPOLY student by the composite primary key.
 * Note: `admissionYear` is accepted but intentionally NOT compared — the
 * deciding key fields are: first name, last name, school, department, level,
 * email. Matric number is secondary info only.
 */
export async function verifyStudentIdentity(input: {
  matricNumber?: string;
  firstName?: string;
  lastName?: string;
  school?: string;
  department?: string;
  level?: string;
  admissionYear?: string; // ignored — not part of verification
  email?: string;
}): Promise<VerificationResult> {
  try {
    const candidate: CompositeCandidate = {
      firstName: input.firstName,
      lastName: input.lastName,
      school: input.school,
      department: input.department,
      level: input.level,
      email: input.email,
      matricNumber: input.matricNumber,
    };

    const { record, differences, foundMatricMatch } = await findStudentByCompositeKey(candidate);

    // Exact composite match → verified
    if (record && differences.length === 0) {
      return { ok: true, record };
    }

    // Some row exists (or matric matched) but key fields differ → mismatch
    if (record || foundMatricMatch) {
      const ref = record ?? (input.matricNumber ? await safeMatricLookup(input.matricNumber) : null);
      if (differences.length > 0) {
        const detail = differences.map(d => LABELS[d] ?? d).join(", ");
        return {
          ok: false,
          reason: "MISMATCH",
          message: `The information provided does not match our student records. Mismatched: ${detail}.`,
          differences,
          bestRecord: ref ?? undefined,
        };
      }
      // No usable anchor at all
      return {
        ok: false,
        reason: "NOT_FOUND",
        message: "No student in our records matches those exact details (name, school, department, level and email). Please check and try again.",
      };
    }

    // No candidate rows at all
    return {
      ok: false,
      reason: "NOT_FOUND",
      message: "Student record not found. Please check your details and try again.",
    };
  } catch (err: any) {
    console.error("[MapFund] Supabase verification error:", err);
    return {
      ok: false,
      reason: "CONNECTION_ERROR",
      message: "A connection error occurred while verifying the student. Please try again.",
    };
  }
}

async function safeMatricLookup(matric: string): Promise<MapolyRecord | null> {
  try { return await searchMapolyByMatric(matric); } catch { return null; }
}
