/**
 * MeanderDivider — Greek meander (Greek key) rule, matching the motif used
 * in the cinematic intro (ManifestoCrawl). Pure SVG, server-safe.
 */

export function MeanderDivider({
  width = 160,
  className = "",
}: {
  width?: number;
  className?: string;
}) {
  return (
    <svg
      className={`nx-meander-divider ${className}`}
      viewBox="0 0 160 8"
      preserveAspectRatio="none"
      width={width}
      aria-hidden="true"
    >
      <path
        d="M0,4 L20,4 L20,1 L8,1 L8,7 L32,7 L32,0 L44,0 L44,4 L60,4 L60,1 L72,1 L72,7 L96,7 L96,0 L108,0 L108,4 L124,4 L124,1 L136,1 L136,7 L160,7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}
