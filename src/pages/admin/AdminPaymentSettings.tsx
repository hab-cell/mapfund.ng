import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Landmark, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, Input, Textarea } from "@/components/shared";
import { getPaymentSettings } from "@/lib/payments";
import { logAudit } from "@/lib/notifyStudent";

export default function AdminPaymentSettings() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPaymentSettings().then(setSettings);
  }, []);

  const save = async () => {
    if (!settings.bank_name || !settings.account_name || !settings.account_number) {
      return toast.error("Bank name, account name and account number are required");
    }
    setSaving(true);
    if (settings.id) await base44.entities.PaymentSettings.update(settings.id, settings);
    else {
      const created = await base44.entities.PaymentSettings.create({ ...settings, is_active: true });
      setSettings(created);
    }
    await logAudit("PAYMENT_SETTINGS_UPDATED", settings.id, "PaymentSettings", {
      bank_name: settings.bank_name, account_number: settings.account_number,
    }, "Admin");
    queryClient.invalidateQueries();
    toast.success("Payment settings saved & synced to all admins");
    setSaving(false);
  };

  if (!settings) return <div className="p-10 text-center text-muted-foreground">Loading settings…</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-bold flex items-center gap-2">
          <Landmark className="h-8 w-8 text-primary" /> Payment Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure the bank account donors transfer to. Changes apply to all new donations immediately.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Bank name *</label>
          <Input value={settings.bank_name} onChange={e => setSettings({ ...settings, bank_name: e.target.value })} placeholder="e.g. Zenith Bank" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Account name *</label>
          <Input value={settings.account_name} onChange={e => setSettings({ ...settings, account_name: e.target.value })} placeholder="e.g. MapFund — MAPOLY Student Fund" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Account number *</label>
          <Input value={settings.account_number} onChange={e => setSettings({ ...settings, account_number: e.target.value.replace(/\D/g, "") })} placeholder="10 digits" maxLength={10} />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Payment instructions</label>
          <Textarea
            value={settings.instructions}
            onChange={e => setSettings({ ...settings, instructions: e.target.value })}
            placeholder="Shown to donors alongside their unique payment reference"
            className="min-h-[90px]"
          />
          <div className="text-xs text-muted-foreground mt-1">
            Donors see this on the bank-transfer instructions page.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Verification window (days)</label>
            <Input
              type="number" min={1} max={30}
              value={settings.verification_window_days}
              onChange={e => setSettings({ ...settings, verification_window_days: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Max receipt size (MB)</label>
            <Input
              type="number" min={1} max={25}
              value={settings.max_size_mb}
              onChange={e => setSettings({ ...settings, max_size_mb: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Status</label>
            <select
              value={settings.is_active ? "active" : "inactive"}
              onChange={e => setSettings({ ...settings, is_active: e.target.value === "active" })}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="active">Active (accepting donations)</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span className="text-muted-foreground">
            Only include the MapFund fundraising account here. Donors will be shown these exact details — changes are reflected instantly across all admin sessions.
          </span>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
