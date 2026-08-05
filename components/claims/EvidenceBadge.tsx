import { cn } from "@/lib/utils";

export type EvidenceGrade = "A" | "B" | "C" | "D" | "F";

interface EvidenceBadgeProps {
  confidence: number;
  evidenceCount?: number;
  hasContradiction?: boolean;
  methodologyScore?: number | null;
  className?: string;
}

function computeGrade(
  confidence: number,
  evidenceCount: number,
  hasContradiction: boolean,
  methodologyScore: number | null,
): EvidenceGrade {
  let score = confidence * 100;
  score += Math.min(20, evidenceCount * 5);
  if (methodologyScore !== null && methodologyScore !== undefined) {
    score = (score + methodologyScore) / 2;
  }
  if (hasContradiction) score -= 25;
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

const GRADE_STYLES: Record<EvidenceGrade, string> = {
  A: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
  B: "border-blue-500/40 text-blue-400 bg-blue-500/10",
  C: "border-amber-500/40 text-amber-400 bg-amber-500/10",
  D: "border-orange-500/40 text-orange-400 bg-orange-500/10",
  F: "border-red-500/40 text-red-400 bg-red-500/10",
};

const GRADE_LABELS: Record<EvidenceGrade, string> = {
  A: "Strong evidence",
  B: "Moderate evidence",
  C: "Limited evidence",
  D: "Weak evidence",
  F: "Unsupported",
};

export function EvidenceBadge({
  confidence,
  evidenceCount = 0,
  hasContradiction = false,
  methodologyScore = null,
  className,
}: EvidenceBadgeProps) {
  const grade = computeGrade(confidence, evidenceCount, hasContradiction, methodologyScore);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border",
        GRADE_STYLES[grade],
        className,
      )}
      title={GRADE_LABELS[grade]}
    >
      <span className="font-bold">{grade}</span>
      <span className="opacity-60 hidden sm:inline">{GRADE_LABELS[grade]}</span>
    </span>
  );
}
