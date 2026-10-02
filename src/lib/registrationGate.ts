// Live registration gate — verifies a MAPOLY matric number against the
// institutional MAPOLY STUDENT table as soon as the student enters it.
// Students NOT found in the roster are not allowed to register.

import { supabase } from "@/lib/supabase";

export const MATRIC_FORMAT = /^\d{2}\/\d{2,3}\/\d{4}$/;

export type MatricGateState = "idle" | "checking" | "verified" | "not_found";

export interface MatricGateRecord {
  fullName: string;
  firstName: string;
  lastName: string;
  department: string;
  school: string;
  level: string;
  matricNumber: string;
  email: string;
  status: string;
}

export interface MatricGateResult {
  state: MatricGateState;
  message: string;
  record?: MatricGateRecord;
}

/** Normalize matric input for comparison (trim, uppercase, strip spaces). */
export function normalizeMatric(v: string): string {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Shape a raw Supabase row into the fields we need. */
function mapRecord(row: any): MatricGateRecord {
  const firstName = String(row["First Name"] ?? "").trim();
  const lastName = String(row["Last Name"] ?? "").trim();
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    department: String(row["Department"] ?? "").trim(),
    school: String(row["School"] ?? "").trim(),
    level: String(row["Level"] ?? "").trim(),
    matricNumber: String(row["Matric Number"] ?? "").trim(),
    email: String(row["Email"] ?? "").trim(),
    status: String(row["Status"] ?? "").trim(),
  };
}

/**
 * Look up a matric number in the MAPOLY STUDENT table.
 * Falls back to a normalized (whitespace-insensitive) comparison.
 */
export async function checkMatricNumber(rawMatric: string): Promise<MatricGateResult> {
  const value = String(rawMatric || "").trim();
  if (!value) {
    return { state: "idle", message: "" };
  }
  if (!MATRIC_FORMAT.test(value)) {
    return {
      state: "not_found",
      message: "Matric number must be in the format YY/DEPTCODE/NUM (e.g. 21/69/0056).",
    };
  }

  try {
    // Exact match first
    const exact = await supabase
      .from("MAPOLY STUDENT")
      .select("*")
      .eq("Matric Number", value)
      .maybeSingle();

    if (exact.error) {
      return { state: "not_found", message: `Verification error: ${exact.error.message}` };
    }
    if (exact.data) {
      const record = mapRecord(exact.data);
      return {
        state: "verified",
        message: `Verified: ${record.fullName} — ${record.department}`,
        record,
      };
    }

    // Fallback: compare normalized matric numbers over a small candidate set
    const target = normalizeMatric(value);
    const candidates = await supabase
      .from("MAPOLY STUDENT")
      .select("*")
      .ilike("Matric Number", `%${value.split("/").pop()}%`)
      .limit(25);

    if (candidates.error) {
      return { state: "not_found", message: `Verification error: ${candidates.error.message}` };
    }

    const match = (candidates.data || []).find(
      (row: any) => normalizeMatric(row["Matric Number"]) === target,
    );

    if (match) {
      const record = mapRecord(match);
      return {
        state: "verified",
        message: `Verified: ${record.fullName} — ${record.department}`,
        record,
      };
    }

    return {
      state: "not_found",
      message:
        "This matric number was not found in MAPOLY records. You are not allowed to register. Please check the number or contact your department.",
    };
  } catch (err: any) {
    return {
      state: "not_found",
      message: err?.message || "Verification service unavailable. Please try again.",
    };
  }
}
