
"use client";
import React from 'react';
import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card,CardContent,CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import DomainSelector from '@/components/DomainSelector';
import { getDomainsBySlugs } from '@/lib/domains';
import { Search,Filter,ArrowUpDown,Clock,TrendingUp,Award,Layers,Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type Result = { 
  id: string; 
  title: string; 
  year?: number | null; 
  qualityScore?: number | null; 
  noveltyScore?: number | null;
  authors?: string[]; 
  provider?: string; 
  createdAt?: string;
  domains?: Array<{
    slug: string;
    name: string;
    icon: string;
    color: string;
    score: number;
  }>;
};

type SortMode = "relevance" | "quality" | "novelty" | "date";

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  
  // Filters
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [minQuality, setMinQuality] = useState<number>(0);
  const [yearRange, setYearRange] = useState<{ min?: number; max?: number }>({});
  
  // Sort
  const [sortMode, setSortMode] = useState<SortMode>("relevance");

  function handleProposeToThinkTank() {
    // Propose the topic to Think Tank via Studio
    const question = `Deep analysis on: ${q}`;
    router.push(`/studio?q=${encodeURIComponent(question)}`);
  }

  async function run() {
    setLoading(true);
    
    // Build query params
    const params = new URLSearchParams({ q });
    if (selectedDomains.length > 0) {
      params.set("domains", selectedDomains.join(","));
    }
    
    const r = await fetch(`/api/search?${params}`);
    const d = await r.json();
    setResults(d.results || []);
    setLoading(false);
  }

  // Apply filters and sort
  const filteredAndSorted = results
    .filter((r) => {
      if (providerFilter && r.provider !== providerFilter) return false;
      if (minQuality > 0 && (r.qualityScore || 0) < minQuality) return false;
      if (yearRange.min && (r.year || 0) < yearRange.min) return false;
      if (yearRange.max && (r.year || 0) > yearRange.max) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortMode === "quality") {
        return (b.qualityScore || 0) - (a.qualityScore || 0);
      }
      if (sortMode === "novelty") {
        return (b.noveltyScore || 0) - (a.noveltyScore || 0);
      }
      if (sortMode === "date") {
        return (b.year || 0) - (a.year || 0);
      }
      return 0; // relevance (default order from API)
    });

  // Extract unique providers
  const providers = Array.from(new Set(results.map((r) => r.provider).filter(Boolean)));

  return (
    <Shell>
      {/* Hero Premium avec glow effect */}
      <div className="mb-20">
        <div className="flex items-center justify-between flex-wrap gap-6">
          <div>
            <div className="flex items-center gap-4 mb-6">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-accent/40 via-indigo-500/40 to-accent/40 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                <div className="relative p-3 rounded-2xl bg-accent/10 border border-accent/20 transition-transform group-hover:scale-105">
                  <Search size={32} className="text-accent" strokeWidth={1.5} />
                </div>
              </div>
              <h1 className="text-7xl font-bold tracking-tight">Search</h1>
            </div>
            <p className="text-4xl text-muted leading-relaxed max-w-3xl mb-4">
              Hybrid search (lexical + semantic) across 28M+ academic sources with advanced domain filters
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="ai" className="px-3 py-1">
              <Layers size={14} className="mr-1" strokeWidth={1.5} />
              Hybrid
            </Badge>
            <Badge variant="default" className="px-3 py-1">
              <Filter size={14} className="mr-1" strokeWidth={1.5} />
              8 domains
            </Badge>
            <Badge variant="default" className="px-3 py-1">
              <ArrowUpDown size={14} className="mr-1" strokeWidth={1.5} />
              4 sorts
            </Badge>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-6 flex gap-3">
        <Input 
          value={q} 
          onChange={(e) => setQ(e.target.value)} 
          placeholder="e.g. inflation expectations euro area"
          onKeyDown={(e) => e.key === "Enter" && q && !loading && run()}
        />
        <Button onClick={run} disabled={!q || loading} variant="ai">
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      {/* Domain selector */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={16} className="text-muted" />
          <span className="text-sm text-muted">Filter by domain (optional)</span>
        </div>
        <DomainSelector
          selected={selectedDomains}
          onChange={setSelectedDomains}
          mode="multiple"
          compact
        />
        {selectedDomains.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted">Selected:</span>
            {getDomainsBySlugs(selectedDomains).map((domain) => {
              const Icon = domain.icon;
              return (
                <Badge key={domain.slug} variant="ai">
                  <Icon size={12} />
                  {domain.name}
                </Badge>
              );
            })}
            <button
              onClick={() => setSelectedDomains([])}
              className="text-xs text-muted hover:text-text ml-2 transition-all duration-200"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Results count + Action */}
      {results.length > 0 && (
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <Badge variant="ai">
            {filteredAndSorted.length} result{filteredAndSorted.length > 1 ? "s" : ""}
          </Badge>
          
          <Button
            variant="ai"
            size="sm"
            onClick={handleProposeToThinkTank}
            disabled={filteredAndSorted.length === 0}
          >
            <Sparkles size={16} />
            Propose to Think Tank
          </Button>
        </div>
      )}

      {/* Filters and sort */}
      {results.length > 0 && (
        <div className="mb-6 space-y-4">
          {/* Sort */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpDown size={16} className="text-muted" />
              <span className="text-sm text-muted">Sort by</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { id: "relevance", label: "Relevance", icon: Search },
                { id: "quality", label: "Quality", icon: Award },
                { id: "novelty", label: "Novelty", icon: TrendingUp },
                { id: "date", label: "Date", icon: Clock },
              ].map((sort) => (
                <button
                  key={sort.id}
                  onClick={() => setSortMode(sort.id as SortMode)}
                  className={`px-4 py-2 rounded-2xl border transition-all inline-flex items-center gap-2 ${
                    sortMode === sort.id
                      ? "border-accent/40 text-accent bg-accent/10"
                      : "border-border text-muted bg-panel hover:bg-panel2"
                  }`}
                >
                  <sort.icon size={14} />
                  {sort.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Filter size={16} className="text-muted" />
              <span className="text-sm text-muted">Filtres</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Provider filter */}
              <button
                onClick={() => setProviderFilter(null)}
                className={`px-4 py-2 rounded-2xl border transition-all ${
                  !providerFilter
                    ? "border-accent/40 text-accent bg-accent/10"
                    : "border-border text-muted bg-panel hover:bg-panel2"
                }`}
              >
                Tous ({results.length})
              </button>
              {providers.map((provider) => (
                <button
                  key={provider}
                  onClick={() => setProviderFilter(provider as string)}
                  className={`px-4 py-2 rounded-2xl border transition-all ${
                    providerFilter === provider
                      ? "border-accent/40 text-accent bg-accent/10"
                      : "border-border text-muted bg-panel hover:bg-panel2"
                  }`}
                >
                  {provider} ({results.filter((r) => r.provider === provider).length})
                </button>
              ))}

              {/* Quality filter */}
              <select
                value={minQuality}
                onChange={(e) => setMinQuality(Number(e.target.value))}
                className="px-4 py-2 rounded-2xl border border-border bg-panel text-text text-sm"
              >
                <option value={0}>Qualité: Tous</option>
                <option value={50}>Qualité ≥ 50</option>
                <option value={70}>Qualité ≥ 70</option>
                <option value={85}>Qualité ≥ 85</option>
              </select>

              {/* Year filter */}
              <select
                value={yearRange.min || ""}
                onChange={(e) =>
                  setYearRange({ ...yearRange, min: e.target.value ? Number(e.target.value) : undefined })
                }
                className="px-4 py-2 rounded-2xl border border-border bg-panel text-text text-sm"
              >
                <option value="">Année min: Toutes</option>
                <option value={2024}>≥ 2024</option>
                <option value={2023}>≥ 2023</option>
                <option value={2020}>≥ 2020</option>
                <option value={2015}>≥ 2015</option>
              </select>

              {/* Reset filters */}
              {(selectedDomains.length > 0 || providerFilter || minQuality > 0 || yearRange.min || yearRange.max) && (
                <button
                  onClick={() => {
                    setSelectedDomains([]);
                    setProviderFilter(null);
                    setMinQuality(0);
                    setYearRange({});
                  }}
                  className="px-4 py-2 rounded-2xl border border-border text-muted bg-panel hover:bg-panel2 transition-all"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-full mt-3" />
              <Skeleton className="h-4 w-2/3 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6 mt-2" />
            </CardContent>
          </Card>
        ))}

        {!loading && filteredAndSorted.map((r, index) => (
          <Card 
            key={r.id} 
            hoverable
            className="animate-spring-in"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge>{r.provider ?? "db"}</Badge>
                <div className="flex gap-2">
                  <Badge variant={r.qualityScore && r.qualityScore > 70 ? "success" : "default"}>
                    QS {r.qualityScore ?? 0}
                  </Badge>
                  {r.noveltyScore && r.noveltyScore > 0 && (
                    <Badge variant="ai">
                      NS {r.noveltyScore}
                    </Badge>
                  )}
                </div>
              </div>
              <h3 className="mt-3 font-semibold leading-snug group-hover:text-accent transition-colors">
                {r.title}
              </h3>
              <div className="flex items-center gap-3 text-xs text-muted mt-2">
                {r.year && <span>{r.year}</span>}
                {r.authors && r.authors.length > 0 && (
                  <span>{r.authors.slice(0, 2).join(", ")}</span>
                )}
              </div>
              {r.domains && r.domains.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-3">
                  {r.domains.slice(0, 3).map((domain) => {
                    const DomainIcon = getDomainsBySlugs([domain.slug])[0]?.icon;
                    return (
                      <Badge 
                        key={domain.slug} 
                        variant="default"
                        style={{
                          backgroundColor: `${domain.color}15`,
                          borderColor: `${domain.color}40`,
                          color: domain.color,
                        }}
                      >
                        {DomainIcon && <DomainIcon size={10} />}
                        {domain.name}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => (window.location.href = `/sources/${encodeURIComponent(r.id)}`)}
              >
                Open source
              </Button>
            </CardContent>
          </Card>
        ))}

        {!loading && filteredAndSorted.length === 0 && results.length > 0 && (
          <div className="col-span-full">
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted">No results with these filters</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!loading && results.length === 0 && q && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search size={48} className="mx-auto mb-4 text-muted opacity-50" />
            <h3 className="text-4xl font-semibold mb-2">No results</h3>
            <p className="text-sm text-muted">
              Try a different query or run an ingestion to populate the database.
            </p>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}
