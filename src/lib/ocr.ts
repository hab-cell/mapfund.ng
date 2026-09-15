// Receipt OCR/analysis layer for MapFund.
//
// Security posture:
//   • No OCR/API secret keys anywhere in the frontend.
//   • Primary path: Supabase Edge Function "analyze-receipt".
//   • Fallback: in-browser OCR via Tesseract.js (loaded from CDN, no keys).
//     Works offline-first so the verification flow never hard-fails.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

export type OcrResult = {
  text: string;
  confidence: number;   // 0–100
  source: "edge" | "browser" | "none";
  error?: string;
};

let tesseractReady: Promise<void> | null = null;

function loadTesseract(): Promise<void> {
  if (tesseractReady) return tesseractReady;
  tesseractReady = new Promise((resolve, reject) => {
    if ((window as any).Tesseract) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load OCR engine"));
    document.head.appendChild(s);
  });
  return tesseractReady;
}

async function ocrViaEdgeFunction(file: File): Promise<OcrResult | null> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-receipt`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: form,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.text === "string") {
      return {
        text: data.text,
        confidence: typeof data.confidence === "number" ? data.confidence : 75,
        source: "edge",
      };
    }
    return null;
  } catch {
    return null; // function not deployed / network error → fallback
  }
}

async function ocrViaBrowser(file: File): Promise<OcrResult> {
  if (file.type === "application/pdf") {
    // In-browser PDF OCR is not reliable without pdf.js; flag for review.
    return { text: "", confidence: 0, source: "none", error: "PDF text extraction unavailable in browser — needs review" };
  }
  try {
    await loadTesseract();
    const T = (window as any).Tesseract;
    const result = await T.recognize(file, "eng");
    const text: string = result?.data?.text ?? "";
    const confidence: number = Math.round(result?.data?.confidence ?? 0);
    return { text, confidence, source: "browser" };
  } catch (err: any) {
    return { text: "", confidence: 0, source: "none", error: err?.message || "OCR engine unavailable" };
  }
}

export async function analyzeReceipt(file: File): Promise<OcrResult> {
  const edge = await ocrViaEdgeFunction(file);
  if (edge) return edge;
  return ocrViaBrowser(file);
}
