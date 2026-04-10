
import Shell from '@/components/Shell';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/Badge';
import { Card,CardContent,CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const s = await prisma.source.findUnique({ 
    where: { id },
    include: { authors: { include: { author: true } } }
  });
  if (!s) return <Shell><h1 className="text-4xl">Source not found</h1></Shell>;

  return (
    <Shell>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-4xl font-semibold leading-tight">{s.title}</h1>
        <div className="flex gap-2"><Badge>{s.provider}</Badge><Badge>QS {s.qualityScore ?? 0}</Badge></div>
      </div>

      <p className="text-muted mt-3">{s.authors.map(sa => sa.author.name).join(", ") || "—"}</p>

      <div className="grid lg:grid-cols-3 gap-4 mt-8">
        <Card className="lg:col-span-2">
          <CardHeader><h2 className="text-4xl font-semibold">Abstract</h2></CardHeader>
          <CardContent><p className="text-sm text-muted whitespace-pre-wrap">{s.abstract ?? "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><h2 className="text-4xl font-semibold">Metadata</h2></CardHeader>
          <CardContent className="text-sm text-muted space-y-2">
            <div><span className="text-text">Year:</span> {s.year ?? "—"}</div>
            <div><span className="text-text">DOI:</span> {s.doi ?? "—"}</div>
            <div><span className="text-text">OA:</span> {s.oaStatus ?? "—"}</div>
            <div><span className="text-text">Citations:</span> {s.citationCount ?? 0}</div>
            <div><span className="text-text">PDF:</span> {s.pdfUrl ? "available" : "—"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex gap-2 flex-wrap">{(s.topics ?? []).slice(0, 12).map((t) => <Badge key={t}>{t}</Badge>)}</div>
      <div className="mt-8 flex gap-2">
        <a href="/brief"><Button>Generate brief</Button></a>
        <a href={s.url ?? "#"}><Button variant="ghost">Open source</Button></a>
      </div>
    </Shell>
  );
}
