import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Heart, Shield, Users, TrendingUp, ArrowRight, GraduationCap, CheckCircle2, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatNaira, timeAgo } from "@/lib/formatters";
import { Button, ProgressBar, StatCard, Card, EmptyState } from "@/components/shared";

export default function Home() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [donations, setDonations] = useState<any[]>([]);
  const [stats, setStats] = useState({ raised: 0, students: 0, donors: 0 });

  useEffect(() => {
    (async () => {
      const c = await base44.entities.Campaign.filter({ is_public: true, status: "ACTIVE" }, "-created_date", 6);
      setCampaigns(c);
      const d = await base44.entities.Donation.filter({ payment_status: "SUCCESS" }, "-created_date", 15);
      setDonations(d);
      const allC = await base44.entities.Campaign.list();
      const raised = allC.reduce((s, x) => s + (x.raised_amount || 0), 0);
      setStats({
        raised,
        students: new Set(allC.map(c => c.student_profile_id)).size,
        donors: (await base44.entities.Donation.filter({ payment_status: "SUCCESS" })).length,
      });
    })();
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary-dark to-primary-dark text-white">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)",
          backgroundSize: "50px 50px"
        }} />
        <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-xs font-medium mb-4">
              <Shield className="h-3.5 w-3.5 text-secondary" />
              Verified against institutional records
            </div>
            <h1 className="font-heading text-4xl md:text-6xl font-bold leading-tight">
              Fund a student.<br />
              <span className="text-secondary">Change a future.</span>
            </h1>
            <p className="mt-5 text-lg text-white/85 max-w-lg">
              MapFund bridges the gap between MAPOLY students in need and donors who care.
              Transparent, verified, and secure.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/campaigns">
                <Button size="lg" variant="secondary" className="gap-2">
                  <Heart className="h-4 w-4" /> Donate now
                </Button>
              </Link>
              <Link to="/register">
                <Button size="lg" variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                  Apply for Funding <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-white/80">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-secondary" /> Multi-stage review</div>
              <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-secondary" /> Privacy-first</div>
              <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-secondary" /> Live tracking</div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="hidden md:block">
            <div className="rounded-2xl bg-white/10 backdrop-blur-lg border border-white/20 p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-lg bg-secondary p-2 text-primary-dark"><GraduationCap className="h-5 w-5" /></div>
                <div>
                  <div className="font-heading font-semibold">Live impact</div>
                  <div className="text-xs text-white/70">Updated in real-time</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/10 p-4"><div className="text-2xl font-heading font-bold text-secondary">{formatNaira(stats.raised)}</div><div className="text-xs text-white/70 mt-1">Total raised</div></div>
                <div className="rounded-xl bg-white/10 p-4"><div className="text-2xl font-heading font-bold text-secondary">{stats.students}+</div><div className="text-xs text-white/70 mt-1">Students helped</div></div>
                <div className="rounded-xl bg-white/10 p-4"><div className="text-2xl font-heading font-bold text-secondary">{stats.donors}</div><div className="text-xs text-white/70 mt-1">Donations</div></div>
                <div className="rounded-xl bg-white/10 p-4"><div className="text-2xl font-heading font-bold text-secondary">100%</div><div className="text-xs text-white/70 mt-1">Transparent</div></div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Donation ticker */}
      {donations.length > 0 && (
        <div className="bg-secondary/20 border-y border-secondary/30 overflow-hidden py-2">
          <div className="flex whitespace-nowrap ticker-item">
            {donations.concat(donations).map((d, i) => (
              <span key={i} className="mx-8 text-sm">
                <span className="font-semibold text-primary">{formatNaira(d.amount)}</span>{" "}
                from {d.is_anonymous ? "Anonymous" : d.donor_name} • {timeAgo(d.created_date)} 💚
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid gap-5 md:grid-cols-4">
          <StatCard label="Total Raised" value={formatNaira(stats.raised)} icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label="Active Campaigns" value={campaigns.length} icon={<Heart className="h-5 w-5" />} accent="secondary" />
          <StatCard label="Students Funded" value={stats.students} icon={<GraduationCap className="h-5 w-5" />} accent="success" />
          <StatCard label="Total Donors" value={stats.donors} icon={<Users className="h-5 w-5" />} />
        </div>
      </section>

      {/* Featured Campaigns */}
      <section className="mx-auto max-w-7xl px-4 pb-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-heading text-3xl font-bold">Featured Campaigns</h2>
            <p className="text-muted-foreground mt-1">Real students. Verified needs. Every naira counted.</p>
          </div>
          <Link to="/campaigns" className="text-primary text-sm font-medium hover:underline hidden sm:block">
            View all →
          </Link>
        </div>
        {campaigns.length === 0 ? (
          <EmptyState
            icon={<Heart className="h-10 w-10" />}
            title="No campaigns yet"
            description="Approved MAPOLY student campaigns will appear here. Be the first to apply for funding!"
            action={<Link to="/register"><Button>Apply for Funding</Button></Link>}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.slice(0, 3).map(c => (
              <Link key={c.id} to={`/campaigns/${c.id}`}>
                <Card className="h-full hover:shadow-lg transition-all hover:-translate-y-0.5 overflow-hidden">
                  <div className="h-40 bg-gradient-to-br from-primary/20 to-secondary/30 flex items-center justify-center">
                    <GraduationCap className="h-16 w-16 text-primary/60" />
                  </div>
                  <div className="p-5">
                    <div className="flex gap-2 mb-2">
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">{c.category}</span>
                      <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs">{c.department}</span>
                    </div>
                    <h3 className="font-heading font-semibold text-lg line-clamp-2 mb-2">{c.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{c.description}</p>
                    <ProgressBar value={c.raised_amount || 0} goal={c.goal_amount} />
                    <div className="mt-3 text-xs text-muted-foreground">{c.donor_count || 0} donors</div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="bg-muted/50 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="font-heading text-3xl font-bold text-center mb-10">How MapFund Works</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { i: 1, title: "Student applies", desc: "Complete a verified profile with school documents.", icon: GraduationCap },
              { i: 2, title: "Admin verifies", desc: "Multi-stage identity + need review against institution records.", icon: Shield },
              { i: 3, title: "Community funds", desc: "Approved campaigns go live; donors give with full transparency.", icon: Heart },
            ].map(s => (
              <div key={s.i} className="rounded-xl border border-border bg-card p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <s.icon className="h-6 w-6" />
                </div>
                <div className="text-xs font-bold text-secondary uppercase tracking-wider">Step {s.i}</div>
                <h3 className="font-heading font-semibold text-lg mt-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground mt-2">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
