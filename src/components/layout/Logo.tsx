type LogoProps = {
  className?: string;
  iconOnly?: boolean;
};

/**
 * Bold zigzag "Z" mark on a rounded badge — reads as the Z of "Zafrul" and,
 * via its stacked strokes, nods to "TechStack". Kept to a single stroke
 * path with no gradients/defs so it's safe to render multiple times on one
 * page (Navbar + Footer) without SVG id collisions. The favicon/apple-icon/
 * OG image (src/app/icon.tsx etc.) reuse this same path at larger sizes
 * with a gradient background — keep them in sync if this changes.
 */
export default function Logo({ className = "", iconOnly = false }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="100" height="100" rx="24" fill="#1d4ed8" />
        <path
          d="M28 28H72L28 72H72"
          stroke="white"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {!iconOnly && (
        <span className="text-xl font-bold tracking-tight text-slate-900">
          Zafrul <span className="text-blue-600">TechStack</span>
        </span>
      )}
    </span>
  );
}
