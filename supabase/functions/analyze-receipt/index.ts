// Supabase Edge Function: analyze-receipt
// Optional server-side OCR endpoint used by the PaymentPortal.
// If this function is NOT deployed, the frontend automatically falls back
// to in-browser OCR (Tesseract.js), so local development works without it.
//
// Deploy:  npx supabase functions deploy analyze-receipt
// Requires (recommended): a vision-capable model API key stored as a secret:
//   supabase secrets set GEMINI_API_KEY=…   (or OPENAI_API_KEY=…)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface AnalyzeResponse {
  text: string;
  confidence?: number;
  source?: string;
  error?: string;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
    }

    // ── Preferred: Gemini vision ──
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey) {
      const base64 = await fileToBase64(file);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: `Extract ALL readable text from this bank/debit receipt image.
Return ONLY the raw text — no commentary, no markdown.
Preserve amounts, names, references, dates, times, account numbers, and remarks exactly.` },
                { inline_data: { mime_type: file.type, data: base64 } },
              ],
            }],
          }),
        },
      );
      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return Response.json({ text, confidence: 92, source: "gemini" } satisfies AnalyzeResponse);
      }
    }

    // ── Fallback: OpenAI vision ──
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiKey) {
      const base64 = await fileToBase64(file);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Extract ALL readable text from this bank/debit receipt image. Return only the raw text." },
              { type: "image_url", image_url: { url: `data:${file.type};base64,${base64}` } },
            ],
          }],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content ?? "";
        return Response.json({ text, confidence: 90, source: "openai" } satisfies AnalyzeResponse);
      }
    }

    // No vision API key configured — tell the client to use browser OCR.
    return Response.json(
      { text: "", confidence: 0, source: "none", error: "No vision API key configured on this function." } satisfies AnalyzeResponse,
      { status: 200 },
    );
  } catch (err) {
    console.error("analyze-receipt error:", err);
    return Response.json({ error: "OCR failed" }, { status: 500 });
  }
});

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  // Chunk to avoid call-stack limits
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
