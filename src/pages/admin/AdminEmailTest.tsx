import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, CheckCircle2, XCircle, RefreshCw, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, Input, Select, EmptyState } from "@/components/shared";
import { formatDateTime } from "@/lib/formatters";
import { sendBrevoEmail, TEMPLATE_NAMES } from "@/lib/email";

export default function AdminEmailTest() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("Test Student");
  const [template, setTemplate] = useState(2);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; data?: any; error?: string; ms?: number } | null>(null);

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["email-logs"],
    queryFn: () => base44.entities.EmailLog.list("-created_date", 10),
  });

  // Name/value variable editor for templates with params
  const [vars, setVars] = useState<Record<string, string>>({ student_name: "Test Student" });
  const updateVar = (k: string, v: string) => setVars(prev => ({ ...prev, [k]: v }));

  const run = async () => {
    if (!email) return toast.error("Enter a test email address");
    setSending(true);
    setResult(null);
    const start = performance.now();
    try {
      const params = Object.fromEntries(
        Object.entries(vars).filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => {
          // Special case: application_id must be a string ID, keep as is; amounts as they are
          return [k, v];
        }),
      );
      const res = await sendBrevoEmail(template, email, params);
      const ms = Math.round(performance.now() - start);
      setResult({ ok: res.ok, data: res.ok ? { sent: true } : undefined, error: res.error, ms });
      if (res.ok) {
        toast.success(`Template #${template} sent in ${ms}ms to ${email}`);
      } else {
        toast.error(`Failed: ${res.error}`);
      }
      refetchLogs();
    } catch (err: any) {
      setResult({ ok: false, error: err?.message || "Unknown error" });
      toast.error(err?.message || "Unknown error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-bold flex items-center gap-2">
          <Mail className="h-8 w-8 text-primary" /> Email Test Console
        </h1>
        <p className="text-muted-foreground mt-1">
          Test the <code className="text-xs bg-muted px-1.5 py-0.5 rounded">bright-function</code> Edge Function.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-heading font-semibold mb-4">Send test email</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Template</label>
              <Select value={template} onChange={e => setTemplate(Number(e.target.value))}>
                {Object.entries(TEMPLATE_NAMES).map(([id, name]) => (
                  <option key={id} value={id}>#{id} — {name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">To</label>
              <Input placeholder="test@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Student name</label>
              <Input value={name} onChange={e => { setName(e.target.value); setVars(prev => ({ ...prev, student_name: e.target.value })); }} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Extra template variables</label>
              <p className="text-xs text-muted-foreground mb-2">Used for templates with more params (e.g. 4 uses <code>student_name</code>; 6–9 use campaign fields).</p>
              {Object.entries(vars).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-2 mb-1.5">
                  <Input value={k} onChange={e => {
                    const next = { ...vars }; delete next[k]; next[e.target.value] = v; setVars(next);
                  }} className="font-mono text-xs" />
                  <Input value={v} onChange={e => updateVar(k, e.target.value)} className="text-xs" />
                </div>
              ))}
              <Button size="sm" variant="outline" className="mt-1" onClick={() => setVars(prev => ({ ...prev, ["param" + (Object.keys(prev).length + 1)]: "" }))}>
                + Add variable
              </Button>
            </div>
            <Button className="w-full" onClick={run} disabled={sending}>
              <SendHorizonal className="h-4 w-4" />
              {sending ? "Sending…" : `Send Template #${template}`}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-heading font-semibold mb-4">Response</h2>
          {result === null ? (
            <EmptyState icon={<Mail className="h-8 w-8" />} title="No test yet" description="Click Send to invoke bright-function" />
          ) : (
            <div className="space-y-3">
              <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${result.ok ? "border-success/30 bg-success/5 text-success" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
                {result.ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                <div>
                  <div className="font-semibold">{result.ok ? "Success — email queued/sent" : "Failed"}</div>
                  <div className="text-xs opacity-80">Template #{template} → {email}</div>
                </div>
              </div>
              {result.ms !== undefined && <div className="text-xs text-muted-foreground">Round-trip: {result.ms} ms</div>}
              {result.error && (
                <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-xs">
                  <div className="font-semibold text-destructive mb-0.5">Error</div>
                  <pre className="whitespace-pre-wrap font-mono text-xs">{result.error}</pre>
                </div>
              )}
              {result.ok && result.data && (
                <div className="rounded-lg bg-success/5 border border-success/20 p-3 text-xs">
                  <div className="font-semibold mb-0.5">Function response</div>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] max-h-56 overflow-auto">{JSON.stringify(result.data, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Recent logs */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold">Recent email logs</h2>
          <Button size="sm" variant="ghost" onClick={() => refetchLogs()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
        {logs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">No logs yet.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg border border-border p-2.5 text-xs">
                <div>
                  <span className="font-semibold">{l.recipient_email}</span>
                  <span className="text-muted-foreground ml-2">#{l.template_id} {TEMPLATE_NAMES[l.template_id]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${l.status === "SENT" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {l.status}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(l.sent_at || l.created_date)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
