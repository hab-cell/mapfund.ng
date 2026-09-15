import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Building2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, Input } from "@/components/shared";
import { logAudit } from "@/lib/notifyStudent";

export default function AdminBankAccounts() {
  const { data: items = [], refetch } = useQuery({
    queryKey: ["admin-banks"],
    queryFn: () => base44.entities.BankAccount.list("-created_date"),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    bank_name: "", account_number: "", account_holder: "", is_active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.bank_name.trim()) e.bank_name = "Required";
    if (!form.account_holder.trim()) e.account_holder = "Required";
    if (!form.account_number.trim()) e.account_number = "Required";
    else if (form.account_number.length !== 10 || !/^\d+$/.test(form.account_number)) e.account_number = "Must be exactly 10 digits";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    await base44.entities.BankAccount.create(form);
    await logAudit("BANK_ACCOUNT_CREATED", undefined, "BankAccount", { ...form }, "Admin");
    toast.success("Bank account added");
    setShowForm(false);
    setForm({ bank_name: "", account_number: "", account_holder: "", is_active: true });
    refetch();
  };

  const toggleActive = async (b: any) => {
    await base44.entities.BankAccount.update(b.id, { is_active: !b.is_active });
    await logAudit("BANK_ACCOUNT_TOGGLED", b.id, "BankAccount", { is_active: !b.is_active }, "Admin");
    toast.success(b.is_active ? "Deactivated" : "Activated");
    refetch();
  };

  const remove = async (id: string) => {
    if (!confirm("Permanently remove this bank account?")) return;
    await base44.entities.BankAccount.delete(id);
    await logAudit("BANK_ACCOUNT_DELETED", id, "BankAccount", null, "Admin");
    toast.success("Bank account removed");
    refetch();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold">Bank Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage disbursement destination accounts.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "Add account"}
        </Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <h3 className="font-heading font-semibold mb-4">New bank account</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Bank name *</label>
              <Input
                placeholder="e.g. Zenith Bank"
                value={form.bank_name}
                onChange={e => setForm({ ...form, bank_name: e.target.value })}
              />
              {errors.bank_name && <div className="text-xs text-destructive mt-1">{errors.bank_name}</div>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Account number *</label>
              <Input
                placeholder="10-digit NUBAN"
                maxLength={10}
                value={form.account_number}
                onChange={e => setForm({ ...form, account_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              />
              {errors.account_number && <div className="text-xs text-destructive mt-1">{errors.account_number}</div>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Account holder *</label>
              <Input
                placeholder="e.g. MAPOLY Bursary"
                value={form.account_holder}
                onChange={e => setForm({ ...form, account_holder: e.target.value })}
              />
              {errors.account_holder && <div className="text-xs text-destructive mt-1">{errors.account_holder}</div>}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={submit}>Save account</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((b: any) => (
          <Card key={b.id} className={`p-5 transition-opacity ${!b.is_active ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3 text-primary shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-2">
                  {b.bank_name}
                  {!b.is_active && <span className="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Inactive</span>}
                </div>
                <div className="text-sm text-muted-foreground font-mono">{b.account_number}</div>
                <div className="text-sm text-muted-foreground">{b.account_holder}</div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => toggleActive(b)}
                  className="p-2 rounded-lg hover:bg-muted"
                  title={b.is_active ? "Deactivate" : "Activate"}
                >
                  {b.is_active ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                </button>
                <button onClick={() => remove(b.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" title="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <div className="md:col-span-2 py-12 text-center text-muted-foreground text-sm">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No bank accounts configured yet.
          </div>
        )}
      </div>
    </div>
  );
}
