import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, GraduationCap, Filter, Heart } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card, EmptyState, Input, LoadingCards, ProgressBar, Select } from "@/components/shared";
import { daysLeft } from "@/lib/formatters";

const CATEGORIES = ["ALL", "TUITION", "ACCOMMODATION", "FEEDING", "MEDICAL", "BOOKS", "PROJECT", "OTHER"];

export default function Campaigns() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("ALL");
  const [dept, setDept] = useState("ALL");

  useEffect(() => {
    (async () => {
      const c = await base44.entities.Campaign.filter({ is_public: true, status: "ACTIVE" }, "-created_date");
      setItems(c);
      setLoading(false);
    })();
  }, []);

  const departments = useMemo(() => ["ALL", ...Array.from(new Set(items.map(i => i.department).filter(Boolean)))], [items]);

  const filtered = useMemo(() => items.filter(i =>
    (cat === "ALL" || i.category === cat) &&
    (dept === "ALL" || i.department === dept) &&
    (search === "" || i.title.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()))
  ), [items, cat, dept, search]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Browse Campaigns</h1>
        <p className="text-muted-foreground mt-2">Every student here has been verified against institutional records.</p>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search campaigns…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={cat} onChange={e => setCat(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c === "ALL" ? "All Categories" : c}</option>)}
          </Select>
          <Select value={dept} onChange={e => setDept(e.target.value)}>
            {departments.map(d => <option key={d} value={d}>{d === "ALL" ? "All Departments" : d}</option>)}
          </Select>
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-2">
            <Filter className="h-4 w-4" /> {filtered.length} result{filtered.length !== 1 && "s"}
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingCards count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-10 w-10" />}
          title="No campaigns match your filters"
          description="Try clearing filters or check back soon — new campaigns are approved weekly."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => (
            <Link key={c.id} to={`/campaigns/${c.id}`}>
              <Card className="h-full hover:shadow-lg transition-all hover:-translate-y-0.5 overflow-hidden group">
                <div className="h-40 bg-gradient-to-br from-primary/20 to-secondary/30 flex items-center justify-center relative">
                  <GraduationCap className="h-16 w-16 text-primary/60 group-hover:scale-110 transition-transform" />
                  {c.is_featured && (
                    <div className="absolute top-2 right-2 rounded-full bg-secondary text-primary-dark px-2 py-0.5 text-xs font-bold">FEATURED</div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex gap-2 mb-2 flex-wrap">
                    <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">{c.category}</span>
                    <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs">Level {c.level}</span>
                  </div>
                  <h3 className="font-heading font-semibold text-lg line-clamp-2 mb-1">{c.title}</h3>
                  <p className="text-xs text-muted-foreground mb-3">{c.department}</p>
                  <ProgressBar value={c.raised_amount || 0} goal={c.goal_amount} />
                  <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                    <span>{c.donor_count || 0} donors</span>
                    <span>{daysLeft(c.deadline)} days left</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
