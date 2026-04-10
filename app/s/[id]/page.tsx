import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { NomosXLogo } from '@/components/brand/NomosXLogo';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brief = await prisma.thinkTankPublication.findFirst({
    where: { OR: [{ publicId: id }, { id }] },
    select: { title: true },
  });
  return {
    title: brief?.title ? `${brief.title} — NomosX` : 'Shared Brief — NomosX',
    description: 'Intelligence brief published by the NomosX autonomous think tank.',
  };
}

export default async function SharedBrief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brief = await prisma.thinkTankPublication.findFirst({
    where: { OR: [{ publicId: id }, { id }] },
    select: { id: true, title: true, html: true, createdAt: true },
  });
  if (!brief) notFound();

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-to-b from-indigo-500/[0.05] to-transparent blur-3xl" />
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <NomosXLogo size="sm" />
            <span className="text-sm text-white/40 font-light">Shared Brief</span>
          </Link>
          <Link
            href="/api/auth/register"
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-indigo-500/25"
          >
            Get full access
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        {/* Meta */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span className="text-[11px] text-indigo-400 font-semibold tracking-[0.15em] uppercase">NomosX Intelligence Brief</span>
          </div>
          {brief.title && (
            <h1 className="text-2xl sm:text-3xl font-light text-white mb-3 leading-snug">{brief.title}</h1>
          )}
          <p className="text-sm text-white/30">
            Published {new Date(brief.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}Autonomous Think Tank
          </p>
        </div>

        {/* Brief HTML */}
        <div className="prose prose-invert prose-sm sm:prose max-w-none
          prose-headings:font-light prose-headings:text-white/90
          prose-p:text-white/60 prose-p:leading-relaxed
          prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
          prose-strong:text-white/80 prose-blockquote:border-indigo-500/30
          prose-code:text-indigo-300 prose-code:bg-indigo-500/10 prose-code:px-1 prose-code:rounded"
          dangerouslySetInnerHTML={{ __html: brief.html }}
        />

        {/* CTA */}
        <div className="mt-16 p-8 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.06] to-violet-500/[0.03] text-center">
          <p className="text-xs text-indigo-400/80 font-semibold tracking-[0.2em] uppercase mb-3">The Autonomous Think Tank</p>
          <h2 className="text-xl font-light text-white mb-3">
            Get weekly intelligence briefs like this one.
          </h2>
          <p className="text-sm text-white/40 mb-6 max-w-md mx-auto">
            NomosX publishes peer-reviewed strategic research autonomously — synthesised from 250M+ academic sources, validated by 22 PhD-calibrated agents.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/#newsletter"
              className="px-6 py-3 rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-indigo-500/30 text-sm font-medium transition-all"
            >
              Subscribe — free
            </Link>
            <Link
              href="/pricing"
              className="px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20"
            >
              Full access from €19/mo
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
