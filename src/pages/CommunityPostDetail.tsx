import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button, Card, Textarea } from "@/components/shared";
import { timeAgo } from "@/lib/formatters";
import { useAuth } from "@/lib/AuthContext";

export default function CommunityPostDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [anon, setAnon] = useState(false);

  const load = async () => {
    if (!id) return;
    setPost(await base44.entities.CommunityPost.get(id));
    setComments(await base44.entities.CommunityComment.filter({ post_id: id }, "-created_date"));
  };
  useEffect(() => { load(); }, [id]);

  const submit = async () => {
    if (!content.trim() || !id) return;
    await base44.entities.CommunityComment.create({
      post_id: id, content,
      author_name: anon ? "Anonymous" : (user?.full_name || "Anonymous"),
      is_anonymous: anon,
    });
    if (post) await base44.entities.CommunityPost.update(post.id, { comment_count: (post.comment_count || 0) + 1 });
    setContent(""); toast.success("Comment posted");
    load();
  };

  if (!post) return <div className="p-10 text-center">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/community" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to community
      </Link>
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="font-medium">{post.author_name}</div>
            <div className="text-xs text-muted-foreground">{timeAgo(post.created_date)}</div>
          </div>
          <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">{post.category}</span>
        </div>
        <p className="leading-relaxed whitespace-pre-line">{post.content}</p>
      </Card>

      <div className="mt-6">
        <h2 className="font-heading font-semibold mb-3 flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Comments ({comments.length})</h2>
        <Card className="p-4 mb-4">
          <Textarea placeholder="Add a supportive comment…" value={content} onChange={e => setContent(e.target.value)} className="min-h-[80px]" />
          <div className="mt-3 flex justify-between items-center">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} className="rounded" />
              Post anonymously
            </label>
            <Button onClick={submit}>Post comment</Button>
          </div>
        </Card>
        <div className="space-y-3">
          {comments.map(c => (
            <Card key={c.id} className="p-4">
              <div className="text-sm font-medium">{c.author_name}</div>
              <div className="text-xs text-muted-foreground mb-2">{timeAgo(c.created_date)}</div>
              <p className="text-sm">{c.content}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
