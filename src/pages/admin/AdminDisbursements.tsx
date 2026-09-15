import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, CheckCircle2, XCircle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, Input, Select, StatusBadge, EmptyState } from "@/components/shared";
import { formatDate, formatNaira } from "@/lib/formatters";
import { logAudit } from "@/lib/notifyStudent";

export default function AdminDisbursements() {
  const { data: items = [], refetch } = useQuery({
    queryKey: ["admin-disbursements-list"],
    queryFn: () => base44.entities.Disbursement.list("-created_date"),
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ["disb-campaigns"],
    queryFn: () => base44.entities.Campaign.list(),
  });
  const { data: banks = [] } = useQuery({
    queryKey: ["disb-banks"],
    queryFn: () => base44.entities.BankAccount.filter({ is_active: true }),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ campaign_id: "", amount: 0, bank_account_id: "", notes: "" });

  const campaignMap: Record<string, any> = {};
  campaigns.forEach(c => { campaignMap[c.id] = c; });

  const create = async () => {
    if (!form.campaign_id || !form.amount || !form.bank_account_id) return toast.error("All fields required");
    const ref = "TXN-" + Date.now();
    await base44.entities.Disbursement.create({
      campaign_id: form.campaign_id,
      amount: Number(form.amount),
      bank_account_id: form.bank_account_id,
      transaction_ref: ref,
      status: "PENDING",
      disbursed_by: "Admin",
      notes: form.notes || null,
    });
    await logAudit("DISBURSEMENT_CREATED", undefined, "Disbursement", { ...form, ref }, "Admin");
    toast.success(`Disbursement #${ref} created`);
    setShowForm(false);
    setForm({ campaign_id: "", amount: 0, bank_account_id: "", notes: "" });
    refetch();
  };

  const approve = async (d: any) => {
    await base44.entities.Disbursement.update(d.id, { status: "APPROVED" });
    await logAudit("DISBURSEMENT_APPROVED", d.id, "Disbursement", null, "Admin");
    toast.success("Disbursement approved");
    refetch();
  };
  const markFailed = async (d: any) => {
    await base44.entities.Disbursement.update(d.id, { status: "FAILED" });
    await logAudit("DISBURSEMENT_FAILED", d.id, "Disbursement", null, "Admin");
    toast.error("Marked as failed");
    refetch();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold">Disbursements</h1>
          <p className="text-muted-foreground mt-1">Create and manage fund payouts to verified campaigns.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}><Plus className="h-4 w-4" /> New disbursement</Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <h3 className="font-heading font-semibold mb-4">Create disbursement</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Select value={form.campaign_id} onChange={e => setForm({ ...form, campaign_id: e.target.value })}>
              <option value="">Select campaign…</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.title} ({formatNaira(c.raised_amount || 0)} raised)</option>
              ))}
            </Select>
            <Select value={form.bank_account_id} onChange={e => setForm({ ...form, bank_account_id: e.target.value })}>
              <option value="">Select bank account…</option>
              {banks.map(b => (
                <option key={b.id} value={b.id}>{b.bank_name} • {b.account_number} • {b.account_holder}</option>
              ))}
            </Select>
            <div>
              <label className="text-sm font-medium mb-1 block">Amount (₦)</label>
              <Input type="number" placeholder="50000" value={form.amount || ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <Input placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={create}>Create & save</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={<Wallet className="h-10 w-10" />} title="No disbursements yet" description="Create a disbursement to send funds to a campaign beneficiary." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Campaign</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Reference</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Date</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d: any) => (
                  <tr key={d.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 max-w-xs truncate">{campaignMap[d.campaign_id]?.title || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatNaira(d.amount)}</td>
                    <td className="px-4 py-3 font-mono text-xs hidden md:table-cell">{d.transaction_ref}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs">{formatDate(d.created_date)}</td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        {d.status === "PENDING" && (
                          <Button size="sm" onClick={() => approve(d)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </Button>
                        )}
                        {(d.status === "PENDING" || d.status === "APPROVED") && (
                          <Button size="sm" variant="outline" onClick={() => markFailed(d)}>
                            <XCircle className="h-3.5 w-3.5" /> Fail
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
