import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Flag, AlertTriangle, ShieldCheck, Search, Eye, Sparkles, ArrowRight,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { fetchMapolyRoster } from "@/lib/supabase";
import { Button, Card, EmptyState, StatusBadge } from "@/components/shared";
import { formatNaira } from "@/lib/formatters";
import { toast } from "sonner";

type FlagEntry = {
  id: string;
  type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  app?: any;
  campaign?: any;
  profile?: any;
  reason: string;
};

export default function AdminFraudFlags() {
  const { data: apps = [] } = useQuery({
    queryKey: ["fraud-apps"],
    queryFn: () => base44.entities.FundingApplication.list(),
  });
  const { data: profiles } = useQuery({
    queryKey: ["fraud-profiles"],
    queryFn: () => base44.entities.StudentProfile.list(),
  });
  const { data: records } = useQuery({
    queryKey: ["fraud-records"],
    queryFn: async () => {
      // Primary source: Supabase MAPOLY Student roster
      try {
        const supabaseRoster = await fetchMapolyRoster();
        if (supabaseRoster.length) return supabaseRoster;
      } catch (err) {
        console.error("[MapFund] Supabase roster unavailable:", err);
      }
      // Fallback: local records
      return base44.entities.StudentRecord.list();
    },
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ["fraud-campaigns"],
    queryFn: () => base44.entities.Campaign.list(),
  });

  const flags: FlagEntry[] = useMemo(() => {
    const profileMap: Record<string, any> = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
    const result: FlagEntry[] = [];

    for (const a of apps) {
      const p = profileMap[a.student_profile_id];
      if (!p) continue;

      // No record match
      const match = (records || []).find(r => r.matric_number === p.matric_number);
      if (!match) {
        result.push({
          id: a.id + "_no_record", type: "NO_INSTITUTIONAL_RECORD",
          severity: "HIGH", app: a, profile: p,
          reason: `Matric number "${p.matric_number}" not found in StudentRecord roster. Possible identity fraud.`,
        });
      } else if (match.full_name?.toLowerCase() !== p.full_name?.toLowerCase()) {
        result.push({
          id: a.id + "_name", type: "NAME_MISMATCH",
          severity: "MEDIUM", app: a, profile: p,
          reason: `Profile name "${p.full_name}" differs from record "${match.full_name}".`,
        });
      }

      // Unusually high amount
      if (a.amount_needed > 1000000) {
        result.push({
          id: a.id + "_high_amt", type: "HIGH_AMOUNT",
          severity: "LOW", app: a, profile: p,
          reason: `Request of ${formatNaira(a.amount_needed)} exceeds the ₦1,000,000 threshold.`,
        });
      }

      // Duplicate matric check
      const sameMatric = apps.filter(x => {
        const pp = profileMap[x.student_profile_id];
        return pp && pp.matric_number === p.matric_number && x.id !== a.id;
      });
      if (sameMatric.length > 0) {
        result.push({
          id: a.id + "_dup", type: "DUPLICATE_MATRIC",
          severity: "HIGH", app: a, profile: p,
          reason: `Matric "${p.matric_number}" appears in ${sameMatric.length + 1} separate applications.`,
        });
      }
    }

    // Campaigns with suspicious donor patterns
    for (const c of campaigns) {
      if ((c.raised_amount || 0) > 0 && (c.donor_count || 0) <= 1) {
        const p = profileMap[c.student_profile_id];
        result.push({
          id: c.id + "_solo", type: "SINGLE_DONOR_HIGH_VALUE",
          severity: "LOW", campaign: c, profile: p,
          reason: `Campaign "${c.title}" has ${formatNaira(c.raised_amount || 0)} from only ${c.donor_count || 0} donor(s).`,
        });
      }
    }

    return result;
  }, [apps, profiles, records, campaigns]);

  const investigateLLM = async (f: FlagEntry) => {
    toast.loading("Running AI fraud analysis…", { id: "llm" });
    try {
      const { content } = await base44.integrations.InvokeLLM(
        `Analyze this potential fraud flag on MapFund (MAPOLY): Type=${f.type}, Severity=${f.severity}, Reason="${f.reason}". Return a brief risk assessment.`
      );
      toast.success(content.slice(0, 120) + "…", { id: "llm", duration: 6000 });
    } catch {
      toast.dismiss("llm");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-bold">Fraud Flags</h1>
        <p className="text-muted-foreground mt-1">
          Automatic detection of suspicious patterns — {flags.length} flag{flags.length !== 1 ? "s" : ""} found.
        </p>
      </div>

      {flags.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-10 w-10 text-success" />}
          title="All clear!"
          description="No suspicious activities detected across applications or campaigns."
        />
      ) : (
        <div className="space-y-3">
          {flags.map(f => {
            const SeverityIcon = f.severity === "HIGH" ? AlertTriangle : Flag;
            const severityColor = f.severity === "HIGH" ? "bg-destructive/15 text-destructive" : f.severity === "MEDIUM" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground";
            return (
              <Card key={f.id} className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`rounded-lg p-2.5 shrink-0 ${severityColor}`}>
                    <SeverityIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{f.type.replace(/_/g, " ")}</span>
                      <StatusBadge status={f.severity} />
                    </div>
                    <p className="text-sm text-muted-foreground">{f.reason}</p>
                    {(f.profile || f.app) && (
                      <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-3">
                        {f.profile && <span><Search className="inline h-3 w-3 mr-1" />{f.profile.full_name} ({f.profile.matric_number})</span>}
                        {f.app && <span>• {f.app.purpose} • {formatNaira(f.app.amount_needed)}</span>}
                        {f.campaign && <span>• Campaign: {f.campaign.title}</span>}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {f.app && (
                        <Link to={`/admin/applications/${f.app.id}`}>
                          <Button size="sm" variant="outline"><Eye className="h-3.5 w-3.5" /> Investigate <ArrowRight className="h-3.5 w-3.5" /></Button>
                        </Link>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => investigateLLM(f)}>
                        <Sparkles className="h-3.5 w-3.5" /> AI analysis
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
