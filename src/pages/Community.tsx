import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Plus, Lock as LockIcon, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, EmptyState, Select, Textarea } from "@/components/shared";
import { timeAgo } from "@/lib/formatters";
import { useAuth } from "@/lib/AuthContext";

const CATS = ["SUPPORT", "GRATITUDE", "RESOURCES", "QUESTION", "OTHER"];

export default function Community() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("SUPPORT");
  const [anon, setAnon] = useState(false);
  const [silent, setSilent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => base44.entities.CommunityPost.list("-created_date").then(items => setPosts(items.filter(p => !p.is_silent_request)));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!content.trim()) return toast.error("Please write something");
    setSubmitting(true);
    await base44.entities.CommunityPost.create({
      content, category, is_anonymous: anon, is_silent_request: silent,
      author_name: anon ? "Anonymous" : (user?.full_name || "Anonymous"),
      comment_count: 0,
    });
    setSubmitting(false);
    setContent(""); setShowNew(false); setAnon(false); setSilent(false);
    toast.success(silent ? "Silent request sent to admins" : "Posted to community!");
    load();
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold">Community Hub</h1>
          <p className="text-muted-foreground mt-2">A safe space for students to share, seek help, and support each other.</p>
        </div>
        <Button onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4" /> New Post</Button>
      </div>

      {showNew && (
        <Card className="p-5 mb-6">
          <Textarea placeholder="Share your thoughts, seek support, or offer resources…" value={content} onChange={e => setContent(e.target.value)} />
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
            <Select value={category} onChange={e => setCategory(e.target.value)}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </Select>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} className="rounded" />
                <EyeOff className="h-3.5 w-3.5" /> Anonymous
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={silent} onChange={e => setSilent(e.target.checked)} className="rounded" />
                <LockIcon className="h-3.5 w-3.5" /> Silent (admin-only)
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? "Posting…" : "Post"}</Button>
          </div>
        </Card>
      )}

      {posts.length === 0 ? (
        <EmptyState icon={<MessageSquare className="h-10 w-10" />} title="No posts yet" description="Be the first to start a conversation." />
      ) : (
        <div className="space-y-4">
          {posts.map(p => (
            <Link key={p.id} to={`/community/${p.id}`}>
              <Card className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-medium text-sm">{p.author_name}</div>
                    <div className="text-xs text-muted-foreground">{timeAgo(p.created_date)}</div>
                  </div>
                  <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">{p.category}</span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed">{p.content}</p>
                <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5" /> {p.comment_count || 0} comments
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
