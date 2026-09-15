import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Wallet, Award, Repeat } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card, StatCard, StatusBadge, EmptyState, Input, Button } from "@/components/shared";
import { formatNaira, formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/AuthContext";
import { SUCCESS_STATUSES, DONATION_STATUS } from "@/lib/payments";

export default function DonorDashboard() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [donations, setDonations] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async (em: string) => {
    if (!em) return;
    const list = await base44.entities.Donation.filter({ donor_email: em }, "-created_date");
    setDonations(list);
    setLoaded(true);
  };
  useEffect(() => { if (email) load(email); }, []);

  const successful = donations.filter(d => SUCCESS_STATUSES.includes(d.payment_status as any));
  const total = successful.reduce((s, d) => s + d.amount, 0);
  const campaigns = new Set(successful.map(d => d.campaign_id)).size;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6">
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Donor Dashboard</h1>
        <p className="text-muted-foreground mt-2">Your generous history at a glance.</p>
      </div>

      {!loaded && (
        <Card className="p-6 mb-6">
          <label className="text-sm font-medium">Enter your donor email to view history</label>
          <div className="mt-2 flex gap-2">
            <Input placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            <Button onClick={() => load(email)}>Load</Button>
          </div>
        </Card>
      )}

      {loaded && (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <StatCard label="Total Given" value={formatNaira(total)} icon={<Heart className="h-5 w-5" />} />
            <StatCard label="Campaigns Supported" value={campaigns} icon={<Award className="h-5 w-5" />} accent="secondary" />
            <StatCard label="Donations" value={successful.length} icon={<Wallet className="h-5 w-5" />} accent="success" />
          </div>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border font-heading font-semibold">Donation history</div>
            {donations.length === 0 ? (
              <EmptyState title="No donations yet" description="When you donate to a campaign it will appear here." action={<Link to="/campaigns"><Button>Browse campaigns</Button></Link>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Reference</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donations.map(d => (
                      <tr key={d.id} className="border-t border-border">
                        <td className="px-4 py-3">{formatDate(d.created_date)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{d.payment_reference}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatNaira(d.amount)}</td>
                        <td className="px-4 py-3"><StatusBadge status={d.payment_status} /></td>
                        <td className="px-4 py-3 text-right">
                          {d.payment_status === DONATION_STATUS.PENDING_PAYMENT && (
                            <Link to={`/payment?campaign_id=${d.campaign_id}`} className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline">
                              <Repeat className="h-3 w-3" /> Complete
                            </Link>
                          )}
                          {[DONATION_STATUS.RECEIPT_UPLOADED, DONATION_STATUS.NEEDS_REVIEW].includes(d.payment_status) && (
                            <Link to={`/payment-status?ref=${d.payment_reference}`} className="text-warning inline-flex items-center gap-1 text-xs font-medium hover:underline">
                              Track
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
