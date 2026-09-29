/**
 * DomainCover — the domain's figure rendered as a topographic plate.
 *
 * The public-domain artwork is translated into the NomosX plate language
 * by scripts/cover-plates.py: iso-luminance contours of the smoothed
 * field trace the figure's forms — the cartography of the domain's
 * myth. One hue of ink per domain, calibrated per theme; heroes and
 * thumbnails render the same polylines at two sizes, raccord by
 * construction.
 *
 * Plain <img> over transparent webps — SSR-safe, zero client JS.
 * Domains without a resolved artwork fall back to the figureless
 * "nomos" field so every cover in a list shares the same texture.
 *
 * `animated` adds a moiré layer — a second copy of the plate drifting a
 * few pixels; the contour lines interfere and the field breathes.
 * Pure CSS, reduced-motion safe. Heroes/frontispieces only.
 */

import { cn } from "@/lib/utils";
import { plateCoverUrl, nomosPlateCover } from "@/lib/brand/domain-figures";

function PlateImg({
  src,
  dark,
  moire,
  objectPosition,
}: {
  src: string;
  dark?: boolean;
  moire?: boolean;
  objectPosition: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- static webps, no optimization needed */
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn(
        "h-full w-full object-cover transition-all duration-500 group-hover:scale-[1.03]",
        moire
          ? "nx-plate-moire opacity-40 mix-blend-multiply dark:mix-blend-screen"
          : "opacity-90 group-hover:opacity-100",
        dark ? "hidden dark:block" : moire ? "" : "dark:hidden",
        moire && !dark && "dark:hidden",
        moire && dark && "hidden dark:block"
      )}
      style={{ objectPosition }}
    />
  );
}

export function DomainCover({
  domain,
  domains,
  variant = "lg",
  animated = false,
  className,
  objectPosition = "center",
}: {
  /** Primary domain key/slug — falls back to the parent domain field. */
  domain?: string | null;
  /** Fallback keys tried in order when `domain` has no field (e.g. topics). */
  domains?: (string | null | undefined)[];
  /** "sm" renders the same contours at card scale — survives thin bands;
   *  "lg" keeps full detail for heroes and frontispieces. */
  variant?: "sm" | "lg";
  /** Live plate — moiré drift over the contour field, pure CSS,
   *  honors reduced-motion. Heroes/frontispieces only. */
  animated?: boolean;
  className?: string;
  /** Focal point for the cover crop — the landscape plate is composed
   *  for its band, so centre by default. */
  objectPosition?: string;
}) {
  const v = variant === "sm" ? "-sm" : "";
  const cover =
    plateCoverUrl(domain, v) ??
    (domains ?? []).map((k) => plateCoverUrl(k, v)).find(Boolean) ??
    nomosPlateCover(v);

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <PlateImg src={cover.light} objectPosition={objectPosition} />
      <PlateImg src={cover.dark} dark objectPosition={objectPosition} />
      {animated && (
        <>
          <PlateImg src={cover.light} moire objectPosition={objectPosition} />
          <PlateImg src={cover.dark} moire dark objectPosition={objectPosition} />
        </>
      )}
      {/* Engraved plate frame — hairline inset + soft vignette */}
      <div className="pointer-events-none absolute inset-2 border border-black/[0.10] dark:border-white/[0.10]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.04] via-transparent to-black/[0.06] dark:from-white/[0.04] dark:to-white/[0.06]" />
    </div>
  );
}
